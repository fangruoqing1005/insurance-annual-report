// 本地测试：KV 适配层（模拟 Cloudflare KV 行为）
import {
  readDB, writeDB, readJSON, writeJSON, exists,
  storeGetText, storeGetBytes, storePut, storeExists,
  upsertRows, deleteRows
} from '../functions/_lib/db.js';

// ===== 模拟 KV：get(key, {type}) → string|ArrayBuffer|null；put(key, value) =====
class MockKV {
  constructor() { this.map = new Map(); }
  async get(key, opts = {}) {
    const v = this.map.get(key);
    if (v === undefined) return null;
    if (opts.type === 'arrayBuffer') {
      if (v instanceof ArrayBuffer) return v;
      if (v instanceof Uint8Array) return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
      // 文本存储：编码回字节
      return new TextEncoder().encode(v).buffer;
    }
    if (opts.type === 'text') {
      if (typeof v === 'string') return v;
      if (v instanceof Uint8Array) return new TextDecoder().decode(v);
      if (v instanceof ArrayBuffer) return new TextDecoder().decode(v);
    }
    return v;
  }
  async put(key, value, opts) {
    this.map.set(key, value);
  }
  async delete(key) { this.map.delete(key); }
}

// ===== 模拟 ReadableStream（File.stream() 在 Cloudflare 返回的流）=====
function makeStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new Uint8Array(c));
      controller.close();
    }
  });
}

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name); }
}

const kv = new MockKV();
const env = { STORE: kv, DB_KEY: 'raw_data.json', TPL_KEY: 'template_163.json', PDF_PREFIX: 'pdfs/' };

console.log('== 1. 数据库文本读写 ==');
assert('空库 readDB 返回 []', (await readDB(env)).length === 0);
const rows = [
  { '公司名称': '中国人寿', '报告期': '2025年度', '指标编号': 'A01', '期间': '期末', '数值-换算': 20672.88 },
  { '公司名称': '平安人寿', '报告期': '2025年度', '指标编号': 'B15', '期间': '本期', '数值-换算': 100.5 }
];
await writeDB(env, rows);
const got = await readDB(env);
assert('写入后读回 2 行', got.length === 2 && got[0]['指标编号'] === 'A01');
assert('数值类型保持 number', typeof got[0]['数值-换算'] === 'number');

console.log('== 2. JSON 对象读写（模板）==');
await writeJSON(env, 'template_163.json', [[1, 2, 3]]);
assert('template 读回', JSON.stringify(await readJSON(env, 'template_163.json')) === '[[1,2,3]]');
assert('不存在的 key 返回 fallback', (await readJSON(env, 'nope.json', 'FB')) === 'FB');

console.log('== 3. PDF 二进制读写 ==');
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 0, 255, 128]); // %PDF-1.4 + 二进制
await storePut(kv, 'pdfs/中国人寿_2025年度.pdf', pdfBytes, 'application/pdf');
const back = await storeGetBytes(kv, 'pdfs/中国人寿_2025年度.pdf');
assert('二进制字节原样返回', back instanceof ArrayBuffer && new Uint8Array(back).length === pdfBytes.length);
assert('字节内容一致', new Uint8Array(back)[0] === 37 && new Uint8Array(back)[8] === 0 && new Uint8Array(back)[9] === 255);
assert('exists 为 true', await exists(env, 'pdfs/中国人寿_2025年度.pdf'));
assert('exists 不存在为 false', !(await exists(env, 'pdfs/xxx.pdf')));

console.log('== 4. ReadableStream 写入（模拟上传 file.stream()）==');
const stream = makeStream([[1, 2, 3, 4], [5, 6, 7]]);
await storePut(kv, 'pdfs/流式测试.pdf', stream, 'application/pdf');
const streamBack = await storeGetBytes(kv, 'pdfs/流式测试.pdf');
assert('流写入读回 7 字节', new Uint8Array(streamBack).length === 7);
assert('流内容正确', Array.from(new Uint8Array(streamBack)).join(',') === '1,2,3,4,5,6,7');

console.log('== 5. upsert / delete ==');
const merged = upsertRows(rows, [{ '公司名称': '平安人寿', '报告期': '2025年度', '指标编号': 'B15', '期间': '本期', '数值-换算': 999 }]);
assert('upsert 替换匹配行', merged.length === 2 && merged[1]['数值-换算'] === 999);
const { rows: kept, deleted } = deleteRows(rows, { '公司名称': ['中国人寿'] });
assert('范围删除', kept.length === 1 && deleted === 1);

console.log('== 6. memory 本地模式仍兼容 ==');
const mem = { get: async () => JSON.stringify(rows), put: async () => {} };
assert('memory 模式 readDB', (await readDB({}, { memory: mem })).length === 2);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
