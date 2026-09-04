// 生产入库核对：GET /api/data → 中国人寿2025 行 vs colleague_36.json gold 163 行
// 用法: node scripts/prod_gold_check.mjs [company] [year]
import fs from 'node:fs';
const BASE = process.env.PROD_BASE || 'https://insurance-annual-report.pages.dev';
const company = process.argv[2] || '中国人寿';
const year = process.argv[3] || '2025年度';

const resp = await fetch(`${BASE}/api/data`);
const data = await resp.json();
if (!data.ok) { console.log('API 失败:', JSON.stringify(data)); process.exit(1); }
const rows = (data.rows || []).filter(x => x['公司名称'] === company && String(x['报告期']).includes('2025'));
const gold = JSON.parse(fs.readFileSync('.workbuddy/tmp/colleague_36.json', 'utf8'))
  .filter(x => x['公司名称'] === company && String(x['报告期']).includes('2025'));

console.log(`生产 ${company} 2025 入库 ${rows.length} 行，gold ${gold.length} 行`);
const gKey = {};
for (const g of gold) gKey[`${g['报表类型']}|${g['指标编号']}|${g['期间']}`] = g;
const rKey = {};
for (const r of rows) rKey[`${r['报表类型']}|${r['指标编号']}|${r['期间']}`] = r;

const numEq = (a, b) => {
  const na = Number(a), nb = Number(b);
  if (isNaN(na) || isNaN(nb)) return String(a).trim() === String(b).trim();
  return Math.abs(na - nb) < 1e-6;
};
let ok = 0, bad = 0;
const diffs = [];
for (const g of gold) {
  const k = `${g['报表类型']}|${g['指标编号']}|${g['期间']}`;
  const r = rKey[k];
  if (!r) { bad++; diffs.push(`缺失 ${k} (gold=${g['数值-披露']})`); continue; }
  if (!numEq(r['数值-披露'], g['数值-披露'])) {
    bad++; diffs.push(`值差 ${k}: 库 ${r['数值-披露']}(${r['数值-换算']}) vs gold ${g['数值-披露']}(${g['数值-换算']})`);
  } else ok++;
}
// 多余行（gold 无）
for (const r of rows) {
  const k = `${r['报表类型']}|${r['指标编号']}|${r['期间']}`;
  if (!gKey[k]) { bad++; diffs.push(`多出 ${k} = ${r['数值-披露']}（gold 无此行）`); }
}
const byT = {};
for (const r of rows) { byT[r['报表类型']] = (byT[r['报表类型']] || 0) + 1; }
console.log('各表入库行数:', JSON.stringify(byT));
console.log(`核对: ${ok}/${gold.length} 一致${bad ? `，${bad} 处差异` : '，全部一致 ✓'}`);
if (diffs.length) { console.log('—— 差异 ——'); for (const d of diffs.slice(0, 60)) console.log(' ', d); }
