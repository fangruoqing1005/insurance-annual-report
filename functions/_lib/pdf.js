// PDF 文本/坐标提取（pdfjs-dist 纯 JS，Cloudflare Workers 兼容）
// 对应手册 Step1（fitz get_text）与 4.3 坐标重建（get_text('words')）
// 注意：使用 pdfjs-dist 3.x（4.x 的 legacy 构建与 Cloudflare Pages 打包器 esbuild 不兼容，
//       会产生 "Cannot read properties of undefined (reading 'has')" 运行时错误）
import * as pdfjsNS from 'pdfjs-dist/legacy/build/pdf.js';
// 兼容 node ESM（CJS interop 走 default）与 esbuild 打包（命名导出直通）
const pdfjs = pdfjsNS.getDocument ? pdfjsNS : (pdfjsNS.default || pdfjsNS);
const { getDocument } = pdfjs;

// 防御：pdfjs getDocument 会 transfer 传入的 buffer，调用方可能复用同一份数据 → 拷贝
function toUint8(pdfData) {
  if (pdfData instanceof Uint8Array) return new Uint8Array(pdfData);
  if (pdfData instanceof ArrayBuffer) return new Uint8Array(pdfData.slice(0));
  return new Uint8Array(pdfData);
}

// 提取全文（带 PDF_PAGE_N 标记，便于 grep 定位）
export async function extractText(pdfData) {
  const data = toUint8(pdfData);
  const doc = await getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true
  }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    let lastY = null;
    for (const it of content.items) {
      const str = it.str || '';
      if (!str) continue;
      const y = it.transform ? it.transform[5] : 0;
      const x = it.transform ? it.transform[4] : 0;
      // 行内拼接：同一行 y 相近则空格连接；换行则加 \n
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      else if (text && !text.endsWith('\n')) text += ' ';
      text += str;
      lastY = y;
    }
    pages.push(`\n===== PDF_PAGE_${i} =====\n${text}`);
    page.cleanup && page.cleanup();
  }
  await doc.destroy();
  return pages.join('\n');
}

// 坐标重建：返回所有文字块 (x, y, str)，按 (y, x) 排序 —— 对应 get_text('words')
// 用法：提取指定行 y 范围的文字序列，重建多列表格列序
export async function extractWords(pdfData) {
  const data = toUint8(pdfData);
  const doc = await getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true
  }).promise;
  const all = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const it of content.items) {
      const str = (it.str || '').trim();
      if (!str) continue;
      if (!it.transform) continue;
      all.push({
        page: i,
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
        str
      });
    }
    page.cleanup && page.cleanup();
  }
  await doc.destroy();
  // 按页 → y → x 排序（y 为 PDF 坐标，越大越靠上，这里只保证同页有序）
  all.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  return all;
}

// 坐标化表格文本（对应手册 §4.3 get_text('words') 坐标重建）：
// 按页 → 行（y 聚类）→ 列（x 排序）重组，每项保留 x 坐标，模型可据此对齐多列表格列序
export async function extractTableText(pdfData, startPage, endPage) {
  const words = await extractWords(pdfData);
  const out = [];
  let curPage = 0;
  let curY = null;
  let line = [];

  const flush = () => {
    if (line.length === 0) return;
    const items = line.sort((a, b) => a.x - b.x).map(w => `[x=${w.x}]${w.str}`);
    out.push(`y=${line[0].y} ${items.join(' ')}`);
    line = [];
  };

  for (const w of words) {
    if (w.page < startPage || w.page > endPage) continue;
    if (w.page !== curPage) {
      flush();
      curPage = w.page;
      curY = null;
      out.push(`----- 第 ${w.page} 页 -----`);
    }
    if (curY === null || Math.abs(w.y - curY) <= 4) {
      if (curY === null) curY = w.y;
      line.push(w);
    } else {
      flush();
      curY = w.y;
      line.push(w);
    }
  }
  flush();
  return out.join('\n');
}

// 生成 JSON 行（与前端 RAW_DATA 行结构一致）
export function makeRow(companyType, companyName, reportPeriod, t, tableName, code, indName,
  isrc, kw, period, unitDisp, unitConv, valDisp, valConv, srcTable, rowNo, colNo) {
  return {
    '公司类型': companyType, '公司名称': companyName, '报告期': reportPeriod,
    '报表类型': t, '报表名称': tableName, '指标编号': code, '指标名称': indName,
    '指标来源': isrc, '关键词': kw, '期间': period,
    '计量单位-披露': unitDisp, '计量单位-换算': unitConv,
    '数值-披露': valDisp, '数值-换算': valConv,
    '来源表': srcTable, '行序号': rowNo, '列序号': colNo
  };
}
