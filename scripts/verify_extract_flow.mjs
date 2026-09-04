// 验证 extract.js 第5步组装逻辑（periodVal 取值链 / 输出期间 per / H01-H02 取正）
// 输入：模拟 matchIndicators 输出的 ext 对象（真实键形态+真实PDF值，摘自中国人寿2025 coord 页面文本）
// 对照：colleague_36.json 中 中国人寿2025 的 gold 行
// 运行：node scripts/verify_extract_flow.mjs
import fs from 'node:fs';
import { BUILTIN_TEMPLATE } from '../functions/_lib/template_data.js';
import { tplPeriodKey } from '../functions/_lib/extractor.js';

const YEAR = '2025年度';
const goldAll = JSON.parse(fs.readFileSync('.workbuddy/tmp/colleague_36.json', 'utf8'));
const gold = goldAll.filter(x => x['公司名称'] === '中国人寿' && String(x['报告期']).includes('2025'));
const goldByT = {};
for (const x of gold) (goldByT[x['报表类型']] = goldByT[x['报表类型']] || []).push(x);
// gold 期望： (报表类型, 指标编号, 期间) → {数值-披露, 指标名称}
const expectMap = {};
for (const x of gold) expectMap[`${x['报表类型']}|${x['指标编号']}|${x['期间']}`] = x;

// —— 复制 extract.js 的 KEY_CHAINS / periodVal ——
const PERIOD_ALIAS = { '期初': '本期初', '期末': '本期末', '年度': '本期' };
const KEY_CHAINS = {
  '本期初': ['本期初', '上期末', '上期'],
  '本期末': ['本期末', '本期'],
  '上期初': ['上期初', '上期'],
  '上期末': ['上期末', '上期'],
  '本期': ['本期'], '上期': ['上期'], '年度': ['本期']
};
function periodVal(ext, r, year) {
  const key = tplPeriodKey(r, year) || PERIOD_ALIAS[r[9]] || String(r[9] || '');
  const chain = KEY_CHAINS[key] || [key];
  for (const k of chain) {
    if (ext[k] !== null && ext[k] !== undefined) return ext[k];
  }
  return null;
}
// —— 复制 extract.js 组装段 ——
function assemble(tCode, inds, extMap, year) {
  const rows = [];
  for (const [code, ext] of Object.entries(extMap)) {
    const tplRows = inds.filter(x => x[5] === code);
    if (!tplRows.length) continue;
    for (const r of tplRows) {
      const outKey = tplPeriodKey(r, year);
      const per = (r[3] === 'T01' || r[3] === 'T07') ? outKey : (String(outKey).startsWith('上') ? '上期' : '本期');
      let val = periodVal(ext, r, year);
      if (val === null || val === undefined) continue;
      if (code === 'H01' || code === 'H02') {
        if (typeof val === 'number') val = Math.abs(val);
        else if (typeof val === 'string') {
          const n = Number(String(val).replace(/[(),\s]/g, '').replace(/-/g, ''));
          if (!isNaN(n) && String(val).trim() !== '') val = n;
        }
      }
      rows.push({ code, 期间: per, 数值: val, 指标名称: r[6] });
    }
  }
  return rows;
}

// ================= mock ext（matchIndicators 真实输出形态）=================
// T01 资产负债表：列表型无日期行 → 单列行键 本期/上期（期末列→本期、期初列→上期）
const T01 = {};
for (const x of goldByT['T01'] || []) {
  const code = x['指标编号'];
  T01[code] = T01[code] || {};
  T01[code][x['期间'] === '本期末' ? '本期' : '上期'] = Number(x['数值-披露']);
}
// T02 利润表：单列行 本期/上期
const T02 = {};
for (const x of goldByT['T02'] || []) {
  const code = x['指标编号'];
  T02[code] = T02[code] || {};
  T02[code][x['期间']] = Number(x['数值-披露']);
}
// T03 余额调节表：日期行四时点键（C01/C05/C10/C14 期初期末）+ 无日期动态行两键
const T03 = {
  C01: { 本期初: 67105, 上期初: 30904 },   // 2025/2024-01-01 亏损部分
  C02: { 本期: 530, 上期: 523 },            // 金融变动额-亏损部分
  C03: { 本期: 4980, 上期: 39044 },         // 亏损确认转回-亏损部分
  C04: { 本期: -2642, 上期: -3366 },        // 当期赔款-亏损部分
  C05: { 本期末: 69973, 上期末: 67105 },    // 2025/2024-12-31 亏损部分
  C06: { 本期: 44637, 上期: 43810 },        // 当期赔款-合计
  C07: { 本期: 48585, 上期: 45167 },        // 摊销-合计
  C08: { 本期: 4980, 上期: 39044 },         // 亏损确认-合计
  C09: { 本期: 726, 上期: 650 },            // 已发生赔款变动-合计
  C10: { 本期初: 1307, 上期初: 798 },       // PAA 期初-亏损
  C11: { 本期: 0, 上期: 0 },                // PAA LC计息 破折号→0
  C12: { 本期: 1802, 上期: 1147 },          // PAA 亏损确认
  C13: { 本期: -1010, 上期: -638 },         // PAA 当期赔款-亏损
  C14: { 本期末: 2099, 上期末: 1307 }       // PAA 期末-亏损
};
// T04 M1调节表：日期行四时点键 + 无日期动态行两键
const T04 = {
  D01: { 本期初: 5005886 }, D02: { 本期末: 5530577 },
  D03: { 本期初: 41082 }, D04: { 本期末: 40784 },
  D05: { 本期初: 742488, 上期初: 769137 },
  D06: { 本期: 22904, 上期: 23391 },
  D07: { 本期: -68475, 上期: -64126 },
  D08: { 本期: 53074, 上期: 57708 },
  D09: { 本期: 18378, 上期: -43622 },
  D10: { 本期末: 768369, 上期末: 742488 }
};
// T05 E表：双年度多列行拆行 → 键 本期/上期
const T05 = {
  E01: { 本期: -779473, 上期: -812092 }, E02: { 本期: -674725, 上期: -699363 }, E03: { 本期: -104748, 上期: -112729 },
  E04: { 本期: 1408, 上期: 1450 }, E05: { 本期: 1255, 上期: 1286 }, E06: { 本期: 153, 上期: 164 },
  E07: { 本期: 47245, 上期: 62669 }, E08: { 本期: 46968, 上期: 60713 }, E09: { 本期: 277, 上期: 1956 },
  E10: { 本期: 53074, 上期: 57708 }, E11: { 本期: 275, 上期: 1079 }
};
// T06 F表：单列行 本期/上期
const T06 = {
  F01: { 本期: 44899, 上期: 45571 }, F02: { 本期: 2081, 上期: 2011 }, F03: { 本期: 68475, 上期: 64126 },
  F04: { 本期: 48585, 上期: 45167 }, F05: { 本期: 164040, 上期: 156875 }, F06: { 本期: 50096, 上期: 51286 }
};
// T07 G表：日期行×过渡方法列 → 四时点键
const T07 = {
  G01: { 本期初: 498680, 本期末: 483795, 上期初: 557494, 上期末: 498680 },
  G02: { 本期初: 130530, 本期末: 125808, 上期初: 136909, 上期末: 130530 },
  G03: { 本期初: 113278, 本期末: 158766, 上期初: 74734, 上期末: 113278 }
};
// T08 H表：单列行（PDF 原值为括号负数，组装应取正；H03 已是正）
const T08 = {
  H01: { 本期: -20168, 上期: -19669 }, H02: { 本期: -17801, 上期: -17932 }, H03: { 本期: 8107, 上期: 7378 }
};
const EXTS = { T01, T02, T03, T04, T05, T06, T07, T08 };

// ================= 运行 + 对照 =================
let total = 0, okCnt = 0;
const diffs = [];
for (const [tCode, extMap] of Object.entries(EXTS)) {
  const inds = BUILTIN_TEMPLATE.filter(r => r[3] === tCode);
  const rows = assemble(tCode, inds, extMap, YEAR);
  const goldRows = goldByT[tCode] || [];
  // 逐 gold 行检查
  const found = {};
  for (const row of rows) {
    const gx = expectMap[`${tCode}|${row.code}|${row.期间}`];
    total++;
    if (gx) {
      const gv = Number(gx['数值-披露']);
      const ok = Number(row.数值) === gv;
      if (ok) okCnt++; else diffs.push(`${tCode} ${row.code} ${row.期间}: 得 ${row.数值} ≠ gold ${gv}`);
      found[`${row.code}|${row.期间}`] = true;
    } else {
      diffs.push(`${tCode} ${row.code} ${row.期间}: 多产出 ${row.数值}（gold 无此行）`);
    }
  }
  // gold 有但未产出的
  for (const gx of goldRows) {
    if (!found[`${gx['指标编号']}|${gx['期间']}`]) {
      diffs.push(`${tCode} ${gx['指标编号']} ${gx['期间']}: 缺失（gold=${gx['数值-披露']}）`);
      total++;
    }
  }
  const brief = rows.length === goldRows.length && !diffs.filter(d => d.startsWith(tCode + ' ')).length
    ? '✓ 全对' : `✗ ${rows.length}产出 vs ${goldRows.length}gold`;
  console.log(`${tCode}: ${brief}`);
}
console.log(`\n合计 ${total} 行期望，命中 ${okCnt} 行`);
if (diffs.length) { console.log('\n—— 差异明细 ——'); for (const d of diffs) console.log(' ', d); }
else console.log('\n全部与 gold 一致 ✓');
