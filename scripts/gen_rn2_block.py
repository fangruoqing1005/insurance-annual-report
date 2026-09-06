# -*- coding: utf-8 -*-
"""组装 RN2 年度报告模块并插入 index.html（模板图位校准 + 序列化 + 拼接）。"""
import json, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = r'C:/Users/Lenovo/WorkBuddy/2026-08-04-15-22-31'
html_path = BASE + '/index.html'
tpl_path = BASE + '/.workbuddy/tmp/report_default.txt'
kb_path = BASE + '/.workbuddy/tmp/report_kb.json'
app_path = BASE + '/scripts/rn2_app.js'

# 1) 图位校准：对方模板标题 -> 我方 CHART_CONFIGS 标题（None=删除该图位标记，保留正文）
TITLE_FIX = {
    '关键监测指标→保险合同负债占总资产比例': None,
    '保险服务业绩→保险服务收入': '保险服务业绩→保险服务收入/费用/业绩',
    '保险服务业绩→保险服务费用': '保险服务业绩→保险服务收入/费用/业绩',
    '保险服务业绩→业务及管理费': '保险服务业绩→费用分析',
    '保险服务业绩→保险服务业绩构成-Non-PAA': '保险服务业绩→非PAA合同组的收入构成',
    '关键监测指标→新业务CSM 利润率': '关键监测指标→新业务IFRS 利润率',
    '关键监测指标→新业务LC亏损率': '关键监测指标→新业务亏损合同占比',
    '关键监测指标→摊销前CSM变动项占比': '关键监测指标→CSM 摊销比例',
}
MARK = re.compile(r'【图[:：]([^@】]+?)(?:@([^】]*))?】')

def fix_marker(m):
    body, grp = m.group(1).strip(), m.group(2)
    at = ('@' + grp.strip()) if grp and grp.strip() else ''
    # 不在映射表中的标记原样保留（此前 .get(body) 误将未映射标记全部删除）
    nb = TITLE_FIX.get(body, body)
    if nb is None:
        return ''  # 显式映射为 None 才删除图位
    return '【图:' + nb + at + '】'

tpl = open(tpl_path, encoding='utf-8').read()
tpl_fixed = MARK.sub(fix_marker, tpl)

# 残留校验：替换后仍有我方不存在的标题？
cfg_src = open(BASE + '/config.js', encoding='utf-8').read()
names = dict(re.findall(r"\{ key: '([\w-]+)', name: '([^']+)' \}", cfg_src))
have = set()
for sp, ti in re.findall(r"subPage: '([\w-]+)',\s*title: '([^']+)'", cfg_src):
    have.add((names.get(sp), ti))
residual = []
for m in MARK.finditer(tpl_fixed):
    body = m.group(1).strip()
    sp2 = body.find('→')
    if sp2 > 0:
        pg, ti = body[:sp2].strip(), body[sp2 + 1:].strip()
    else:
        pg, ti = '', body
    if (pg, ti) not in have:
        residual.append((pg, ti))
if residual:
    print('WARN residual missing:', residual)
else:
    print('校准后所有图位标记均存在 ✓')

default_lit = json.dumps(tpl_fixed, ensure_ascii=False)
kb = json.load(open(kb_path, encoding='utf-8'))
kb_lit = json.dumps(kb, ensure_ascii=False)
print('REPORT_DEFAULT len', len(tpl_fixed), 'KB items', len(kb))

# 2) askReportKB（问问 Agent 报告知识检索：仅知识性提问返回，数据问答不抢答）
ask_kb_src = r'''
/* ===== 问问 Agent：报告知识检索（年度报告页注入；数据问答未覆盖时按知识库回答） ===== */
window.askReportKB = function (q) {
  if (!window.REPORT_KB || !q) return null;
  var qs = String(q);
  /* 数据问答意图（含公司+指标 / 排名 / 对比）交给数值问答，不抢答 */
  var dataIntent = false;
  try {
    var hasComp = COMPANIES.filter(function (c) { return c.has_data; }).some(function (c) { return qs.indexOf(c.short_name) >= 0; });
    var indWords = Object.keys(ASK_ALIAS);
    var hasInd = indWords.some(function (w) { return qs.indexOf(w) >= 0; });
    dataIntent = hasInd && (hasComp || /排名|前\s*\d|top\s*\d|和|与|vs|对比/.test(qs));
  } catch (e) {}
  if (dataIntent) return null;
  var strongKws = ['背景', '概览', '实施', '准则', '口径', '政策', '监管', '对标', '同业', '税务', '税率', '分类重叠',
    '递延', '创新大赛', '工作台', '项目', '2026年1月1日', '2023年1月1日', '暂缓', '法定执行'];
  var hits = [];
  for (var i = 0; i < window.REPORT_KB.length; i++) {
    var k = window.REPORT_KB[i], score = 0;
    var t = k.h + ' ' + k.t;
    if (t.indexOf(qs) >= 0) score += 40;
    if (k.t && k.t.length >= 10 && t.indexOf(qs.slice(0, Math.min(qs.length, 12))) >= 0) score += 12;
    strongKws.forEach(function (w) { if (qs.indexOf(w) >= 0 && t.indexOf(w) >= 0) score += 4; });
    if (score >= 12) hits.push({ k: k, s: score });
  }
  hits.sort(function (a, b) { return b.s - a.s; });
  if (!hits.length) return null;
  var take = hits.slice(0, 3);
  function escKB(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  var out = '<div style="line-height:1.75"><div style="font-weight:700;color:var(--c-navy);margin-bottom:4px">报告知识</div>';
  take.forEach(function (hx) {
    out += '<div style="margin-bottom:6px"><span style="color:var(--c-navy);font-weight:600">『' + escKB(hx.k.h) + '』</span>'
      + escKB(hx.k.t.length > 260 ? hx.k.t.slice(0, 260) + '…' : hx.k.t) + '</div>';
  });
  out += '<div style="color:var(--c-text-muted);font-size:12px">—— 全文见「年度报告」页（写作台左侧已预置，可编辑后配图导出）</div></div>';
  return out;
};
'''

# 3) 拼装最终 <script> 块
app_src = open(app_path, encoding='utf-8').read()
block = '\n<script>\n/* ===== 年度报告页（RN2 写作台 + 报告知识库） ===== */\n'
block += 'var REPORT_DEFAULT = ' + default_lit + ';\n'
block += 'var REPORT_KB = ' + kb_lit + ';\n'
block += ask_kb_src + '\n'
block += app_src + '\n'
block += '</script>\n'

# 4) 插入 index.html（最后一个 </body> 之前）
html = open(html_path, encoding='utf-8').read()
if marker := '/* ===== 年度报告页（RN2 写作台 + 报告知识库） ===== */':
    if marker in html:
        print('block already inserted')
        sys.exit(0)
idx = html.rfind('</body>')
if idx < 0:
    raise SystemExit('anchor not found')
block += '</body>' + html[idx + len('</body>'):]
out = html[:idx] + block
open(html_path, 'w', encoding='utf-8', newline='\n').write(out)
print('inserted at', idx, 'new html len', len(out))
