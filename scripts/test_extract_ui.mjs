// 智能提取页 UI 改动冒烟测试（子标题 / 模板折叠 / 已就绪 PDF 联动）
// 运行：node scripts/test_extract_ui.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}

// ===== 1. 静态 HTML 断言 =====
console.log('\n[1] 静态 HTML 断言');
ok(!html.includes('163行模板预览'), '子标题不包含「163行」字样');
ok(html.includes('IFRS17 指标定位表全流程 · 指标模板预览 · 提取进度跟踪'), '子标题为新文案');
ok(html.includes('>指标模板</button>'), 'tab 文案改为「指标模板」');
ok(html.includes('163 行指标模板管理') === false, '模板管理文案去掉「163 行」');
ok(html.includes('id="extTplBody" style="display:none;"'), '模板预览默认折叠（extTplBody hidden）');
ok(html.includes('id="extTplHead"'), '折叠表头存在');
ok(html.includes('id="extPdfPanel"'), '已就绪 PDF 面板存在');
ok(html.includes('id="btnExtPdfRefresh"'), '刷新按钮存在');
ok(html.includes('extPicker = createCompanyPicker'), 'extPicker 提升为全局赋值');
ok(html.includes('let extPicker = null'), 'extPicker 全局声明存在');

// ===== 2. 从内联 JS 提取函数定义 =====
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function extractFn(code, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(([\\s\\S]*?)\\)\\s*\\{', 'm');
  const m = code.match(re);
  if (!m) throw new Error('function ' + name + ' not found');
  const start = m.index + m[0].length - 1; // 定位到 {
  let depth = 0, i = start;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) break; }
  }
  return code.slice(m.index, i + 1);
}

// ===== 3. vm 环境：data.js + 提取的函数 =====
const dataJs = fs.readFileSync(path.join(root, 'data.js'), 'utf8');

// mock localStorage
const lsStore = {};
const localStorageMock = {
  getItem: k => (k in lsStore ? lsStore[k] : null),
  setItem: (k, v) => { lsStore[k] = String(v); },
  removeItem: k => { delete lsStore[k]; },
};

// mock apiFetch（云模式 list 返回）
let apiCallCount = 0;
const apiFetchMock = async (url, opts = {}) => {
  apiCallCount++;
  if (url.includes('list=1')) {
    return { resp: { ok: true }, data: { list: [
      { company: '中国人寿', year: '2025年度' },
      { company: '平安人寿', year: '2025年度' },
      { company: '泰康人寿', year: '2024年度' },
    ], count: 3 } };
  }
  return { resp: { ok: false }, data: null };
};

// mock document（仅 getElementById，供 renderExtPdfTable 用）
const elCache = {};
const docMock = {
  getElementById: id => elCache[id] || (elCache[id] = {
    id, innerHTML: '', textContent: '', style: {}, dataset: {}, value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, appendChild() {}, querySelectorAll: () => [], options: [],
    appendChild() {},
  }),
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, toggle() {} } }),
};

const ctx = {
  console, localStorage: localStorageMock, document: docMock,
  apiFetch: apiFetchMock, isCloudMode: true, globalThis: {},
  COMPANIES_92: [], SHORT_NAME_MAP: {}, RAW_DATA: [], REPORT_PERIODS: ['2025年度'],
  AbortSignal: { timeout: () => ({}) }, URL, setTimeout, clearTimeout, Date, JSON, Math, Blob, atob: () => '',
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(dataJs, ctx); // 定义 COMPANIES_92 / SHORT_NAME_MAP

// 提取函数并运行
const fns = ['findCompany92', 'fetchPdfList', 'renderExtPdfTable', 'normShotName', 'collectDbValues', 'searchIndicatorInPdf', 'cropPageRegion', 'parseSrcPages'].map(n => extractFn(script, n)).join('\n');
vm.runInContext(fns, ctx);

// ===== 4. 逻辑断言 =====
console.log('\n[2] findCompany92 反查');
ok(ctx.findCompany92('中国人寿') !== null, '简称「中国人寿」能反查到 92 家列表项');
const taikang = ctx.findCompany92('泰康人寿');
ok(taikang !== null, '简称「泰康人寿」能反查到');
ok(ctx.findCompany92('不存在的公司') === null, '未知名称返回 null');

console.log('\n[3] fetchPdfList（云模式 list=1）');
const r1 = await ctx.fetchPdfList(true);
ok(r1.isCloud === true, '云模式标记正确');
ok(r1.records.length === 3, '解析出 3 条记录');
ok(r1.records[0].short === '中国人寿' && r1.records[0].year === '2025年度', '记录字段正确（short/year）');
ok(typeof r1.records[0].company === 'string' && r1.records[0].company.length > 0, 'company 为全称或回退值');
ok(apiCallCount === 1, '首次调用走接口');

console.log('\n[4] fetchPdfList 缓存（60s）');
const r2 = await ctx.fetchPdfList(false);
ok(apiCallCount === 1, '缓存命中，未重复请求接口');
ok(r2.records.length === 3, '缓存数据一致');

console.log('\n[5] 静态模式（isCloudMode=false 读 localStorage）');
ctx.isCloudMode = false;
localStorageMock.setItem('dl_pdf_status', JSON.stringify({ '中国人寿_2025年度': 1, '平安人寿_2025年度': 1 }));
const r3 = await ctx.fetchPdfList(true);
ok(r3.isCloud === false, '静态模式标记正确');
ok(r3.records.length === 2, '读到 2 条本地记录');
ok(r3.records[0].year === '2025年度', '本地记录年度解析正确');

console.log('\n[6] renderExtPdfTable 渲染');
ctx.isCloudMode = true;
await ctx.renderExtPdfTable(true);
const table = docMock.getElementById('extPdfTable');
ok(table.innerHTML.includes('中国人寿') && table.innerHTML.includes('2025年度'), '表格包含公司与年度');
ok(table.innerHTML.includes('data-company='), '行携带 data-company 联动属性');
ok(table.innerHTML.includes('data-year='), '行携带 data-year 联动属性');
ok(!table.innerHTML.includes('undefined'), '渲染无 undefined 泄漏');

// ===== 7. 指标截图检索核心算法 =====
console.log('\n[7] normShotName 行名规范化');
ok(ctx.normShotName('减：所得税费用') === '所得税费用', '去「减：」前缀');
ok(ctx.normShotName('其中：投资收益') === '投资收益', '去「其中：」前缀');
ok(ctx.normShotName('四、营业收入') === '营业收入', '去序数前缀');
ok(ctx.normShotName('保险服务收入') === '保险服务收入', '无前缀原样保留');
ok(ctx.normShotName(' 保险  服务 ') === '保险服务', '去空白');

console.log('\n[8] collectDbValues 数据库值对照（data.js 真实数据 6000+ 行）');
ok(vm.runInContext('RAW_DATA.length', ctx) > 6000, 'RAW_DATA 真实数据已加载（vm 内读取）');
const db1 = ctx.collectDbValues('中国人寿', '2025年度', 'B01', '');
ok(Array.isArray(db1) && db1.length >= 1, '按代码 B01 查到记录（真实数据）');
ok(typeof db1[0].值 === 'number' && db1[0].期间 && db1[0].单位, '记录字段结构完整（期间/值/单位）');
ok(/合并利润表/.test(db1[0].来源表 || ''), '来源表含报表名');
ok(/（P\d/.test(db1[0].来源表 || ''), '来源表含页码区间（Pxx-Pyy）');
const db2 = ctx.collectDbValues('中国人寿', '2025年度', '', '总资产');
ok(db2 && db2.length >= 1 && /资产负债/.test(db2[0].来源表 || ''), '按名称查到记录且来源表为资产负债表');
const db3 = ctx.collectDbValues('不存在', '2025年度', 'B01', '');
ok(db3 === null, '无记录返回 null');

console.log('\n[8b] parseSrcPages 来源表页码解析');
const ps1 = vm.runInContext("parseSrcPages('2025年度合并利润表（P93-P94）')", ctx);
ok(Array.isArray(ps1) && ps1[0] === 93 && ps1[1] === 94, '解析「（P93-P94）」→ [93,94]');
const ps2 = vm.runInContext("parseSrcPages('T01 合并资产负债表（P12）')", ctx);
ok(ps2 && ps2[0] === 12 && ps2[1] === 12, '解析「（P12）」→ [12,12]');
const ps3 = vm.runInContext("parseSrcPages('T02 合并利润表')", ctx);
ok(ps3 === null, '无页码返回 null');

console.log('\n[9] searchIndicatorInPdf 全文搜索 + bbox（fake PDF doc）');
const page1Items = [
  { str: '合并利润表', transform: [1,0,0,1,200,750], width: 60, height: 14 },
  { str: '保险服务收入', transform: [1,0,0,1,100,700], width: 80, height: 12 },
  { str: '214,136', transform: [1,0,0,1,320,700], width: 50, height: 12 },
  { str: '减：所得税费用', transform: [1,0,0,1,100,680], width: 90, height: 12 },
  { str: '摊回保险服务费用', transform: [1,0,0,1,100,660], width: 100, height: 12 },
  { str: '收入', transform: [1,0,0,1,100,640], width: 30, height: 12 },
  { str: '净利润', transform: [1,0,0,1,100,500], width: 40, height: 12 },
];
const fakeDoc = {
  numPages: 3,
  getPage: async (p) => ({
    getTextContent: async () => ({ items: p === 1 ? page1Items : [] })
  })
};
const hits1 = await ctx.searchIndicatorInPdf(fakeDoc, '保险服务收入');
ok(hits1.length === 1, '只命中 1 页（附注「摊回保险服务费用」与拆词「收入」均不误命中）');
ok(hits1[0].page === 1, '命中页码正确');
const gB01 = hits1[0].groups.find(g => g.text.includes('保险服务收入'));
ok(!!gB01 && gB01.text.includes('214,136'), '同行文本项合并（指标名+数值列同框）');
ok(gB01.bbox.minX === 100 && gB01.bbox.maxX === 370, 'bbox 覆盖整行（指标名 100 → 数值 370）');
const hits2 = await ctx.searchIndicatorInPdf(fakeDoc, '净利润');
ok(hits2.length === 1 && hits2[0].groups[0].text === '净利润', '单指标名命中');
const hits3 = await ctx.searchIndicatorInPdf(fakeDoc, '不存在指标XYZ');
ok(hits3.length === 0, '未命中返回空');

console.log('\n[10] cropPageRegion 渲染裁剪坐标换算');
const fakePage2 = {
  getViewport: ({ scale }) => ({
    width: 595 * scale, height: 842 * scale,
    transform: [scale, 0, 0, scale, 0, 0]
  }),
  render: async ({ canvasContext, viewport }) => {
    // 画一个可检测的像素（模拟渲染）
    canvasContext.fillStyle = '#000';
    canvasContext.fillRect(100, 700, 5, 5);
    return { promise: Promise.resolve() };
  }
};
ctx.document.createElement = () => {
  const c = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }) };
  c.toDataURL = () => 'data:image/png;base64,AAA';
  return c;
};
const fakeDoc2 = {
  numPages: 1,
  getPage: async () => fakePage2
};
const crop = await ctx.cropPageRegion(fakeDoc2, 1, { minX: 100, minY: 700, maxX: 150, maxY: 712 });
ok(crop && typeof crop.dataUrl === 'string' && crop.dataUrl.startsWith('data:image/png'), '裁剪输出 dataURL');
ok(crop.width > 100 && crop.height > 24, '裁剪尺寸含 padding（50/28/40）且为整数');
ok(Number.isInteger(crop.width) && Number.isInteger(crop.height), '裁剪尺寸为整数');

console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
