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

export async function onRequest({ request, env }) {
  return route(request, env, {
    methods: ['POST'],
    admin: true,
    handler: async (req) => {
      const body = await req.json().catch(() => ({}));
      const company = (body.company || '').trim();
      const year = (body.year || '2025年度').trim();
      if (!company) return fail('缺少 company 参数');
      // 前端已解析的 PDF 文本（规避 Cloudflare 免费计划 CPU 10ms 限制：pdfjs 解析在浏览器完成）
      // fullText: 带 PDF_PAGE_N 标记的全文（定位表格用）；coordPages: 坐标化表格文本按页数组（AI 提取用）
      const fullText = (typeof body.fullText === 'string' && body.fullText.length > 100) ? body.fullText : null;
      const coordPages = Array.isArray(body.coordPages) ? body.coordPages : null;
      // 分批提取：tables 限定本次处理的报表集合（如 ["T01","T02","T03"]），控制单请求 CPU 与时长
      const tables = Array.isArray(body.tables) && body.tables.length
        ? body.tables.map(t => String(t).toUpperCase()).filter(t => /^T\d{2}$/.test(t))
        : null;

      // 1) 读取模板（存储优先，未初始化用内置）
      let template = await readJSON(env, env.TPL_KEY || 'template_163.json', null);
      if (!template || !template.length) template = BUILTIN_TEMPLATE;

      // 2) 校验 PDF 存在
      const pdfKey = `${env.PDF_PREFIX || 'pdfs/'}${company}_${year}.pdf`;
      if (!(await exists(env, pdfKey))) {
        return fail(`未找到 PDF：${pdfKey}，请先下载或上传`, 404);
      }

      // 3) 全文文本：优先用前端解析结果；否则后端解析（兜底，免费计划下可能超 CPU 限制）
      let pdfData = null;
      let fullText0 = fullText;
      if (!fullText0 || !coordPages) {
        pdfData = await storeGetBytes(env.STORE, pdfKey);
        if (!pdfData) return fail('读取 PDF 失败，请重新下载或上传');
      }
      if (!fullText0) {
        fullText0 = await extractText(pdfData);
        if (fullText0.length < 100) return fail('PDF 文本提取过短，可能不是文本型 PDF');
      }

      // 4) 逐表提取：每页一次调用（模型只做行提取），合并后由后端 matchIndicators 匹配指标
      const tplCodes = [...new Set(template.map(r => r[3]))].sort();
      const batchCodes = tables ? tplCodes.filter(t => tables.includes(t)) : tplCodes;
      if (!batchCodes.length) return fail('tables 参数未匹配到模板中的报表（如 T01-T10）');
      const allRowsByTable = {};
      const allItemsByTable = {};
      const tableNotes = [];
      for (const tCode of batchCodes) {
        const inds = template.filter(r => r[3] === tCode);
        const tableName = inds[0]?.[4] || tCode; // 入库用报表名（如"M2表"）
        // AI 判断用真实表名（搜索关键词优先——模型不认"T03/M2表"代号，页面标题是"保险合同负债余额调节表"等）
        const tableDesc = (TABLE_KEYWORDS[tCode] || [])[0] || tableName;
        const loc = locateTable(fullText0, TABLE_KEYWORDS[tCode] || [tableName]);
        if (!loc) {
          tableNotes.push(`${tCode}: 未定位到关键词，跳过`);
          continue;
        }
        // 逐页提取：优先只用主表首页（表头页）；若指标覆盖不足再向后扩展，避免混入后续页的公司报表
        const uniqueInds = new Set(inds.map(r => r[5])).size;
        const pageResults = [];
        const itemsAcc = {}; // 模式一：模型按编号输出的累积（靠后页优先）
        let matchedRows = [];
        let reached = null;
        let prevCovered = -1;
        for (let p = loc.startPage; p <= loc.endPage; p++) {
          // 优先使用前端上传的坐标文本（零后端 CPU）；否则后端提取（兜底）
          const pageSlice = coordPages && coordPages[p - 1] != null
            ? coordPages[p - 1]
            : await extractTableText(pdfData, p, p);
          if (pageSlice.length < 60) {
            tableNotes.push(`${tCode} p${p}: 文本过短(<60)跳过`);
            continue; // 空白页跳过
          }
          const pageRes = await extractTable(env, {
            tCode, tableName: tableDesc, indicators: inds, sliceText: pageSlice, companyName: company, year
          });
          const itemsKeys = Object.keys(pageRes.items || {});
          const firstItems = itemsKeys.slice(0, 6).map(k => `${k}(${pageRes.items[k]['本期'] ?? '?'})`).join('、');
          tableNotes.push(`${tCode} p${p}: title="${pageRes._title}" items=${itemsKeys.length} 首=${firstItems || '（无）'} rows=${(pageRes.rows || []).length}`);
          // 模式一：合并 items（同编号靠后页非 null 优先）
          for (const [code, it] of Object.entries(pageRes.items || {})) {
            const prev = itemsAcc[code];
            itemsAcc[code] = {
              本期: it['本期'] ?? prev?.['本期'] ?? null,
              上期: it['上期'] ?? prev?.['上期'] ?? null,
              披露单位: it['披露单位'] || prev?.['披露单位'] || ''
            };
          }
          pageResults.push(pageRes);
          matchedRows = mergePageResults(pageResults, tableDesc);
          const matched = matchIndicators(inds, matchedRows);
          const covered = Math.max(Object.keys(matched).length, Object.keys(itemsAcc).length);
          // 覆盖全部指标即停止；连续两页无新增指标也停止（防无限翻页）
          if (covered >= uniqueInds) {
            reached = p;
            break;
          }
          if (covered <= prevCovered && covered > 0) {
            reached = p;
            break;
          }
          prevCovered = covered;
        }
        allRowsByTable[tCode] = { inds, rows: matchedRows, loc };
        allItemsByTable[tCode] = { inds, items: itemsAcc, loc };
        tableNotes.push(`${tCode}: 用至页 ${reached ?? loc.endPage}，编号匹配 ${Object.keys(itemsAcc).length}，行匹配 ${matchedRows.length} 行`);
      }

      // 5) 指标匹配 + 组装 RAW_DATA 行
      // 匹配来源优先级：①模式一 items（模型按编号+来源线索语义提取）②模式二 matchIndicators（行名机械匹配兜底）
      const companyType = (body.companyType || '').trim();
      const rows = [];
      const suspicious = [];
      const matchedCount = {};
      for (const tCode of Object.keys(allItemsByTable)) {
        const { inds, items, loc } = allItemsByTable[tCode];
        const { rows: tableRows } = allRowsByTable[tCode] || { rows: [] };
        const matched = matchIndicators(inds, tableRows);
        // 模式一优先：模型按编号输出的值覆盖机械匹配（AI 语义理解可处理多列表列选择，标记可信）
        for (const [code, it] of Object.entries(items)) {
          if (it['本期'] === null && it['上期'] === null) continue;
          matched[code] = {
            ...(matched[code] || {}),
            本期: it['本期'] ?? matched[code]?.['本期'] ?? null,
            上期: it['上期'] ?? matched[code]?.['上期'] ?? null,
            披露单位: it['披露单位'] || matched[code]?.['披露单位'] || inds.find(x => x[5] === code)?.[10] || '',
            _suspicious: false,
            _aiDirect: true
          };
        }
        matchedCount[tCode] = Object.keys(matched).length;
        // 来源表附页码区间（PDF 内部页），供前端「指标截图检索」优先定位；与存量数据格式（…（P93-P94））一致
        const pageSuffix = loc ? `（P${loc.startPage}-P${loc.endPage}）` : '';
        for (const [code, ext] of Object.entries(matched)) {
          const r = inds.find(x => x[5] === code);
          if (!r) continue;
          const per = PERIOD_ALIAS[r[9]] || r[9]; // 期间归一
          const val = periodVal(ext, per);
          if (val === null || val === undefined) continue;
          // 机械匹配可疑值（行名降级匹配，多列表可能取错列）不入库：宁可缺失不误导，等待模式一或人工核
          if (ext._suspicious && !ext._aiDirect) {
            suspicious.push({ code, 指标名称: r[6], 行名: ext['行名'] || '（未提供）', 值: val, 提示: '可疑匹配未入库' });
            continue;
          }
          const isText = typeof val === 'string' && isNaN(Number(val));
          const disp = isText ? val : (isNaN(Number(val)) ? null : Number(val));
          const conv = isText ? val : convToYi(disp, ext['披露单位'] || r[10]);
          if (ext._suspicious) {
            suspicious.push({ code, 指标名称: r[6], 行名: ext['行名'] || '（未提供）', 值: conv });
          }
          // 指标来源/关键词/来源表保留模板线索（PDF 行名、页码），不覆盖为"指标名-期间"
          const srcText = typeof r[7] === 'string' && r[7].length > 2 ? r[7] : `${r[6]}-${r[9]}`;
          const kwText = typeof r[8] === 'string' && r[8].length > 2 ? r[8] : `${r[6]}-${r[9]}`;
          rows.push({
            '公司类型': companyType, '公司名称': company, '报告期': year,
            '报表类型': r[3], '报表名称': r[4], '指标编号': code, '指标名称': r[6],
            '指标来源': srcText, '关键词': kwText,
            '期间': per, '计量单位-披露': ext['披露单位'] || r[10] || '元', '计量单位-换算': r[11] || '亿元',
            '数值-披露': disp, '数值-换算': conv,
            '来源表': `${ext['来源'] || r[14] || `${r[3]} ${r[4]}`}${pageSuffix}`, '行序号': r[15], '列序号': r[16]
          });
        }
      }

      // 6) 勾稽验证
      const checks = runChecks(rows);

      // 7) 入库（upsert）：分批时只替换本批 tables 范围内的旧行，保证多次分批调用可正确累积
      const existing = await readDB(env);
      const scopeTables = batchCodes.length && batchCodes.length < tplCodes.length ? batchCodes : null;
      const others = existing.filter(x => {
        if (x['公司名称'] !== company || x['报告期'] !== year) return true;
        if (scopeTables) return !scopeTables.includes(x['报表类型']); // 分批：保留批外旧行
        return false; // 全量：删除该公司该报告期全部旧行
      });
      const merged = upsertRows(others, rows);
      await writeDB(env, merged);

      return ok({
        company, year,
        batchTables: batchCodes,
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
