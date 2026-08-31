// 勾稽验证（手册 §4.4）：对提取结果做三项勾稽，返回校验报告
// 输入：extracted = 按指标编号聚合的 { code: { '本期': v, '上期': v } } 或 直接传行数组
// 说明：所有值以"数值-换算"（亿元）为准；费用类若披露为负值则按其符号，公式按会计恒等关系
// 容差：亿元单位下 0.05 以内视为通过（末位尾差可接受）

const EPS = 0.05;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function buildAggregates(rows) {
  // rows: RAW_DATA 行数组 → { code: { 期间: 值 } }
  const agg = {};
  rows.forEach(r => {
    const code = r['指标编号'];
    const per = r['期间'];
    const v = num(r['数值-换算']);
    if (!code || v === null) return;
    agg[code] = agg[code] || {};
    // 期间归一：本期初/本期末 等只统计 本期/上期 勾稽所需项；先原样记录
    if (per === '本期' || per === '上期' || per === '本期初' || per === '本期末' || per === '上期初' || per === '上期末') {
      agg[code][per] = v;
    }
  });
  return agg;
}

// 三项勾稽（针对"本期"）：返回 [{name, pass, detail, values}]
export function runChecks(rows) {
  const agg = buildAggregates(rows);
  const checks = [];

  // 1) 利润总额 + 所得税费用 = 净利润（B15+B16=B17）
  {
    const b15 = agg['B15']?.['本期'], b16 = agg['B16']?.['本期'], b17 = agg['B17']?.['本期'];
    if (b15 !== undefined && b16 !== undefined && b17 !== undefined) {
      const diff = Math.abs(b15 + b16 - b17);
      checks.push({
        name: '利润勾稽', pass: diff <= EPS,
        detail: `B15利润总额 ${fmt(b15)} + B16所得税 ${fmt(b16)} = ${fmt(b15 + b16)}，B17净利润 ${fmt(b17)}，差 ${fmt(diff)}`,
        values: { B15: b15, B16: b16, B17: b17 }
      });
    } else {
      checks.push({ name: '利润勾稽', pass: null, detail: 'B15/B16/B17 本期数据缺失，跳过' });
    }
  }

  // 2) M2 LC调节：C01期初LC + C02计息 + C03亏损确认转回 + C04摊销 = C05期末LC（本期）
  {
    const c1 = agg['C01']?.['本期'], c2 = agg['C02']?.['本期'], c3 = agg['C03']?.['本期'],
      c4 = agg['C04']?.['本期'], c5 = agg['C05']?.['本期'];
    if (c1 !== undefined && c2 !== undefined && c3 !== undefined && c4 !== undefined && c5 !== undefined) {
      const sum = c1 + c2 + c3 + c4;
      const diff = Math.abs(sum - c5);
      checks.push({
        name: 'LC调节', pass: diff <= EPS,
        detail: `C01期初LC ${fmt(c1)} + C02计息 ${fmt(c2)} + C03确认转回 ${fmt(c3)} + C04摊销 ${fmt(c4)} = ${fmt(sum)}，C05期末LC ${fmt(c5)}，差 ${fmt(diff)}`,
        values: { C01: c1, C02: c2, C03: c3, C04: c4, C05: c5 }
      });
    } else {
      checks.push({ name: 'LC调节', pass: null, detail: 'C01-C05 本期数据缺失，跳过' });
    }
  }

  // 3) M1 CSM调节：D05期初CSM + D06计息 - D07摊销 + D08新单 + D09吸收 = D10期末CSM（本期）
  // 注意 D07 若披露为负值（摊销减项），公式按恒等：期初+计息+摊销(含符号)+新单+吸收=期末
  {
    const d5 = agg['D05']?.['本期'], d6 = agg['D06']?.['本期'], d7 = agg['D07']?.['本期'],
      d8 = agg['D08']?.['本期'], d9 = agg['D09']?.['本期'], d10 = agg['D10']?.['本期'];
    if (d5 !== undefined && d6 !== undefined && d7 !== undefined && d8 !== undefined && d9 !== undefined && d10 !== undefined) {
      // 摊销符号自适应：若 D07 为正数则按减，负数则按加
      const sum = d5 + d6 + (d7 <= 0 ? d7 : -d7) + d8 + d9;
      const diff = Math.abs(sum - d10);
      checks.push({
        name: 'CSM调节', pass: diff <= EPS,
        detail: `D05期初CSM ${fmt(d5)} + D06计息 ${fmt(d6)} + D07摊销 ${fmt(d7)} + D08新单 ${fmt(d8)} + D09吸收 ${fmt(d9)} = ${fmt(sum)}，D10期末CSM ${fmt(d10)}，差 ${fmt(diff)}`,
        values: { D05: d5, D06: d6, D07: d7, D08: d8, D09: d9, D10: d10 }
      });
    } else {
      checks.push({ name: 'CSM调节', pass: null, detail: 'D05-D10 本期数据缺失，跳过' });
    }
  }

  // 4) LC调节-PAA：C10期初LC + C11计息 + C12亏损确认转回 + C13摊销 = C14期末LC（本期）
  {
    const c10 = agg['C10']?.['本期'], c11 = agg['C11']?.['本期'], c12 = agg['C12']?.['本期'],
      c13 = agg['C13']?.['本期'], c14 = agg['C14']?.['本期'];
    if (c10 !== undefined && c11 !== undefined && c12 !== undefined && c13 !== undefined && c14 !== undefined) {
      const sum = c10 + c11 + c12 + c13;
      const diff = Math.abs(sum - c14);
      checks.push({
        name: 'LC调节-PAA', pass: diff <= EPS,
        detail: `C10期初LC ${fmt(c10)} + C11计息 ${fmt(c11)} + C12确认转回 ${fmt(c12)} + C13摊销 ${fmt(c13)} = ${fmt(sum)}，C14期末LC ${fmt(c14)}，差 ${fmt(diff)}`,
        values: { C10: c10, C11: c11, C12: c12, C13: c13, C14: c14 }
      });
    } else {
      checks.push({ name: 'LC调节-PAA', pass: null, detail: 'C10-C14 本期数据缺失，跳过' });
    }
  }

  // 5) E系列勾稽：E01=E02+E03、E04=E05+E06、E07=E08+E09（本期）
  [['E01', 'E02', 'E03'], ['E04', 'E05', 'E06'], ['E07', 'E08', 'E09']].forEach(([sumCode, aCode, bCode]) => {
    const sum = agg[sumCode]?.['本期'], a = agg[aCode]?.['本期'], b = agg[bCode]?.['本期'];
    if (sum !== undefined && a !== undefined && b !== undefined) {
      const diff = Math.abs(sum - (a + b));
      checks.push({
        name: `E勾稽-${sumCode}`, pass: diff <= EPS,
        detail: `${sumCode}合计 ${fmt(sum)} vs ${aCode} ${fmt(a)} + ${bCode} ${fmt(b)} = ${fmt(a + b)}，差 ${fmt(diff)}`,
        values: { sum: sum, a: a, b: b }
      });
    } else {
      checks.push({ name: `E勾稽-${sumCode}`, pass: null, detail: `${sumCode}/${aCode}/${bCode} 本期数据缺失，跳过` });
    }
  });

  // 6) T08非履约费用勾稽：H03 = |B14|（本期）
  {
    const h3 = agg['H03']?.['本期'], b14 = agg['B14']?.['本期'];
    if (h3 !== undefined && b14 !== undefined) {
      const diff = Math.abs(h3 - Math.abs(b14));
      checks.push({
        name: 'T08勾稽', pass: diff <= EPS,
        detail: `H03非履约费用 ${fmt(h3)} vs |B14业务及管理费| ${fmt(Math.abs(b14))}，差 ${fmt(diff)}`,
        values: { H03: h3, B14: b14 }
      });
    } else {
      checks.push({ name: 'T08勾稽', pass: null, detail: 'H03/B14 本期数据缺失，跳过' });
    }
  }

  return checks;
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(2);
}
