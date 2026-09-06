const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const i = html.indexOf('var REPORT_DEFAULT = "');
let p = i + 'var REPORT_DEFAULT = "'.length;
let out = '';
while (p < html.length) {
  const ch = html[p];
  if (ch === '\\') { out += ch + html[p + 1]; p += 2; continue; }
  if (ch === '"') break;
  out += ch; p++;
}
const d = JSON.parse('"' + out + '"');
console.log('嵌入 REPORT_DEFAULT 长度:', d.length);
const marks = d.match(/【图[：:][^】]*】/g) || [];
console.log('嵌入模板图位标记数:', marks.length);
marks.forEach(m => console.log(' ', m));

// 原始模板
const orig = fs.readFileSync('.workbuddy/tmp/report_default.txt', 'utf8');
const omarks = orig.match(/【图[：:][^】]*】/g) || [];
console.log('\n原始模板标记数:', omarks.length);
const uniq = [...new Set(omarks)];
console.log('原始去重标记数:', uniq.length);

// 差集：原始有但嵌入没有
const embedSet = new Set(marks);
console.log('\n=== 原始有、嵌入没有的标记（被移除）===');
uniq.forEach(m => { if (!embedSet.has(m)) console.log(' -', m); });
