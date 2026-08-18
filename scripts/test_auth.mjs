// 本地测试：API 鉴权策略（GET 公开，写操作需 ADMIN_PASS）
import { onRequest as dataApi } from '../functions/api/data.js';
import { onRequest as templateApi } from '../functions/api/template.js';
import { onRequest as downloadApi } from '../functions/api/download.js';
import { onRequest as extractApi } from '../functions/api/extract.js';

// 模拟 KV
class MockKV {
  constructor() { this.map = new Map(); }
  async get(key, opts = {}) {
    const v = this.map.get(key);
    if (v === undefined) return null;
    if (opts.type === 'text' && typeof v === 'string') return v;
    return v;
  }
  async put(key, value) { this.map.set(key, value); }
  async delete(key) { this.map.delete(key); }
}

const env = {
  STORE: new MockKV(),
  ADMIN_PASS: 'test-secret-123',
  DB_KEY: 'raw_data.json',
  TPL_KEY: 'template_163.json',
  PDF_PREFIX: 'pdfs/'
};

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra); }
}
const req = (url, method = 'GET', opts = {}) => new Request(url, {
  method,
  headers: opts.token ? { 'X-Admin-Token': opts.token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
  body: opts.body ? JSON.stringify(opts.body) : undefined
});

console.log('== /api/data ==');
let r = await dataApi(req('https://x/api/data'), env);
assert('GET 无token → 200', r.status === 200, `status=${r.status}`);
let d = await r.json();
assert('GET 返回 ok+rows 数组', d.ok === true && Array.isArray(d.rows));
r = await dataApi(req('https://x/api/data', 'POST', { body: { rows: [] } }), env);
assert('POST 无token → 401', r.status === 401);
r = await dataApi(req('https://x/api/data', 'POST', { token: 'test-secret-123', body: { rows: [] } }), env);
assert('POST 带token → 通过鉴权(400 rows为空)', r.status === 400, `status=${r.status}`);
r = await dataApi(req('https://x/api/data', 'DELETE', { body: { companies: ['中国人寿'] } }), env);
assert('DELETE 无token → 401', r.status === 401);

console.log('== /api/template ==');
r = await templateApi(req('https://x/api/template'), env);
assert('GET 无token → 200 + 内置模板', r.status === 200);
r = await templateApi(req('https://x/api/template', 'POST', { body: { template: [[1, 2]] } }), env);
assert('POST 无token → 401', r.status === 401);
r = await templateApi(req('https://x/api/template', 'POST', { token: 'test-secret-123', body: { template: [[1, 2, 3, 4, 5]] } }), env);
assert('POST 带token → 通过鉴权(200)', r.status === 200, `status=${r.status}`);

console.log('== /api/download ==');
r = await downloadApi(req('https://x/api/download?company=%E4%B8%AD%E5%9B%BD%E4%BA%BA%E5%AF%BF&year=2025%E5%B9%B4%E5%BA%A6'), env);
assert('GET 无token → 200 hasPdf:false', r.status === 200 && (await r.json()).hasPdf === false);
r = await downloadApi(req('https://x/api/download', 'POST', { body: { company: '中国人寿' } }), env);
assert('POST 无token → 401', r.status === 401);

console.log('== /api/extract ==');
r = await extractApi(req('https://x/api/extract', 'POST', { body: { company: '中国人寿' } }), env);
assert('POST 无token → 401', r.status === 401);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
