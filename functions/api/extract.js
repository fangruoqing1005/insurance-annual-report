// POST /api/extract — 提取一家公司：存储读 PDF → pdfjs 全文 → 按表定位 → DeepSeek 逐表提取 → 组装行 → 勾稽 → upsert 入库
import { route, ok, fail } from '../_lib/auth.js';
import { readDB, writeDB, upsertRows, readJSON, exists, storeGetBytes } from '../_lib/db.js';
import { extractText, extractTableText } from '../_lib/pdf.js';
import { TABLE_KEYWORDS, TABLE_REAL_NAMES, locateTable, slicePages, extractTable, mergePageResults, matchIndicators, tplPeriodKey, convToYi } from '../_lib/extractor.js';
import { runChecks } from '../_lib/check.js';
import { BUILTIN_TEMPLATE } from '../_lib/template_data.js';

const PERIOD_ALIAS = { '期初': '本期初', '期末': '本期末', '年度': '本期' };
// 期间取值链：模板目标期间键 → 依次尝试的取值键
// matchIndicators 输出 6 键规范期间体系（本期初/本期末/上期初/上期末/本期/上期）：
// 调节型报表（日期行）四时点键齐全直接命中；列表型报表（资产负债表等无日期行）回落 本期/上期（AI 两列语义）
const KEY_CHAINS = {
  '本期初': ['本期初', '上期末', '上期'],
  '本期末': ['本期末', '本期'],
  '上期初': ['上期初', '上期'],
  '上期末': ['上期末', '上期'],
  '本期': ['本期'], '上期': ['上期'], '年度': ['本期']
};
function periodVal(ext, r, year) {
  if (!ext) return null;
  const key = tplPeriodKey(r, year) || PERIOD_ALIAS[r[9]] || String(r[9] || '');
  const chain = KEY_CHAINS[key] || [key];
  for (const k of chain) {
    if (ext[k] !== null && ext[k] !== undefined) return ext[k];
  }
  return null;
}
// 行表型打标：页文本含 PAA/非PAA 子表分组标题 → 该页所有行打 _paa（M2 调节表非PAA/PAA 同名行分流依据）
// 注意判定顺序：'未采用保费分配法计量的合同' 含子串 '采用保费分配法计量的合同'，必须先查"未采用"
function tagPageRows(pageRes, pageSlice) {
  const s = String(pageSlice || '');
  const hasNonPaa = s.includes('未采用保费分配法计量的合同');
  const hasPaa = !hasNonPaa && s.includes('采用保费分配法计量的合同');
  if (!hasPaa && !hasNonPaa) return; // 页无 PAA 分组标题（普通表）→ 不打标
  for (const row of pageRes.rows || []) row['_paa'] = hasPaa;
}
// 页期间回填：页内行名日期单一报告年度（如 P184 全 2024）且行未标期间 → 按年度回填 上期/本期
// 跨年度混合页（E/G 同页 P189）跳过；单列行不受影响（rowValue 走 本期/上期 字段）
function fillPagePeriod(pageRes, year) {
  const reportYear = parseInt(String(year || '').match(/(20\d{2})/)?.[1] || '') || null;
  if (!reportYear) return;
  const ys = new Set();
  for (const row of pageRes.rows || []) {
    const m = String(row['行名'] || '').match(/(20\d{2})\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/);
    if (m) ys.add(+m[1]);
  }
  if (ys.size !== 1) return;
  const y = [...ys][0];
  const per = y === reportYear ? '本期' : y === reportYear - 1 ? '上期' : null;
  if (!per) return;
  for (const row of pageRes.rows || []) {
    if (row['列'] && typeof row['列'] === 'object' && !String(row['期间'] || '').trim()) row['期间'] = per;
  }
}
// 覆盖度：按模板行（编号×期间组合）逐个尝试取值——PAA/非PAA 同名不同期的每行各自计数，
// 避免"编号全覆盖即停"导致 PAA 上期页（P186）漏扫
function coverOf(inds, matched, year) {
  let n = 0;
  for (const r of inds) {
    if (periodVal(matched[r[5]], r, year) !== null) n++;
  }
  return n;
}
// T09/T10 正则直取：折现率区间为日期键小表（键不在常规列名内）、置信水平为正文散文，行提取无法覆盖
// 同年度首次出现优先（集团报表在母公司报表之前）
function regexDirectExtract(tCode, sliceText, year) {
  const items = {};
  const reportYear = parseInt(String(year || '').match(/(20\d{2})/)?.[1] || '') || null;
  if (tCode === 'T09') {
    const re = /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日[^\d%]{0,60}?(\d{1,2}\.\d+)\s*%\s*[~～至\-]\s*(\d{1,2}\.\d+)\s*%/g;
    const byYear = {}; let m;
    while ((m = re.exec(sliceText)) !== null) {
      const y = +m[1]; if (byYear[y] === undefined) byYear[y] = `${m[4]}%~${m[5]}%`;
    }
    if (reportYear && byYear[reportYear] !== undefined)
      items['I01'] = { 本期: byYear[reportYear], 上期: byYear[reportYear - 1] ?? null, 披露单位: '%' };
  } else if (tCode === 'T10') {
    const m = sliceText.match(/按\s*(\d{2})\s*%\s*置信水平/);
    if (m) items['J01'] = { 本期: `${m[1]}%`, 上期: null, 披露单位: '%' };
  }
  return items;
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
        // AI 判断用真实表名（TABLE_REAL_NAMES：定位关键词与模型表名分离，如 T06 定位用"预计当期发生的赔款"但模型判断用"保险服务收入"）
        const tableDesc = TABLE_REAL_NAMES[tCode] || (TABLE_KEYWORDS[tCode] || [])[0] || tableName;
        const loc = locateTable(fullText0, TABLE_KEYWORDS[tCode] || [tableName]);
        if (!loc) {
          tableNotes.push(`${tCode}: 未定位到关键词，跳过`);
          continue;
        }
        // 逐页提取：优先只用主表首页（表头页）；若指标覆盖不足再向后扩展，避免混入后续页的公司报表
        const pageResults = [];
        const itemsAcc = {}; // 模式一：模型按编号输出的累积（靠后页优先）
        // T09/T10：折现率区间为日期键小表（键不在常规列名内）、置信水平为正文散文，行提取无法覆盖
        // → 后端正则从定位页全文直取（首次出现优先=集团表在母公司表之前），绕过 AI 行提取与可疑拦截
        const regexItems = regexDirectExtract(tCode, slicePages(fullText0, loc.startPage, loc.endPage), year);
        for (const [code, it] of Object.entries(regexItems)) {
          itemsAcc[code] = it;
          tableNotes.push(`${tCode}: 正则直取 ${code} 本期=${it['本期']} 上期=${it['上期'] ?? '（无）'}`);
        }
        if (tCode === 'T09' || tCode === 'T10') {
          allRowsByTable[tCode] = { inds, rows: [], loc };
          allItemsByTable[tCode] = { inds, items: itemsAcc, loc };
          tableNotes.push(`${tCode}: 正则直取模式，跳过 AI 行提取`);
          continue;
        }
        let matchedRows = [];
        let reached = null;
        let prevCovered = -1;
        let noGainPages = 0;
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
          tableNotes.push(`${tCode} p${p}: title="${pageRes._title}" items=${itemsKeys.length} 首=${firstItems || '（无）'} rows=${(pageRes.rows || []).length} raw=${(pageRes.raw || '').replace(/\n/g, ' ').slice(0, 180)}`);
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
          // 行表型打标（PAA/非PAA 分流）+ 页期间回填（调节表跨期同名行依赖，模型标注偶发缺失的兜底）
          tagPageRows(pageRes, pageSlice);
          fillPagePeriod(pageRes, year);
          matchedRows = mergePageResults(pageResults, tableDesc);
          const matched = matchIndicators(inds, matchedRows, year);
          const covered = coverOf(inds, matched, year);
          // 覆盖全部模板行（编号×期间）即停止；连续两页无新增覆盖也停止（防无限翻页）
          if (covered >= inds.length) {
            reached = p;
            break;
          }
          if (covered <= prevCovered && covered > 0) {
            // 连续 2 页无新增覆盖才停止（首页表头/次页续表的单页空档容错，避免提前 break 丢后续页）
            noGainPages++;
            if (noGainPages >= 2) { reached = p; break; }
          } else {
            noGainPages = 0;
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
        const matched = matchIndicators(inds, tableRows, year);
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
        const rowsDiag = []; // 诊断：每模板行取值链命中情况
        for (const [code, ext] of Object.entries(matched)) {
          // 遍历该指标的全部模板行（期末/期初、本期/上期等多期间），分别按期间取值入库
          const tplRows = inds.filter(x => x[5] === code);
          if (!tplRows.length) continue;
          for (const r of tplRows) {
            // 输出期间（与 gold 约定一致）：T01/T07 输出四时点键（本期初/本期末/上期初/上期末）；
            // 其余表压缩为本期/上期（含 T09 日期式期间"2025年12月31日"→本期）。期间同时是 upsert 去重键，必须按模板行区分
            const outKey = tplPeriodKey(r, year);
            const per = (r[3] === 'T01' || r[3] === 'T07') ? outKey : (String(outKey).startsWith('上') ? '上期' : '本期');
            let val = periodVal(ext, r, year);
            const diagKey = outKey || PERIOD_ALIAS[r[9]] || String(r[9] || '');
            const diagChain = KEY_CHAINS[diagKey] || [diagKey];
            rowsDiag.push({
              t: tCode, code, 模期间: r[9], outKey, per,
              ext键: Object.keys(ext).filter(k => !k.startsWith('_')).map(k => `${k}=${ext[k]}`).join(' '),
              链: diagChain.map(k => `${k}:${ext[k] ?? '∅'}`).join(' '),
              值: val ?? '∅', 行名: ext['行名'] || '', suspicious: !!ext._suspicious
            });
            if (val === null || val === undefined) continue;
            // H01/H02：PDF 中为括号负数（如 (20,168)），gold 全行业约定取正值入库
            if (code === 'H01' || code === 'H02') {
              if (typeof val === 'number') val = Math.abs(val);
              else if (typeof val === 'string') {
                const n = Number(String(val).replace(/[(),\s]/g, '').replace(/-/g, ''));
                if (!isNaN(n) && String(val).trim() !== '') val = n;
              }
            }
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
        rowsDiag,
        suspicious,
        checks
      });
    }
  });
}
