// 数据库读写：raw_data.json（17列行对象数组，与前端 RAW_DATA 同构）
// 存储适配层：兼容 Cloudflare KV（免费套餐，无需绑卡）与 R2，以及本地测试（注入 memory 对象）
//   KV API : get(key, {type:'text'|'arrayBuffer'}) → string|ArrayBuffer|null ; put(key, value) ; delete(key)
//   R2 API : get(key) → R2Object|null（有 .text()/.arrayBuffer()）；put(key, value, {httpMetadata}) ；delete(key)

// ===== 适配层 =====

// 读文本：返回 string | null
export async function storeGetText(store, key) {
  if (!store) return null;
  try {
    const v = await store.get(key, { type: 'text' });
    if (v == null) return null;
    if (typeof v === 'string') return v;                       // KV
    if (typeof v.text === 'function') return await v.text();   // R2
    return null;
  } catch (e) {
    console.error('storeGetText error', e);
    return null;
  }
}

// 读二进制：返回 ArrayBuffer | null
export async function storeGetBytes(store, key) {
  if (!store) return null;
  try {
    const v = await store.get(key, { type: 'arrayBuffer' });
    if (v == null) return null;
    if (v instanceof ArrayBuffer) return v;                                 // KV
    if (typeof v.arrayBuffer === 'function') return await v.arrayBuffer();  // R2
    return null;
  } catch (e) {
    console.error('storeGetBytes error', e);
    return null;
  }
}

// 写入：value 支持 string|Uint8Array|ArrayBuffer|ReadableStream（KV 不支持流，自动转字节）
export async function storePut(store, key, value, contentType) {
  if (!store) return false;
  try {
    if (value && typeof value.getReader === 'function') {
      value = await streamToBytes(value);
    }
    if (contentType) {
      // R2 使用 httpMetadata；KV 忽略未知选项字段
      await store.put(key, value, { httpMetadata: { contentType } });
    } else {
      await store.put(key, value);
    }
    return true;
  } catch (e) {
    console.error('storePut error', e);
    return false;
  }
}

// 键是否存在
export async function storeExists(store, key) {
  if (!store) return false;
  try {
    const v = await store.get(key, { type: 'text' });
    return v != null;
  } catch {
    return false;
  }
}

async function streamToBytes(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const u8 = value instanceof Uint8Array ? value : new Uint8Array(value);
      chunks.push(u8);
      total += u8.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

// ===== 高层 API =====

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
    const text = await storeGetText(store, key);
    if (!text) return [];
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
  return storePut(store, key, JSON.stringify(rows));
}

// 按 公司+报告期 增量合并（upsert：匹配行替换，其余保留；新增行追加）
export function upsertRows(existing, incoming) {
  const out = existing.slice();
  incoming.forEach(r => {
    const key = `${r['公司名称']}|${r['报告期']}|${r['指标编号']}|${r['期间']}`;
    const idx = out.findIndex(x =>
      x['公司名称'] === r['公司名称'] && x['报告期'] === r['报告期'] &&
      x['指标编号'] === r['指标编号'] && x['期间'] === r['期间']);
    if (idx >= 0) {
      out[idx] = r;
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
    const text = await storeGetText(store, key);
    if (text == null) return fallback;
    return JSON.parse(text);
  } catch (e) {
    console.error('readJSON error', e);
    return fallback;
  }
}

export async function writeJSON(env, key, data, { memory } = {}) {
  const store = memory || env?.STORE;
  if (!store) return false;
  return storePut(store, key, JSON.stringify(data));
}

// 对象是否存在
export async function exists(env, key, { memory } = {}) {
  const store = memory || env?.STORE;
  return storeExists(store, key);
}

// 列出存储中指定前缀的 key 列表（KV: res.keys[].name；R2: res.objects[].key）
export async function storeList(store, prefix = '') {
  if (!store) return [];
  try {
    const res = await store.list({ prefix });
    if (res && Array.isArray(res.keys)) return res.keys.map(k => k.name).filter(Boolean);
    if (res && Array.isArray(res.objects)) return res.objects.map(o => o.key).filter(Boolean);
    return [];
  } catch (e) {
    console.error('storeList error', e);
    return [];
  }
}
