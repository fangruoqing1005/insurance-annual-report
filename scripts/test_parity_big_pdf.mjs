// 真实年报 PDF（5MB+）格式对拍：前端 extractPdfTextsForAI vs 后端 extractText/extractTableText
// 运行：node scripts/test_parity_big_pdf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pdfFile = process.argv[2] || '中国人寿_module_test.pdf';

const pdfBuf = fs.readFileSync(path.join(root, pdfFile));
const { extractText, extractTableText } = await import('../functions/_lib/pdf.js');
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
console.log('PDF:', pdfFile, (pdfBuf.length / 1048576).toFixed(1) + 'MB, 页数:', doc.numPages);

const t0 = Date.now();
const { fullText, coordPages } = await extractPdfTextsForAI(doc, () => {});
console.log('前端解析耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's, fullText:', fullText.length, 'chars, coordPages 页数:', coordPages.length);

const backendFull = await extractText(pdfBuf);
const norm = s => s.replace(/\s+/g, '');
const a = norm(fullText), b = norm(backendFull);
console.log('fullText 去空白字符数: 前端', a.length, 'vs 后端', b.length, '差值', Math.abs(a.length - b.length), (Math.abs(a.length - b.length) / b.length * 100).toFixed(2) + '%');

let pass = 0, fail = 0;
const samples = [1, 2, 3, Math.floor(doc.numPages / 2), doc.numPages - 1, doc.numPages];
for (const p of samples) {
  if (p < 1) continue;
  const bpage = await extractTableText(pdfBuf, p, p);
  const bl = bpage.split('\n').filter(l => l && !l.startsWith('-----'));
  const fl = (coordPages[p - 1] || '').split('\n').filter(Boolean);
  const same = fl.length === bl.length;
  if (same) pass++; else fail++;
  console.log('  第' + p + '页: 前端', fl.length, '行 vs 后端', bl.length, '行', same ? '✓' : '✗');
}
console.log(`\n========== 抽样对拍：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
