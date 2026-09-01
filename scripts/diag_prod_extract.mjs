// 生产链路诊断：本地前端解析 PDF → 分批调用生产 /api/extract → 打印每张表诊断
// 用法: node scripts/diag_prod_extract.mjs [tables]  (如 T03 或 T04,T05,T06)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pdfFile = process.argv[2] || '中国人寿_module_test.pdf';
const tablesArg = process.argv[3] || '';
const BASE = process.env.PROD_BASE || 'https://insurance-annual-report.pages.dev';

const pdfBuf = fs.readFileSync(path.join(root, pdfFile));
const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.js')).default;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function extractFn(code, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(([\\s\\S]*?)\\)\\s*\\{', 'm');
  const m = code.match(re);
  if (!m) throw new Error('fn ' + name + ' not found');
  const start = m.index + m[0].length - 1;
  let depth = 0, i = start;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) break; }
  }
  return code.slice(m.index, i + 1);
}
const extractPdfTextsForAI = new Function('return ' + extractFn(script, 'extractPdfTextsForAI'))();

const doc = await pdfjs.getDocument({ data: pdfBuf.slice().buffer, disableWorker: true, isEvalSupported: false, useSystemFonts: true, disableFontFace: true }).promise;
console.log('PDF:', pdfFile, '页数:', doc.numPages);
const { fullText, coordPages } = await extractPdfTextsForAI(doc, () => {});
console.log('fullText:', fullText.length, 'chars, coordPages:', coordPages.length, 'pages');

const tables = tablesArg ? tablesArg.split(',').map(s => s.trim().toUpperCase()) : [];
console.log('目标批次:', tables.length ? tables.join(',') : '(全部 10 张表, 10 次调用)');
const payload = {
  company: '中国人寿', year: '2025年度', companyType: '头部险企',
  fullText, coordPages,
  ...(tables.length ? { tables } : {})
};

console.log('调用生产 /api/extract …');
const t0 = Date.now();
try {
  const resp = await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  console.log('HTTP', resp.status, '耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('--- 响应体前 5000 字符 ---');
  console.log(text.slice(0, 5000));
  try {
    const data = JSON.parse(text);
    console.log('\n--- tableNotes ---');
    (data.tableNotes || []).forEach(n => console.log(' ', n));
    console.log('\n--- matched ---');
    console.log(JSON.stringify(data.matched || {}, null, 1));
    console.log('\n--- suspicious ---');
    (data.suspicious || []).forEach(s => console.log(' ', JSON.stringify(s)));
    console.log('\n--- checks ---');
    (data.checks || []).forEach(c => console.log(' ', c.name, c.pass === null ? '跳过' : (c.pass ? '✓' : '✗')));
  } catch (e) { console.log('响应非 JSON:', e.message); }
} catch (e) {
  console.log('请求失败:', e.message);
}
