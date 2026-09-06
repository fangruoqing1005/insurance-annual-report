# -*- coding: utf-8 -*-
"""移除 index.html 中已插入的旧 RN2 块，以便重新生成。"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = r'C:/Users/Lenovo/WorkBuddy/2026-08-04-15-22-31'
html_path = BASE + '/index.html'
html = open(html_path, encoding='utf-8').read()

marker = '/* ===== 年度报告页（RN2 写作台 + 报告知识库） ===== */'
i = html.find(marker)
if i < 0:
    print('未找到旧块')
    sys.exit(0)
# 块从 <script> 开始（marker 前面最近的 <script>）
ss = html.rfind('<script>', 0, i)
se = html.find('</script>', i)
assert ss >= 0 and se > i
old = html[ss:se + len('</script>')]
new = html.replace(old, '', 1)
open(html_path, 'w', encoding='utf-8', newline='\n').write(new)
print('已移除旧块，长度', len(old), '，新 html 长度', len(new))
