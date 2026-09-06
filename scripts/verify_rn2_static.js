const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const ids = {}, re = /id="([^"]+)"/g; let m, dups = [];
while ((m = re.exec(html))) ids[m[1]] = (ids[m[1]] || 0) + 1;
for (const k in ids) if (ids[k] > 1) dups.push(k + 'x' + ids[k]);
console.log('dup ids:', dups.length ? dups : '无');
const need = ['rn2Type', 'rn2Rep', 'rn2Chart', 'rn2Ta', 'rn2Paper', 'rn2Auto', 'rn2Ins', 'rn2Go', 'rn2ExH', 'rn2ExY', 'rn2Copy', 'rn2Dl', 'rn2Clear', 'rn2Reset', 'rn2Undo', 'reportView', 'navReport'];
need.forEach(n => console.log(html.includes('id="' + n + '"') ? 'ok  ' + n : 'MISS ' + n));
['业务及管理费', '保险服务业绩构成-Non-PAA', '新业务LC亏损率', '摊销前CSM变动项占比', '保险合同负债占总资产比例'].forEach(s => {
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp('【图[^】]*' + esc, 'g');
  const cnt = (html.match(rx) || []).length;
  console.log('模板残留[' + s + ']图位:', cnt);
});
console.log('KB钩子:', html.includes('window.askReportKB') && html.includes('kbHit'));
console.log('renderChart opts:', /function renderChart\(config, opts\)/.test(html));
console.log('switchView report:', /const isReport = view === 'report'/.test(html));
console.log('RN2 module:', html.includes('window.RN2 = { refresh: refresh }'));
