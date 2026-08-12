// POST /api/extract — 提取一家公司：存储读 PDF → pdfjs 全文 → 按表定位 → DeepSeek 逐表提取 → 组装行 → 勾稽 → upsert 入库
import { route, ok, fail } from '../_lib/auth.js';
import { readDB, writeDB, upsertRows, readJSON, exists, storeGetBytes } from '../_lib/db.js';
import { extractText, extractTableText } from '../_lib/pdf.js';
import { TABLE_KEYWORDS, locateTable, extractTable, mergePageResults, matchIndicators, convToYi } from '../_lib/extractor.js';
import { runChecks } from '../_lib/check.js';
import { BUILTIN_TEMPLATE } from '../_lib/template_data.js';

const PERIOD_ALIAS = { '期初': '本期初', '期末': '本期末', '年度': '本期' };
// 模型输出字段只有 本期/上期（本期=期末/本年度，上期=期初/上年度）→ 映射模板期间
const CUR_PERIODS = ['本期', '本期末', '期末'];
const PREV_PERIODS = ['上期', '本期初', '期初', '上期初', '上期末'];
function periodVal(ext, per) {
  if (CUR_PERIODS.includes(per)) return ext['本期'] ?? null;
  if (PREV_PERIODS.includes(per)) return ext['上期'] ?? null;
  return ext[per] ?? null;
}

export async function onRequest(request, env) {
  return route(request, env, {
    methods: ['POST'],
    admin: true,
    handler: async (req) => {
      const body = await req.json().catch(() => ({}));
      const company = (body.company || '').trim();
      const year = (body.year || '2025年度').trim();
      if (!company) return fail('缺少 company 参数');

      // 1) 读取模板（存储优先，未初始化用内置）
      let template = await readJSON(env, env.TPL_KEY || 'template_163.json', null);
      if (!template || !template.length) template = BUILTIN_TEMPLATE;

      // 2) 读 PDF
      const pdfKey = `${env.PDF_PREFIX || 'pdfs/'}${company}_${year}.pdf`;
      if (!(await exists(env, pdfKey))) {
        return fail(`未找到 PDF：${pdfKey}，请先下载或上传`, 404);
      }
      const pdfData = await storeGetBytes(env.STORE, pdfKey);
      if (!pdfData) return fail('读取 PDF 失败，请重新下载或上传');

      // 3) 全文提取
      const fullText = await extractText(pdfData);
      if (fullText.length < 100) return fail('PDF 文本提取过短，可能不是文本型 PDF');

      // 4) 逐表提取：每页一次调用（模型只做行提取），合并后由后端 matchIndicators 匹配指标
      const tplCodes = [...new Set(template.map(r => r[3]))].sort();
      const allRowsByTable = {};
      const tableNotes = [];
      for (const tCode of tplCodes) {
        const inds = template.filter(r => r[3] === tCode);
        const tableName = inds[0]?.[4] || tCode;
        const loc = locateTable(fullText, TABLE_KEYWORDS[tCode] || [tableName]);
        if (!loc) {
          tableNotes.push(`${tCode}: 未定位到关键词，跳过`);
          continue;
        }
        // 逐页提取：优先只用主表首页（表头页）；若指标覆盖不足再向后扩展，避免混入后续页的公司报表
        const uniqueInds = new Set(inds.map(r => r[5])).size;
        const pageResults = [];
        let matchedRows = [];
        let reached = null;
        for (let p = loc.startPage; p <= loc.endPage; p++) {
          const pageSlice = await extractTableText(pdfData, p, p);
          if (pageSlice.length < 60) continue; // 空白页跳过
          const pageRes = await extractTable(env, {
            tCode, tableName, indicators: inds, sliceText: pageSlice, companyName: company, year
          });
          pageResults.push(pageRes);
          matchedRows = mergePageResults(pageResults, tableName);
          const matched = matchIndicators(inds, matchedRows);
          const covered = Object.keys(matched).length;
          // 覆盖 >= 60% 指标即停止扩展（主表页已够），否则继续下一页
          if (covered >= uniqueInds * 0.6) {
            reached = p;
            break;
          }
        }
        allRowsByTable[tCode] = { inds, rows: matchedRows };
        tableNotes.push(`${tCode}: 用至页 ${reached ?? loc.endPage}，匹配 ${matchedRows.length} 行`);
      }

      // 5) 后端确定性匹配指标 + 组装 RAW_DATA 行
      const companyType = (body.companyType || '').trim();
      const rows = [];
      const suspicious = [];
      const matchedCount = {};
      for (const [tCode, { inds, rows: tableRows }] of Object.entries(allRowsByTable)) {
        const matched = matchIndicators(inds, tableRows);
        matchedCount[tCode] = Object.keys(matched).length;
        for (const [code, ext] of Object.entries(matched)) {
          const r = inds.find(x => x[5] === code);
          if (!r) continue;
          const per = PERIOD_ALIAS[r[9]] || r[9]; // 期间归一
          const val = periodVal(ext, per);
          if (val === null || val === undefined) continue;
          const disp = typeof val === 'number' ? val : (isNaN(Number(val)) ? null : Number(val));
          const conv = convToYi(disp, ext['披露单位'] || r[10]);
          if (ext._suspicious) {
            suspicious.push({ code, 指标名称: r[6], 行名: ext['行名'] || '（未提供）', 值: conv });
          }
          rows.push({
            '公司类型': companyType, '公司名称': company, '报告期': year,
            '报表类型': r[3], '报表名称': r[4], '指标编号': code, '指标名称': r[6],
            '指标来源': `${r[6]}-${r[9]}`, '关键词': `${r[6]}-${r[9]}`,
            '期间': per, '计量单位-披露': ext['披露单位'] || r[10] || '元', '计量单位-换算': r[11] || '亿元',
            '数值-披露': disp, '数值-换算': conv,
            '来源表': ext['来源'] || `${r[3]} ${r[4]}`, '行序号': r[15], '列序号': r[16]
          });
        }
      }

      // 6) 勾稽验证
      const checks = runChecks(rows);

      // 7) 入库（upsert：公司+报告期 范围内的行替换）
      const existing = await readDB(env);
      // 先删除该公司该报告期的旧行，再合并（保证 upsert 语义完整）
      const others = existing.filter(x => !(x['公司名称'] === company && x['报告期'] === year));
      const merged = upsertRows(others, rows);
      await writeDB(env, merged);

      return ok({
        company, year,
        matched: matchedCount,
        rowsAdded: rows.length,
        dbRows: merged.length,
        tableNotes,
        suspicious,
        checks
      });
    }
  });
}
