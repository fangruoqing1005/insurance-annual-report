# -*- coding: utf-8 -*-
import json, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
s = open(r'C:/Users/Lenovo/Desktop/AI/年报/组件输入/liutiaoren.html', encoding='utf-8').read()
i = s.find('var REPORT_DEFAULT = ')
j = s.find('\nvar REPORT_KB = ', i)
seg = s[i:j]
# 字符串字面量：var REPORT_DEFAULT = "...";
m = re.search(r'var REPORT_DEFAULT = ("(?:\\.|[^"\\])*");', seg)
d = json.loads(m.group(1))
print('DEFAULT len', len(d))
marks = re.findall(r'【图[:：][^】]*】', d)
print('marks count', len(marks))
for mk in dict.fromkeys(marks):
    print(mk)
open(r'C:/Users/Lenovo/WorkBuddy/2026-08-04-15-22-31/.workbuddy/tmp/report_default.txt', 'w', encoding='utf-8').write(d)
# KB 段
k = s.find('\nvar REPORT_KB = ', i)
seg2 = s[k: s.find('\n/* 问问 Agent: 报告知识检索', k)]
m2 = re.search(r'var REPORT_KB = (\[.*?\]);', seg2, re.S)
kb = json.loads(m2.group(1))
print('KB count', len(kb))
for e in kb[:3]:
    print(' ', e['h'], '|', e['t'][:40])
open(r'C:/Users/Lenovo/WorkBuddy/2026-08-04-15-22-31/.workbuddy/tmp/report_kb.json', 'w', encoding='utf-8').write(json.dumps(kb, ensure_ascii=False))
