// 提取核心：对 PDF 全文按报表定位 → DeepSeek 提取指标 → 组装 RAW_DATA 行
// 对应手册：Step2 模板、Step3 数据提取、§4.1 十张表清单、§5.3 符号规则、§5.4 0与未披露规则
import { chat, parseJSON } from './deepseek.js';

// 报表定位关键词（手册 §4.1）
export const TABLE_KEYWORDS = {
  T01: ['合并资产负债表'],
  T02: ['合并利润表'],
  T03: ['保险合同负债余额调节', '负债余额调节表'],
  T04: ['履约现金流量', '合同服务边际', '履约现金流和合同服务边际'],
  T05: ['初始确认', '当期初始确认的影响'],
  T06: ['保险服务收入'],
  T07: ['合同服务边际', '修正追溯', '公允价值法', '过渡'],
  T08: ['业务及管理费'],
  T09: ['折现率'],
  T10: ['非金融风险调整', '置信水平']
};

// 单位换算：披露单位 → 亿元
const UNIT_FACTOR = {
  '元': 1e-8, '千元': 1e-5, '万元': 1e-4, '百万元': 1e-2, '千万元': 1e-1, '亿元': 1,
  '百万': 1e-2, '十万': 1e-3
};

export function convToYi(val, dispUnit) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  const factor = UNIT_FACTOR[String(dispUnit || '').trim()];
  if (!factor) return n; // 未知单位原样返回
  return n * factor;
}

// 定位某张报表在全文中的页区间：返回 { startPage, endPage }（前后各扩 1 页）
export function locateTable(fullText, keywords) {
  const pageMarkers = [];
  const regex = /===== PDF_PAGE_(\d+) =====/g;
  let m;
  while ((m = regex.exec(fullText)) !== null) {
    pageMarkers.push({ page: parseInt(m[1]), idx: m.index });
  }
  const matches = [];
  for (const kw of keywords) {
    let idx = fullText.indexOf(kw);
    while (idx !== -1) {
      // 找到 idx 属于哪一页
      let page = 1;
      for (const pm of pageMarkers) {
        if (pm.idx <= idx) page = pm.page;
        else break;
      }
      matches.push(page);
      idx = fullText.indexOf(kw, idx + kw.length);
    }
  }
  if (matches.length === 0) return null;
  const pages = [...new Set(matches)].sort((a, b) => a - b);
  // 取主聚集区：找最大连续块（页间距 <= 2 视为连续），忽略离群页（如利润表的附注引用页）
  let best = { start: pages[0], end: pages[0], len: 1 };
  let cur = { start: pages[0], end: pages[0], len: 1 };
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] - cur.end <= 2) {
      cur.end = pages[i]; cur.len++;
    } else {
      if (cur.len > best.len) best = { ...cur };
      cur = { start: pages[i], end: pages[i], len: 1 };
    }
  }
  if (cur.len > best.len) best = { ...cur };
  // 从主聚集区起点开始取（表头在首个命中页），向后多取1页防续表；不向前扩，避免带入上一张表
  const minP = Math.max(1, best.start);
  const maxP = best.end + 1;
  return { startPage: minP, endPage: maxP, hitPages: pages };
}

// 截取页区间文本（纯文本流，用于定位后的粗看）
export function slicePages(fullText, startPage, endPage) {
  const blocks = fullText.split(/===== PDF_PAGE_(\d+) =====/);
  // split 后: [prefix, pageNum, content, pageNum, content...]
  const out = [];
  for (let i = 1; i < blocks.length; i += 2) {
    const p = parseInt(blocks[i]);
    if (p >= startPage && p <= endPage) {
      out.push(`===== PDF_PAGE_${p} =====\n${blocks[i + 1] || ''}`);
    }
  }
  return out.join('\n');
}

// 系统提示词（手册规则固化）
export function buildSystemPrompt() {
  return `你是保险业 IFRS17 年报数据提取专家。根据给定的年报 PDF 文本片段与指标清单，精确提取指标数值。

文本格式说明：文本是按坐标重建的表格视图——"y=700" 表示该行的垂直位置（y 越大越靠上），每项前 "[x=98]" 表示水平位置（x 越小越靠左）。同一 y 为同一行，同一表格的列按 x 对齐：表头行在 y 最大处，数据行依次向下。请用 x 对齐关系判断"期末/期初"（或"本期/上期"）各属于哪一列，不要被文字先后顺序误导。

提取规则（必须严格遵守）：
1. 未找到的指标：值填 null，禁止编造。若年报明确写"不适用/未披露"也填 null。
2. 区分"本期"与"上期"（本期=本报告年度末，上期=上年同期/年初）。
3. 利润表符号（§5.3）：按披露原样填写。若为"收入正+支出负"格式按披露；若为"收入-支出正数"格式（支出为正数），B07-B14 需取反为负值。
4. B16 所得税费用：按"利润总额+所得税费用=净利润"勾稽关系确定符号，勿盲信"减："文字。
5. 没有的科目填 0（如汇兑损益、其他资产减值损失、手续费及佣金、权益法下其他综合收益、过渡日未使用修正追溯/公允价值法的 CSM）。
6. 全部合同非 PAA 时，C10-C14 填 0（不是"不适用"）。
7. 折现率 I01 是文本区间（如"1.46%-4.53%"），原样返回字符串。J01 置信水平（如"75%"）原样返回字符串。
8. 只输出 JSON，不要任何解释文字。`;
}

// 单页提取：返回 { _title, 指标编号: {...} }
// _title = 该页表格标题（如"合并利润表"），供后端过滤非合并报表页
export async function extractTable(env, { tCode, tableName, indicators, sliceText, companyName, year }) {
  const indicatorLines = indicators.map(r =>
    `${r['指标编号']} | 项目名: ${r['指标名称']} | 别名/关键词: ${r['关键词']} | 期间: ${r['期间']} | 披露单位: ${r['计量单位-披露']}`
  ).join('\n');

  const user = `公司：${companyName}，报告期：${year}，目标报表：${tCode} ${tableName}

指标清单（请逐项提取，未找到填 null）：
${indicatorLines}

PDF 文本片段（坐标化表格视图，当前只有一页）：
${sliceText}

【提取要点】
- 首先判断本页是否为"${tableName}"（或其后半部分）：如果本页是其它报表（如公司利润表、资产负债表等），把所有指标填 null 并返回 _title 为该报表标题。
- 每个指标必须与文本中"项目名"完全匹配（行首项目名），严禁取整行合计、严禁跨行错位、严禁子串误匹配（如"摊回保险服务费用"≠"保险服务费用"、"利息支出"≠"利润总额"；"减：xxx""四、xxx"中的 xxx 才是行名）。
- 数值列按 x 坐标对齐表头"2025年度/2024年度"（或"本期/上期"）判断属于本期还是上期。

【输出要求】只输出一个 JSON 对象，把本页表格的每一行都列出来（只做行提取，不负责匹配指标编号）：
{"_title": "合并利润表", "rows": [{"行名": "保险服务收入", "本期": 214136, "上期": 208161, "披露单位": "百万元"}, {"行名": "减：所得税费用", "本期": -25077, "上期": -6273, "披露单位": "百万元"}]}
注意：
- 把所有数据行都列出（含小计、合计行、带"减：""其中：""四、"前缀的行），行名保留原文
- 每行的本期/上期按表头 x 坐标对齐判断，缺失填 null
- 数值为数字（去千分位、括号表示负数），文本值（折现率区间、置信水平）原样字符串
- 输出里不得出现除 _title 和 rows 外的顶层 key`;

  const content = await chat(env, {
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxTokens: 8000,
    jsonMode: true
  });

  const parsed = parseJSON(content);
  // 输出格式：{_title, rows: [{行名, 本期, 上期, 披露单位}]}；兼容旧格式 {B01: {本期,上期,...}}
  const result = { _title: '', rows: [] };
  if (Array.isArray(parsed.rows)) {
    result._title = String(parsed._title || '').trim();
    for (const r of parsed.rows) {
      result.rows.push({
        行名: String(r['行名'] || r['项目名'] || '').trim(),
        本期: r['本期'] ?? r['本年度'] ?? null,
        上期: r['上期'] ?? r['上年度'] ?? null,
        披露单位: String(r['披露单位'] || r['unit'] || '').trim(),
        来源: `${tCode} ${tableName}`
      });
    }
    return result;
  }
  // 旧格式兼容：指标编号 → 值
  for (const [rawKey, item] of Object.entries(parsed)) {
    if (rawKey === '_title') {
      result._title = String(item || '').trim();
      continue;
    }
    const km = String(rawKey).match(/^([A-Z]\d+)/);
    if (!km) continue;
    const code = km[1];
    const suffix = String(rawKey).slice(code.length);
    if (typeof item === 'object' && item !== null) {
      result.rows.push({
        行名: String(item['行名'] || item['项目名'] || '').trim(),
        本期: item['本期'] ?? item['本年度'] ?? null,
        上期: item['上期'] ?? item['上年度'] ?? null,
        披露单位: String(item['披露单位'] || item['unit'] || '').trim(),
        来源: `${tCode} ${tableName}`
      });
    } else {
      // 顶层 key 带期间后缀（如 B01本期）：值就是该期间数值
      const exist = result.rows.find(r => r._code === code);
      if (exist) {
        if (suffix.includes('上')) exist['上期'] = item ?? null;
        else exist['本期'] = item ?? null;
      } else {
        result.rows.push({ _code: code, 行名: code, 本期: suffix.includes('上') ? null : (item ?? null), 上期: suffix.includes('上') ? (item ?? null) : null, 披露单位: '', 来源: `${tCode} ${tableName}` });
      }
    }
  }
  return result;
}

// 行名规范化：去序数前缀（"四、"）、去"减：/其中：/加："前缀、去空白标点
export function normRowName(s) {
  return String(s || '')
    .replace(/^[一二三四五六七八九十]+[、,，]?/, '')
    .replace(/^减[:：]?/, '')
    .replace(/^其中[:：]?/, '')
    .replace(/^加[:：]?/, '')
    .replace(/[\s，,、()（）]/g, '');
}

// 行名校验：规范化后，行名与指标名相等、互含或行名以指标名开头
export function rowNameMatches(rowName, indName) {
  if (!rowName || !indName) return false;
  const r = normRowName(rowName), i = normRowName(indName);
  if (!r || !i) return false;
  return r === i || r.startsWith(i) || i.startsWith(r);
}

// 用后端算法把模板指标匹配到提取出的行（确定性匹配，避免模型编码错乱）
// indicators: 模板行（含 指标编号/指标名称/关键词/期间/计量单位-披露）
// rows: 提取的行 [{行名, 本期, 上期, 披露单位}]
// 返回 { code: { 本期, 上期, 披露单位, 行名, 来源 } }（含可疑项 _suspicious 标记）
export function matchIndicators(indicators, rows) {
  const out = {};
  const usedRows = new Set();
  for (const r of indicators) {
    const code = r[5];
    const indName = r[6];
    const keyword = String(r[8] || '');
    // 候选行：行名与指标名（或关键词核心）匹配，按精确度排序
    const cands = [];
    rows.forEach((row, idx) => {
      if (usedRows.has(idx)) return;
      const rowName = row['行名'];
      if (!rowName) return;
      const rn = normRowName(rowName);
      const inN = normRowName(indName);
      // 关键词核心（去掉"-合并-本期"等后缀）
      const kwCore = normRowName(keyword.replace(/-合并-.*$/, '').replace(/-本期.*$/, '').replace(/-上期.*$/, ''));
      if (!rn || !inN) return;
      let score = -1;
      if (rn === inN) score = 4;
      else if (rn.startsWith(inN)) score = 3;
      else if (inN.startsWith(rn)) score = 2;
      else if (kwCore && (rn === kwCore || rn.startsWith(kwCore))) score = 3;
      else if (rn.includes(inN) && !rn.startsWith('摊回') && !rn.startsWith('减')) score = 1;
      if (score >= 0) cands.push({ idx, row, score });
    });
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    if (best) {
      usedRows.add(best.idx);
      const row = best.row;
      out[code] = {
        本期: row['本期'] ?? null,
        上期: row['上期'] ?? null,
        披露单位: row['披露单位'] || r[10] || '',
        行名: row['行名'],
        来源: row['来源'] || `${r[3]} ${r[4]}`,
        _suspicious: best.score < 3
      };
    }
  }
  return out;
}

// 合并多页提取结果（rows 格式）：过滤 _title 与目标表名不匹配的页，合并行数组（按行名去重，靠后的页优先）
export function mergePageResults(pages, tableName) {
  const expect = String(tableName).replace(/[\s（()）]/g, '');
  const allRows = [];
  for (const pageRes of pages) {
    const title = String(pageRes._title || '').replace(/[\s（()）]/g, '');
    // 标题为空但提取到行：信任（单页场景）；标题非空则必须与目标表名匹配
    if (title && !expect.includes(title) && !title.includes(expect.slice(0, 4))) {
      continue; // 非目标报表页，丢弃
    }
    for (const row of (pageRes.rows || [])) {
      if (!row['行名']) continue;
      const dup = allRows.findIndex(x => x['行名'] === row['行名']);
      if (dup >= 0) {
        // 靠后的页优先：非 null 值覆盖
        allRows[dup] = {
          行名: row['行名'],
          本期: row['本期'] ?? allRows[dup]['本期'],
          上期: row['上期'] ?? allRows[dup]['上期'],
          披露单位: row['披露单位'] || allRows[dup]['披露单位'],
          来源: row['来源'] || allRows[dup]['来源']
        };
      } else {
        allRows.push({ ...row });
      }
    }
  }
  return allRows;
}
