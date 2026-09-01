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
  // 从主聚集区起点开始取（表头在首个命中页），向后扩展：最多到"最后命中页+1"或"主聚集区末+3"，
  // 兼顾附注页（如其他综合收益明细在主表后 1-2 页）与防过度翻页
  const minP = Math.max(1, best.start);
  const maxP = Math.min(Math.max(...pages) + 1, best.end + 3);
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

专业术语对照（指标名与来源线索中的缩写含义，用于定位）：
- LC = 亏损部分（Loss Component，保险合同负债中亏损合同的组成部分）；期初LC=上年末/年初的亏损部分余额，期末LC=本年末余额
- PAA = 保费分配法（Premiums Allocation Approach）；未采用PAA=用一般计量模型（GMM）的合同
- BEL = 未来现金流量现值（Best Estimate Liability）；RA = 非金融风险调整；CSM = 合同服务边际（Contractual Service Margin）
- M1表 = 履约现金流量和合同服务边际余额调节表（期初/期末BEL、RA、CSM滚存）；M2表 = 未到期责任负债和已发生赔款负债余额调节表（LC滚存）
- "非亏损部分"=盈利合同组，"亏损部分"=亏损合同组（一行的多列，按来源线索中的列名取对应列值）

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

// 单页提取：返回 { _title, items: {编号: {本期,上期,披露单位}}, rows: [...] }
// 模式一（主）：模型按指标编号+来源线索语义提取（同事方法论：AI 直接定位取值）
// 模式二（兜底）：模型输出 rows 行提取，后端 matchIndicators 机械匹配
export async function extractTable(env, { tCode, tableName, indicators, sliceText, companyName, year }) {
  // 指标清单：编号 | 名称 | 期间 | 来源线索(PDF行名/列/方法) | 关键词
  const indicatorLines = indicators.map(r =>
    `${r['指标编号']} | ${r['指标名称']} | 期间: ${r['期间']} | 来源线索: ${r['指标来源'] || '—'} | 关键词: ${r['关键词'] || '—'}`
  ).join('\n');

  const user = `公司：${companyName}，报告期：${year}，目标报表：${tCode} ${tableName}

【指标清单】（逐项提取；"来源线索"给出该指标在 PDF 中的实际行名/列/方法描述，请据此在文本中定位）
${indicatorLines}

【PDF 文本片段】（坐标化表格视图，当前只有一页；"y="为行、"x="为列，同一 y 为同一行，表头在 y 最大处）
${sliceText}

【提取要点】
1. 先判断本页是否为"${tableName}"（或其续表）：不是则 _title 填实际报表名，rows 返回 []。
2. **把本页表格的每一行数据都列出来（行提取）**：行名保留 PDF 原文，带"减：""其中：""四、"前缀的也要列。每行的数值按表头列名组织（多列表如"非亏损部分/亏损部分/已发生赔款负债/合计"、单列表如"2025年度/2024年度"）。
3. 本期/上期：单列表按表头 x 坐标对齐判断（"2025年度/2024年度"或"本期/上期"或"期末/期初"），分别填入 本期/上期；本页只有一列时另一期间填 null——严禁因缺一列放弃该行。
4. 未找到的指标行：不列即可。整张表未披露：rows 返回 []，_title 填实际表名。
5. 数值为数字（去千分位、括号表负数）；文本值（折现率区间、置信水平）原样字符串。
6. 只输出 JSON，不要解释文字。

【输出要求】
{"_title": "合并利润表", "rows": [{"行名": "保险服务收入", "本期": 214136, "上期": 208161, "披露单位": "百万元"}, {"行名": "2025年1月1日的保险合同负债", "期间": "本期", "列": {"非亏损部分": 5687512, "亏损部分": 67105, "已发生赔款负债": 34839, "合计": 5789456}, "披露单位": "百万元"}]}
- 每行对象：行名（必填）+ 披露单位（必填）+ 本期/上期（单列表，缺填 null）+ "列"（多列表，可选，键=表头列名，值=该行该列数值）+ "期间"（可选，如"本期"/"上期"——本页数据对应哪一期）
- **多列表务必输出"列"结构（每个列名对应一个值），不要只给一个数字**；单列表输出 本期/上期 即可
- 严禁漏行：所有数据行（含小计/合计/其中行）都要列出，行名保留原文
- 输出里不得出现除 _title 和 rows 外的顶层 key`;

  const content = await chat(env, {
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: user }],
    temperature: 0,
    maxTokens: 8000,
    jsonMode: true
  });

  const parsed = parseJSON(content);
  const result = { _title: '', items: {}, rows: [], raw: String(content).slice(0, 400) };
  // 模式一：items 按编号输出
  if (Array.isArray(parsed.items)) {
    result._title = String(parsed._title || '').trim();
    for (const it of parsed.items) {
      const code = String(it['指标编号'] || it['code'] || '').trim();
      if (!code) continue;
      result.items[code] = {
        本期: it['本期'] ?? it['本年度'] ?? null,
        上期: it['上期'] ?? it['上年度'] ?? null,
        披露单位: String(it['披露单位'] || it['unit'] || '').trim()
      };
    }
    return result;
  }
  // 模式二：rows 行提取（后端匹配；支持"列"多列结构与"期间"标注）
  if (Array.isArray(parsed.rows)) {
    result._title = String(parsed._title || '').trim();
    for (const r of parsed.rows) {
      result.rows.push({
        行名: String(r['行名'] || r['项目名'] || '').trim(),
        本期: r['本期'] ?? r['本年度'] ?? null,
        上期: r['上期'] ?? r['上年度'] ?? null,
        期间: String(r['期间'] || '').trim(), // 多列表本页对应期（"本期"/"上期"）
        列: (r['列'] && typeof r['列'] === 'object' && !Array.isArray(r['列'])) ? r['列'] : null,
        披露单位: String(r['披露单位'] || r['unit'] || '').trim(),
        来源: `${tCode} ${tableName}`
      });
    }
    return result;
  }
  // 模式三：旧格式兼容 {编号: {本期,上期}} 或 {编号本期: 值}
  for (const [rawKey, item] of Object.entries(parsed)) {
    if (rawKey === '_title') { result._title = String(item || '').trim(); continue; }
    const km = String(rawKey).match(/^([A-Z]\d+)/);
    if (!km) continue;
    const code = km[1];
    const suffix = String(rawKey).slice(code.length);
    if (typeof item === 'object' && item !== null) {
      result.items[code] = {
        本期: item['本期'] ?? item['本年度'] ?? null,
        上期: item['上期'] ?? item['上年度'] ?? null,
        披露单位: String(item['披露单位'] || item['unit'] || '').trim()
      };
    } else {
      result.items[code] = result.items[code] || { 本期: null, 上期: null, 披露单位: '' };
      if (suffix.includes('上')) result.items[code]['上期'] = item ?? null;
      else result.items[code]['本期'] = item ?? null;
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

// 行名日期归一：去"2025年1月1日"式日期与"的"（用于跨年度行名匹配，如"2025年1月1日的保险合同负债"）
export function normDateRow(s) {
  return normRowName(s)
    .replace(/\d{4}年\d{1,2}月\d{1,2}日/g, '')
    .replace(/^的/, '');
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
  const candidatesOf = (r) => {
    const code = r[5];
    const indName = r[6];
    const keyword = String(r[8] || '');
    // 来源线索（模板 r[7]）：含 PDF 实际行名（如"2025年1月1日的保险合同负债-亏损部分-未采用PAA"）
    // 取行名主体段：去日期/期间/合并后缀后的第一段
    const srcCore = String(r[7] || '')
      .replace(/\d{4}年\d{1,2}月\d{1,2}日/g, '')
      .replace(/[-（()）]/g, '')
      .replace(/-期末$|-期初$|-本期$|-上期$|-合并.*$/g, '')
      .split(/[-·]/)[0] || '';
    const cands = [];
    rows.forEach((row, idx) => {
      if (usedRows.has(idx)) return;
      const rowName = row['行名'];
      if (!rowName) return;
      const rn = normRowName(rowName);
      const rnDate = normDateRow(rowName); // 去日期（"2025年1月1日的保险合同负债"→"保险合同负债"）
      const inN = normRowName(indName);
      // 关键词核心（去掉"-合并-本期"等后缀）
      const kwCore = normRowName(keyword.replace(/-合并-.*$/, '').replace(/-本期.*$/, '').replace(/-上期.*$/, ''));
      const sCore = normDateRow(srcCore);
      if (!rn || !inN) return;
      let score = -1;
      if (rn === inN) score = 4;
      else if (rn.startsWith(inN)) score = 3;
      else if (inN.startsWith(rn)) score = 2;
      else if (kwCore && (rn === kwCore || rn.startsWith(kwCore))) score = 3;
      else if (sCore && (rnDate === sCore || rnDate.startsWith(sCore) || sCore.startsWith(rnDate))) score = 3;
      else if (rn.includes(inN) && !rn.startsWith('摊回') && !rn.startsWith('减') && !rn.startsWith('其中')) score = 1;
      if (score >= 0) cands.push({ idx, row, score });
    });
    cands.sort((a, b) => b.score - a.score);
    return { code, cands };
  };
  // 从行对象取值：多列表按来源线索列名选列；单列表用本期/上期
  // 返回 { 本期, 上期, _colMatched: bool }
  const COL_NAMES = ['非亏损部分', '亏损部分', '已发生赔款负债', '合同服务边际', '未来现金流量现值', '非金融风险调整', '非亏损合同', '亏损合同', '合计', '未来现金流入现值', '保险获取现金流量', '税后净额'];
  const rowValue = (row, r7) => {
    const clue = String(r7 || '');
    // 从行对象的实际列键中，找来源线索提到的列名（顺序=常用列优先级）
    const colName = row['列'] ? (COL_NAMES.find(c => clue.includes(c) && row['列'][c] !== undefined) || null) : null;
    const per = (row['期间'] || '本期') === '上期' ? '上期' : '本期';
    if (colName) {
      return per === '上期'
        ? { 本期: null, 上期: row['列'][colName], _colMatched: true }
        : { 本期: row['列'][colName], 上期: null, _colMatched: true };
    }
    if (row['列']) {
      // 有列但线索列名未匹配：取非空列值（一般"合计"在最后），标记可疑
      const vals = Object.values(row['列']).filter(v => v !== null && v !== undefined && v !== '');
      const v = vals.length ? vals[vals.length - 1] : null;
      return per === '上期'
        ? { 本期: null, 上期: v, _colMatched: false }
        : { 本期: v, 上期: null, _colMatched: false };
    }
    return { 本期: row['本期'] ?? null, 上期: row['上期'] ?? null, _colMatched: true };
  };
  // 第一轮：只取高置信候选（score>=3），保证"债权投资"不会抢"其他债权投资"
  // 注意：同一指标编号有"本期/上期"两条模板行 → 合并期间值而非覆盖
  const pending = [];
  for (const r of indicators) {
    const { code, cands } = candidatesOf(r);
    const high = cands.find(c => c.score >= 3);
    if (high) {
      usedRows.add(high.idx);
      const row = high.row;
      const v = rowValue(row, r[7]);
      const prev = out[code] || {};
      out[code] = {
        本期: v['本期'] ?? prev['本期'] ?? null,
        上期: v['上期'] ?? prev['上期'] ?? null,
        披露单位: row['披露单位'] || prev['披露单位'] || r[10] || '',
        行名: row['行名'],
        来源: row['来源'] || prev['来源'] || `${r[3]} ${r[4]}`,
        _suspicious: (prev['_suspicious'] || false) || !v['_colMatched']
      };
    } else if (cands.length) {
      pending.push({ r, cands });
    }
  }
  // 第二轮：剩余指标用低分候选（可能不精确），标记 _suspicious；
  // 同一指标编号已在高分轮匹配过（另一期间行）则跳过，避免低分候选覆盖正确结果
  for (const { r, cands } of pending) {
    const code = r[5];
    if (out[code]) continue;
    const best = cands[0];
    if (!best) continue;
    usedRows.add(best.idx);
    const row = best.row;
    const v = rowValue(row, r[7]);
    out[code] = {
      本期: v['本期'],
      上期: v['上期'],
      披露单位: row['披露单位'] || r[10] || '',
      行名: row['行名'],
      来源: row['来源'] || `${r[3]} ${r[4]}`,
      _suspicious: best.score < 3 || !v['_colMatched']
    };
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
        // 靠后的页优先：非 null 值覆盖（含多列结构与期间）
        allRows[dup] = {
          行名: row['行名'],
          本期: row['本期'] ?? allRows[dup]['本期'],
          上期: row['上期'] ?? allRows[dup]['上期'],
          期间: row['期间'] || allRows[dup]['期间'] || '',
          列: row['列'] || allRows[dup]['列'] || null,
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
