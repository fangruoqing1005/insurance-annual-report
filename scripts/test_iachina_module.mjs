// 本地测试 functions/_lib/iachina.js（Node 22 环境近似 Cloudflare Workers）
// 用法：node scripts/test_iachina_module.js [公司简称] [年度]
import { createIachinaClient, fetchAnnualPdf, genClientId, decryptIachina, _internal } from '../functions/_lib/iachina.js';
import fs from 'node:fs';

const company = process.argv[2] || '中国人寿';
const year = process.argv[3] || '2025年度';

// 1. 工具函数自检
console.log('=== 工具函数自检 ===');
const cid = genClientId();
console.log('clientId length:', cid.length, '| ends with timestamp:', /^\d{13}$/.test(cid.slice(30)));
const dec = decryptIachina('3Rf_0xetEnMwsFsKScs8F04U5_fxoRBrFjsVEJArPPK/y2k7kkefUeesW7mrWULmHCMe_v1jDRijRnKfPq2aO57kjzr4c1SJXJ9LO0Kj141NQ0TUr_aRusIcye5gk0LEWykIef36uOh66_ayTd6CXsSnWJISd40eKunAYXPQPMaKZ5b5EIr/whBQMVidCN4cMTYlRKMyYR9t/0GE7uDAjegwhHOCFMxq5w0jV7Cmd4s=');
console.log('decrypt sample contains success:', dec.includes('"clientIpStatus":"success"'));

// 2. 完整流程：搜索 + 详情 + 下载（传入全称验证精确匹配，避免命中财险/资管子公司）
const fullName = process.argv[4] || (company === '中国人寿' ? '中国人寿保险股份有限公司' : '');
console.log(`\n=== 完整流程: ${company} ${year} fullName=${fullName || '(未传)'} ===`);
const t0 = Date.now();
const result = await fetchAnnualPdf({ company, fullName, year });
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('elapsed:', elapsed + 's');
console.log('result:', JSON.stringify(result, (k, v) => (k === 'buf' ? `ArrayBuffer(${v.byteLength})` : v), 2));

if (result.ok) {
  const safe = company.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const out = `C:\\Users\\Lenovo\\WorkBuddy\\2026-08-04-15-22-31\\${safe}_module_test.pdf`;
  fs.writeFileSync(out, Buffer.from(result.buf));
  console.log('saved:', out);
} else {
  console.log('FAILED:', result.error);
}

// 3. 客户端复用测试（批量场景：同一 client 两次搜索，列表只拉一次）
console.log('\n=== 客户端复用测试（批量场景模拟）===');
const client = createIachinaClient();
const r1 = await client.search('平安人寿', '中国平安人寿保险股份有限公司', '2025年度');
console.log('client.search 平安人寿 2025年度 →', r1.ok ? `${r1.records.length} 条` : r1.error);
if (r1.ok && r1.records[0]) console.log('  best:', r1.records[0].title, '|', r1.records[0].date);
const r2 = await client.search('泰康人寿', '', '2025年度');
console.log('client.search 泰康人寿 2025年度（无全称）→', r2.ok ? `${r2.records.length} 条` : r2.error);
if (r2.ok && r2.records[0]) console.log('  best:', r2.records[0].title, '|', r2.records[0].date);
