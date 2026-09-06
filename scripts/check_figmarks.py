# -*- coding: utf-8 -*-
import re, json

s = open('config.js', encoding='utf-8').read()

# 提取所有 chart 对象的 subPage 与 title（多行对象，用 id 定位边界）
charts = []
for m in re.finditer(r"id:\s*'([^']+)'", s):
    cid = m.group(1)
    seg = s[m.start():m.start() + 1200]
    sp = re.search(r"subPage:\s*'([^']+)'", seg)
    ti = re.search(r"title:\s*'([^']+)'", seg)
    ct = re.search(r"chartType:\s*'([^']+)'", seg)
    if sp and ti:
        charts.append({'id': cid, 'subPage': sp.group(1), 'title': ti.group(1), 'chartType': ct.group(1) if ct else '?'})

sp_names = dict(re.findall(r"key:\s*'([^']+)',\s*name:\s*'([^']+)'", s))

print('SUB_PAGES:', json.dumps(sp_names, ensure_ascii=False))
print('图表数:', len(charts))
for c in charts:
    print(f"  {sp_names.get(c['subPage'], c['subPage'])} | {c['title']} | {c['chartType']}")

# ===== 校验被移除的42个标记能否映射 =====
removed = [
 ('关键经营指标','总资产','头部险企'),('关键经营指标','净资产','头部险企'),('关键经营指标','CSM 余额','头部险企'),
 ('关键经营指标','新业务 CSM','头部险企'),('关键经营指标','按过渡期方法拆分CSM','头部险企'),
 ('关键监测指标','保险合同负债占总资产比例','头部险企'),('关键监测指标','CSM/BEL占比','头部险企'),
 ('利润分析','税前利润、税率及净利润','头部险企'),('利润分析','保险服务业绩和投资服务业绩','头部险企'),
 ('保险服务业绩','保险服务收入','头部险企'),('保险服务业绩','收入构成 — PAA vs Non-PAA','头部险企'),
 ('保险服务业绩','保险服务费用','头部险企'),('保险服务业绩','非PAA合同组的费用构成','头部险企'),
 ('保险服务业绩','业务及管理费','头部险企'),('保险服务业绩','保险服务业绩构成-Non-PAA','头部险企'),
 ('投资服务业绩','IFRS 9 金融资产分类','头部险企'),('投资服务业绩','净投资回报','头部险企'),
 ('投资服务业绩','承保财务净损益','头部险企'),('投资服务业绩','投资服务业绩','头部险企'),
 ('关键经营指标','净利润','头部险企'),('关键经营指标','其他综合收益(OCI)','头部险企'),
 ('关键监测指标','新业务CSM 利润率','头部险企'),('关键监测指标','新业务LC亏损率','头部险企'),
 ('关键监测指标','新业务获取费用率','头部险企'),('关键监测指标','CSM 摊销比例','头部险企'),
 ('关键监测指标','CSM 持续率','头部险企'),
]
titles = {c['title'] for c in charts}
spn = {v: k for k, v in sp_names.items()}
print()
print('=== 被移除标记在我方标题集中是否存在（忽略空格差异）===')
norm = lambda t: re.sub(r'\s+', '', t)
norm_titles = {norm(t): t for t in titles}
for pg, ti, grp in removed:
    hit = norm(ti) in norm_titles
    print(('  HIT ' if hit else '  MISS'), pg, '→', ti)
