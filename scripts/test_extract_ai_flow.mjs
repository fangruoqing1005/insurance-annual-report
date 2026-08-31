// AI 提取前端解析格式对拍测试：extractPdfTextsForAI（前端） vs extractText/extractTableText（后端）
// 目的：前端浏览器解析 PDF 生成的 fullText/coordPages 必须与后端格式一致（AI 提示词依赖坐标重建格式）
// 运行：node scripts/test_extract_ai_flow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsNS from 'pdfjs-dist/legacy/build/pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pdfjs = pdfjsNS.getDocument ? pdfjsNS : (pdfjsNS.default || pdfjsNS);

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}

// 从 index.html 提取前端函数（与 test_extract_ui.mjs 相同的平衡括号提取法）
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function extractFn(code, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(([\\s\\S]*?)\\)\\s*\\{', 'm');
  const m = code.match(re);
  if (!m) throw new Error('function ' + name + ' not found');
  const start = m.index + m[0].length - 1;
  let depth = 0, i = start;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) break; }
  }
  return code.slice(m.index, i + 1);
}

// 前端函数无浏览器依赖，直接 eval 定义（使用 pdfjs mock doc）
const frontendFn = extractFn(script, 'extractPdfTextsForAI');
const extractPdfTextsForAI = new Function('return ' + frontendFn)();

// 后端对照函数（import 官方实现）
const { extractText, extractTableText } = await import('../functions/_lib/pdf.js');

// 找测试 PDF
const pdfFile = ['test_download.pdf', 'test_min.pdf', '中国人寿_test.pdf', '平安人寿_test.pdf']
  .map(f => path.join(root, f))
  .find(f => fs.existsSync(f));
if (!pdfFile) { console.error('未找到测试 PDF'); process.exit(1); }
console.log('测试 PDF:', path.basename(pdfFile), (fs.statSync(pdfFile).size / 1024).toFixed(0) + 'KB');

const pdfBuf = fs.readFileSync(pdfFile);
const doc = await pdfjs.getDocument({ data: pdfBuf.slice().buffer, disableWorker: true, isEvalSupported: false, useSystemFonts: true, disableFontFace: true }).promise;
console.log('PDF 页数:', doc.numPages);

// 前端解析（对拍对象；用真实 pdfjs doc）
const { fullText, coordPages } = await extractPdfTextsForAI(doc, () => {});
console.log('fullText 长度:', fullText.length, 'coordPages:', coordPages.length);

// ===== 1. fullText vs 后端 extractText =====
const backendFull = await extractText(pdfBuf);
console.log('\n[1] fullText 与后端 extractText 一致性');
ok(Math.abs(fullText.length - backendFull.length) / backendFull.length < 0.02, `长度接近（前端 ${fullText.length} vs 后端 ${backendFull.length}）`);
const norm = s => s.replace(/\s+/g, ' ');
const fNorm = norm(fullText).slice(0, 8000);
const bNorm = norm(backendFull).slice(0, 8000);
// 逐字符比较（容差：前端为浏览器 PDF.js，可能与 Node 版本存在细微空白差异，用子串包含宽松判断）
let sameRatio = 0, total = 0;
for (let i = 0; i < Math.min(fNorm.length, bNorm.length); i += 200) {
  const a = fNorm.slice(i, i + 200), b = bNorm.slice(i, i + 200);
  total++;
  if (a === b || (a && b && a.includes(b.slice(0, 50)) && b.includes(a.slice(0, 50)))) sameRatio++;
}
ok(sameRatio / Math.max(total, 1) >= 0.9, `前 8000 字块匹配率 ${(sameRatio / Math.max(total, 1) * 100).toFixed(0)}%（≥90%）`);
ok(fullText.includes('===== PDF_PAGE_1 ====='), 'fullText 含 PDF_PAGE_1 标记');

// ===== 2. coordPages vs 后端 extractTableText =====
console.log('\n[2] coordPages 与后端 extractTableText 单页一致性');
const backendPage1 = await extractTableText(pdfBuf, 1, 1);
// 后端输出含 "----- 第 N 页 -----" 分隔行，过滤后再比较数据行
const bLines = backendPage1.split('\n').filter(Boolean).filter(l => !l.startsWith('-----'));
const fLines = (coordPages[0] || '').split('\n').filter(Boolean);
ok(fLines.length > 0, `前端第 1 页 ${fLines.length} 行（后端 ${bLines.length} 行）`);
ok(Math.abs(fLines.length - bLines.length) / Math.max(bLines.length, 1) < 0.3, '行数接近（y 聚类阈值一致）');
// 抽查前几行的 y= 与 [x=] 标注格式（[x=] 后文本项可含空格，如 "2025 年度"）
const fmtOk = fLines.slice(0, 20).every(l => /^y=\d+ (\[x=\d+\][^[]*)+$/.test(l));
ok(fmtOk, 'coordText 行格式 y=…[x=…] 正确');
// 内容命中检查：前端与后端首数据行 y 值相同（同 PDF 同排序）
if (fLines.length && bLines.length) {
  const fy = parseInt(fLines[0].match(/^y=(\d+)/)[1]);
  const by = parseInt(bLines[0].match(/^y=(\d+)/)[1]);
  ok(Math.abs(fy - by) <= 5, `首行 y 一致（前端 ${fy} vs 后端 ${by}）`);
}
// 抽样页（最后一页）
const lastP = doc.numPages;
const backendLast = await extractTableText(pdfBuf, lastP, lastP);
const fLast = (coordPages[lastP - 1] || '');
ok(fLast.length > 0 || backendLast.trim().length === 0, `末页 ${lastP} 文本生成（前端 ${fLast.length} 字符）`);

// ===== 3. coordPages 完整性：每页都有内容或与后端一致为空 =====
console.log('\n[3] coordPages 逐页完整性（抽样）');
let nonEmpty = 0;
const samplePages = [1, Math.floor(lastP / 2), lastP];
for (const p of samplePages) {
  const b = await extractTableText(pdfBuf, p, p);
  const f = coordPages[p - 1] || '';
  if (b.trim() === '') { ok(f.trim() === '', `第 ${p} 页后端为空，前端也为空`); }
  else { nonEmpty++; ok(f.trim().length > 50, `第 ${p} 页前端文本非空（${f.trim().length} 字符）`); }
}

console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
