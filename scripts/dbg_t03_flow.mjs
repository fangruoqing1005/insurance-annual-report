// 模拟 extract.js 对 T03 的完整页循环（含 tagPageRows/fillPagePeriod/coverOf 修复后逻辑）
// 场景：P184/P186 模型漏标期间字段（真实生产发生），PAA/非PAA 同名行 —— 验证修复后仍全部正确
// 运行: node scripts/dbg_t03_flow.mjs
import { BUILTIN_TEMPLATE } from '../functions/_lib/template_data.js';
import { matchIndicators, mergePageResults } from '../functions/_lib/extractor.js';

const year = '2025年度';
const inds = BUILTIN_TEMPLATE.filter(r => r[3] === 'T03');
const N = (s) => {
  if (s === '–' || s === '—' || s === '-' || s == null) return null;
  const t = s.trim();
  const neg = /^\(.*\)$/.test(t);
  return neg ? -Number(t.replace(/[(),\s]/g, '')) : Number(t.replace(/,/g, ''));
};
const COL4 = ['非亏损部分', '亏损部分', '已发生赔款负债', '合计'];
const COL5 = ['非亏损部分', '亏损部分', '未来现金流量现值', '非金融风险调整', '合计'];
const mk = (cols, 行名, 期间, arr) => {
  const row = { 行名, 披露单位: '百万元', 来源: 'T03 M2表', 期间 };
  if (cols === COL4) row['列'] = { [COL4[0]]: N(arr[0]), [COL4[1]]: N(arr[1]), [COL4[2]]: N(arr[2]), [COL4[3]]: N(arr[3]) };
  else row['列'] = { [COL5[0]]: N(arr[0]), [COL5[1]]: N(arr[1]), [COL5[2]]: N(arr[2]), [COL5[3]]: N(arr[3]), [COL5[4]]: N(arr[4]) };
  return row;
};
// 数据（P183 非PAA本期 / P184 非PAA上期 / P185 PAA本期 / P186 PAA上期）
const DAT = {
  P183: [
    ['2025年1月1日的保险合同负债', '本期', ['5,687,512', '67,105', '34,839', '5,789,456']],
    ['当期发生赔款及其他相关费用', '本期', ['–', '(2,642)', '47,279', '44,637']],
    ['亏损部分的确认及转回', '本期', ['–', '4,980', '–', '4,980']],
    ['保险合同金融变动额', '本期', ['162,775', '530', '1', '163,306']],
    ['2025年12月31日的保险合同负债', '本期', ['6,234,254', '69,973', '35,503', '6,339,730']]
  ],
  P184: [
    ['2024年1月1日的保险合同负债', '上期', ['4,759,114', '30,904', '35,387', '4,825,405']],
    ['当期发生赔款及其他相关费用', '上期', ['–', '(3,366)', '47,176', '43,810']],
    ['亏损部分的确认及转回', '上期', ['–', '39,044', '–', '39,044']],
    ['保险合同金融变动额', '上期', ['592,442', '523', '–', '592,965']],
    ['2024年12月31日的保险合同负债', '上期', ['5,687,512', '67,105', '34,839', '5,789,456']]
  ],
  P185: [
    ['2025年1月1日的保险合同负债', '本期', ['4,763', '1,307', '28,915', '585', '35,570']],
    ['当期发生赔款及其他相关费用', '本期', ['–', '(1,010)', '32,636', '560', '32,186']],
    ['亏损部分的确认及转回', '本期', ['–', '1,802', '–', '–', '1,802']],
    ['保险合同金融变动额', '本期', ['984', '–', '432', '10', '1,426']],
    ['2025年12月31日的保险合同负债', '本期', ['6,147', '2,099', '27,496', '642', '36,384']]
  ],
  P186: [
    ['2024年1月1日的保险合同负债', '上期', ['6,251', '798', '26,143', '578', '33,770']],
    ['当期发生赔款及其他相关费用', '上期', ['–', '(638)', '36,265', '515', '36,142']],
    ['亏损部分的确认及转回', '上期', ['–', '1,147', '–', '–', '1,147']],
    ['保险合同金融变动额', '上期', ['1,405', '–', '659', '16', '2,080']],
    ['2024年12月31日的保险合同负债', '上期', ['4,763', '1,307', '28,915', '585', '35,570']]
  ]
};
// 关键：P184/P186 页行"期间"标错为 本期（模拟真实生产：模型把上期页动态行标成本期）
const STRIP_PERIOD = { P184: true, P186: true };
const PAGE_SLICE = { P183: '未采用保费分配法计量的合同', P184: '未采用保费分配法计量的合同', P185: '采用保费分配法计量的合同', P186: '采用保费分配法计量的合同' };

// —— 复制 extract.js 辅助函数 ——
function tagPageRows(pageRes, pageSlice) {
  const s = String(pageSlice || '');
  const hasNonPaa = s.includes('未采用保费分配法计量的合同');
  const hasPaa = !hasNonPaa && s.includes('采用保费分配法计量的合同');
  if (!hasPaa && !hasNonPaa) return;
  for (const row of pageRes.rows || []) row['_paa'] = hasPaa;
}
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
    if (row['列'] && typeof row['列'] === 'object') {
      const hasDate = /(20\d{2})\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/.test(String(row['行名'] || ''));
      if (!hasDate) row['期间'] = per;
    }
  }
}
const PERIOD_ALIAS = { '期初': '本期初', '期末': '本期末', '年度': '本期' };
const KEY_CHAINS = {
  '本期初': ['本期初', '上期末', '上期'], '本期末': ['本期末', '本期'],
  '上期初': ['上期初', '上期'], '上期末': ['上期末', '上期'],
  '本期': ['本期'], '上期': ['上期'], '年度': ['本期']
};
import { tplPeriodKey } from '../functions/_lib/extractor.js';
function periodVal(ext, r, year) {
  if (!ext) return null;
  const key = tplPeriodKey(r, year) || PERIOD_ALIAS[r[9]] || String(r[9] || '');
  const chain = KEY_CHAINS[key] || [key];
  for (const k of chain) { if (ext[k] !== null && ext[k] !== undefined) return ext[k]; }
  return null;
}
function coverOf(inds, matched, year) {
  let n = 0;
  for (const r of inds) { if (periodVal(matched[r[5]], r, year) !== null) n++; }
  return n;
}

// —— 页循环模拟（extract.js 逻辑）——
const pageResList = [];
let prevCovered = -1, noGainPages = 0, reached = null, covered = -1;
for (const key of ['P183', 'P184', 'P185', 'P186']) {
  const rows = DAT[key].map(([行名, 期间, arr]) => mk(arr.length === 4 ? COL4 : COL5, 行名, 期间, arr));
  if (STRIP_PERIOD[key]) for (const r of rows) r['期间'] = '本期'; // 模拟模型把上期页行标错为"本期"
  const pageRes = { _title: '签发的保险合同的未到期责任负债和已发生赔款负债余额调节表', items: {}, rows };
  pageResList.push(pageRes);
  tagPageRows(pageRes, PAGE_SLICE[key]);
  fillPagePeriod(pageRes, year);
  const merged = mergePageResults(pageResList, '未到期责任负债和已发生赔款负债余额调节表');
  const matched = matchIndicators(inds, merged, year);
  covered = coverOf(inds, matched, year);
  console.log(`${key}: 覆盖 ${covered}/${inds.length} 模板行，matched 编号 ${Object.keys(matched).length}`);
  if (covered >= inds.length) { reached = key; break; }
  if (covered <= prevCovered && covered > 0) {
    noGainPages++;
    if (noGainPages >= 2) { reached = key; break; }
  } else noGainPages = 0;
  prevCovered = covered;
}
console.log('用至页:', reached, '（应扫完 P186 全 4 页）');

// 终值核对
const mergedAll = mergePageResults(pageResList, '未到期责任负债和已发生赔款负债余额调节表');
const out = matchIndicators(inds, mergedAll, year);
const EXPECT = {
  C01: { 本期初: 67105, 上期初: 30904 }, C02: { 本期: 530, 上期: 523 }, C03: { 本期: 4980, 上期: 39044 },
  C04: { 本期: -2642, 上期: -3366 }, C05: { 本期末: 69973, 上期末: 67105 },
  C10: { 本期初: 1307, 上期初: 798 }, C11: { 本期: 0, 上期: 0 }, C12: { 本期: 1802, 上期: 1147 },
  C13: { 本期: -1010, 上期: -638 }, C14: { 本期末: 2099, 上期末: 1307 }
};
let bad = 0;
for (const [code, exp] of Object.entries(EXPECT)) {
  const got = out[code] || {};
  for (const [k, v] of Object.entries(exp)) {
    const gv = got[k];
    const ok = gv !== undefined && Number(gv) === Number(v);
    if (!ok) { bad++; console.log(`✗ ${code} ${k}: ${gv} ≠ ${v}${got['行名'] ? ' 行名=' + got['行名'] : ''}`); }
  }
}
console.log(bad === 0 ? 'C 系 20 个期间值全部与期望一致 ✓' : `${bad} 处不一致 ✗`);
