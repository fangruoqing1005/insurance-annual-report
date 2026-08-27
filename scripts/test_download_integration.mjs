// /api/download 端到端集成测试（含中保协自动抓取）
// 运行：node scripts/test_download_integration.mjs [company] [year]
// 前置：网络可访问 icidp.iachina.cn（中保协）
import { onRequest } from '../functions/api/download.js';

// ===== 内存 KV stub（模拟 Cloudflare KV）=====
const memStore = new Map();
const STORE = {
  async get(key, opts = {}) {
    if (!memStore.has(key)) return null;
    const v = memStore.get(key);
    if (opts.type === 'arrayBuffer') return v;
    return v; // 测试中统一存 Uint8Array，text 直接转
  },
  async put(key, value, opts = {}) {
    memStore.set(key, value);
    return;
  },
  async delete(key) { memStore.delete(key); return; }
};

const env = {
  STORE,
  PDF_PREFIX: 'pdfs/',
  SOURCES_KEY: 'sources.json',
  ADMIN_PASS: 'test-pass-123',
};

function makeRequest({ method = 'GET', url = 'http://localhost/api/download', body = null, token = '' }) {
  return {
    method,
    url,
    headers: new Map(Object.entries({
      'Content-Type': 'application/json',
      ...(token ? { 'X-Admin-Token': token } : {}),
    })),
    json: async () => body,
  };
}

function show(r, label) {
  console.log(`\n=== ${label} ===`);
  console.log('status:', r.status);
  return r.json().then(d => {
    console.log('body:', JSON.stringify(d, null, 1).substring(0, 1800));
    return d;
  });
}

const company = process.argv[2] || '泰康人寿';
const year = process.argv[3] || '2025年度';

async function main() {
  // 1. GET 查询（公开）
  await show(await onRequest({ request: makeRequest({ url: `http://localhost/api/download?company=${encodeURIComponent(company)}&year=${encodeURIComponent(year)}` }), env }), 'GET 查询（公开，无需鉴权）');

  // 2. POST 单公司，sources.json 为空 → 应自动走中保协
  await show(await onRequest({
    request: makeRequest({ method: 'POST', body: { company, year, fullName: '' } }),
    env,
  }), `POST 单公司 ${company} ${year}（无静态地址 → 中保协自动抓取）`);

  // 3. 再次 GET 确认 PDF 已入库
  await show(await onRequest({ request: makeRequest({ url: `http://localhost/api/download?company=${encodeURIComponent(company)}&year=${encodeURIComponent(year)}` }), env }), 'GET 复查（PDF 应已存在）');

  // 4. 未授权访问（无 token）→ 401
  await show(await onRequest({
    request: makeRequest({ method: 'POST', body: { company, year } }),
    env,
  }), 'POST 无 token（应 401）');

  // 5. 错误 token → 401
  await show(await onRequest({
    request: makeRequest({ method: 'POST', body: { company, year }, token: 'wrong' }),
    env,
  }), 'POST 错误 token（应 401）');

  // 6. 批量下载（含不存在的公司 + 存在的公司）
  const batch = [company, '不存在之公司XYZ', '新华人寿'];
  await show(await onRequest({
    request: makeRequest({ method: 'POST', token: env.ADMIN_PASS, body: { companies: batch, year } }),
    env,
  }), `POST 批量 ${batch.join(' / ')}（中保协自动抓取）`);

  // 7. 验证 KV 中实际存储
  console.log('\n=== KV 存储内容 ===');
  for (const [k, v] of memStore.entries()) {
    console.log(k, '->', v.byteLength ? v.byteLength + ' bytes' : (typeof v === 'string' ? v.substring(0, 100) : JSON.stringify(v).substring(0, 100)));
  }
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });
