// R2 数据库读写：raw_data.json（17列行对象数组，与前端 RAW_DATA 同构）
// 兼容本地测试（注入 memory 对象）与 Cloudflare R2 两种后端

// 数据行字段（与 data.js RAW_DATA 一致）
export const DB_HEADERS = ['公司类型', '公司名称', '报告期', '报表类型', '报表名称', '指标编号', '指标名称',
  '指标来源', '关键词', '期间', '计量单位-披露', '计量单位-换算', '数值-披露', '数值-换算',
  '来源表', '行序号', '列序号'];

// 读取数据库
export async function readDB(env, { memory } = {}) {
  const store = memory || env?.STORE;
  if (!store) return [];
  const key = env?.DB_KEY || 'raw_data.json';
  try {
    const obj = await store.get(key);
    if (!obj) return [];
    const text = await obj.text();
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('readDB error', e);
    return [];
  }
}

// 写入数据库（整体覆盖）
export async function writeDB(env, rows, { memory } = {}) {
  const store = memory || env?.STORE;
  if (!store) return false;
  const key = env?.DB_KEY || 'raw_data.json';
  await store.put(key, JSON.stringify(rows));
  return true;
}

// 按 公司+报告期 增量合并（upsert：匹配行替换，其余保留；新增行追加）
export function upsertRows(existing, incoming) {
  const out = existing.slice();
  const replaced = new Set(); // '公司|报告期|指标编号|期间' 已替换的 key
  incoming.forEach(r => {
    const key = `${r['公司名称']}|${r['报告期']}|${r['指标编号']}|${r['期间']}`;
    const idx = out.findIndex(x =>
      x['公司名称'] === r['公司名称'] && x['报告期'] === r['报告期'] &&
      x['指标编号'] === r['指标编号'] && x['期间'] === r['期间']);
    if (idx >= 0) {
      out[idx] = r;
      replaced.add(key);
    } else {
      out.push(r);
    }
  });
  return out;
}

// 范围删除：filters = { 公司名称: [...], 报告期: [...], 指标编号: [...] }，命中任一维度即删除（取并集）
export function deleteRows(rows, filters) {
  const hasFilter = filters && (
    (filters['公司名称'] && filters['公司名称'].length) ||
    (filters['报告期'] && filters['报告期'].length) ||
    (filters['指标编号'] && filters['指标编号'].length));
  if (!hasFilter) return { rows, deleted: 0 };
  const keep = [];
  let deleted = 0;
  rows.forEach(r => {
    const hit = (
      (filters['公司名称'] && filters['公司名称'].includes(r['公司名称'])) ||
      (filters['报告期'] && filters['报告期'].includes(r['报告期'])) ||
      (filters['指标编号'] && filters['指标编号'].includes(r['指标编号']))
    );
    if (hit) deleted++;
    else keep.push(r);
  });
  return { rows: keep, deleted };
}

// 读取/写入 JSON 对象（模板、状态、sources 通用）
export async function readJSON(env, key, fallback = null, { memory } = {}) {
  const store = memory || env?.STORE;
  if (!store) return fallback;
  try {
    const obj = await store.get(key);
    if (!obj) return fallback;
    return JSON.parse(await obj.text());
  } catch (e) {
    console.error('readJSON error', e);
    return fallback;
  }
}

export async function writeJSON(env, key, data, { memory } = {}) {
  const store = memory || env?.STORE;
  if (!store) return false;
  await store.put(key, JSON.stringify(data));
  return true;
}

// R2 对象是否存在
export async function exists(env, key, { memory } = {}) {
  const store = memory || env?.STORE;
  if (!store) return false;
  try {
    const obj = await store.get(key);
    return !!obj;
  } catch { return false; }
}
