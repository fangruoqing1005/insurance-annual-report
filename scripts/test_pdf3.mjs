// 本地测试：pdfjs-dist 3.x 解析（验证降级后 extractText/extractWords 正常）
import { writeFileSync } from 'node:fs';
import { extractText, extractWords, extractTableText } from '../functions/_lib/pdf.js';

// ===== 生成最小合法 PDF（单页，文本 "Hello PDF World"，自动计算 xref）=====
function buildMinPdf() {
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  const stream = 'BT /F1 12 Tf 72 700 Td (Hello PDF World) Tj ET';
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(out, 'binary'));
}

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra); }
}

const pdfBytes = buildMinPdf();
writeFileSync('test_min.pdf', pdfBytes);

console.log('== pdfjs 3.x 文本提取 ==');
const text = await extractText(pdfBytes);
assert('extractText 包含页面标记', text.includes('PDF_PAGE_1'));
assert('extractText 提取出文本', text.includes('Hello PDF World'), `实际: ${text.slice(0, 120)}`);

console.log('== extractWords 坐标 ==');
const words = await extractWords(pdfBytes);
assert('extractWords 数量>=1', words.length >= 1, `实际 ${words.length}`);
if (words.length >= 1) {
  const w0 = words[0];
  assert('word 有 x/y 坐标', typeof w0.x === 'number' && typeof w0.y === 'number');
  assert('word 文本包含 Hello', words[0].str.includes('Hello'), `实际: ${words[0].str}`);
}

console.log('== extractTableText 坐标化 ==');
const table = await extractTableText(pdfBytes, 1, 1);
assert('extractTableText 输出行文本', table.includes('Hello') && table.includes('[x='));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
