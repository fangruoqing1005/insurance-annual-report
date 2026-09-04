// dump_coord.mjs — 提取指定页的坐标文本，用于离线分析表结构
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pdfFile = process.argv[2] || '中国人寿_module_test.pdf';
const pages = (process.argv[3] || '183,184,185,186').split(',').map(Number);

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
const fn = new Function('return ' + extractFn(script, 'extractPdfTextsForAI'))();
const doc = await pdfjs.getDocument({ data: pdfBuf.slice().buffer, disableWorker: true, isEvalSupported: false, useSystemFonts: true, disableFontFace: true }).promise;
console.log('PDF 页数:', doc.numPages);
const { fullText, coordPages } = await fn(doc, () => {});
fs.writeFileSync(path.join(root, '.workbuddy/tmp/fullText.txt'), fullText);
for (const p of pages) {
  const t = coordPages[p - 1] || '(空)';
  fs.writeFileSync(path.join(root, `.workbuddy/tmp/coord_p${p}.txt`), t);
  console.log(`p${p}: ${t.length} chars`);
}
