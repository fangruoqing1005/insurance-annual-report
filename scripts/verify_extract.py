# -*- coding: utf-8 -*-
"""AI 提取结果 vs 人工校对版 校验脚本
用法: python verify_extract.py <校对Excel> <云端raw_data.json> <公司名> <报告期>
输出: UTF-8 文本报告
"""
import sys, json, io, re
import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def norm_num(v):
    """数值归一化：去掉千分位逗号/空格，转 float，保留原字符串备查"""
    if v is None:
        return None
    s = str(v).strip()
    if s in ('', '未披露', '不适用', '-'):
        return None
    s2 = s.replace(',', '').replace(' ', '')
    try:
        f = float(s2)
        return round(f, 4)
    except ValueError:
        return None

def norm_scale(n):
    """单位归一化：百万元/万元/亿元/元 -> 统一换算到 元 的倍数"""
    if not n:
        return 1.0
    s = str(n).strip()
    if '百' in s and '万' in s:  # 百万
        return 1e6
    if '亿' in s:
        return 1e8
    if '万' in s:
        return 1e4
    if '千' in s:
        return 1e3
    return 1.0

def norm_period(p):
    """期间归一化：期末/本期末 -> 期末；期初/本期初 -> 期初；上期/上期末 -> 上期 等"""
    if not p:
        return p
    s = str(p).strip()
    mapping = [
        (r'本期初|期初', '期初'),
        (r'本期末|期末', '期末'),
        (r'上期初|上年初', '上期初'),
        (r'上期末|上年末', '上期末'),
        (r'本期|本年度|年度', '本期'),
        (r'上期|上年度', '上期'),
    ]
    for pat, rep in mapping:
        if re.search(pat, s):
            return rep
    return s

def main(excel_path, cloud_path, company, period):
    # 1. 读校对版
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    ws = wb.worksheets[0]
    header = None
    excel_rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            header = [str(c).strip() if c is not None else '' for c in row]
            continue
        vals = [c for c in row]
        if vals[1] and str(vals[1]).strip() and str(vals[1]).strip() != company:
            continue  # 只取目标公司
        if vals[2] and str(vals[2]).strip() != period:
            continue
        excel_rows.append(vals)
    idx = {k: i for i, k in enumerate(header)}

    # 2. 读云端
    with open(cloud_path, 'r', encoding='utf-8') as f:
        cloud_raw = json.load(f)
    cloud_rows = [r for r in cloud_raw.get('rows', [])
                  if str(r.get('公司名称', '')).strip() == company
                  and str(r.get('报告期', '')).strip() == period]

    # 3. 构建索引
    def ek(r, src):
        if src == 'excel':
            t = r[idx['报表类型']]; code = r[idx['指标编号']]; per = r[idx['期间']]
            val = r[idx['数值-披露']]; unit = r[idx['计量单位-披露']]
            src_t = r[idx['指标来源']]; kw = r[idx['关键词']]
        else:
            t = r.get('报表类型'); code = r.get('指标编号'); per = r.get('期间')
            val = r.get('数值-披露'); unit = r.get('计量单位-披露')
            src_t = r.get('指标来源'); kw = r.get('关键词')
        return (str(t).strip() if t else '', str(code).strip() if code else '', norm_period(per)), \
               (norm_num(val), unit, src_t, kw)

    excel_map = {}
    for r in excel_rows:
        k, v = ek(r, 'excel')
        excel_map[k] = v
    cloud_map = {}
    for r in cloud_rows:
        k, v = ek(r, 'cloud')
        cloud_map[k] = v

    keys_excel = set(excel_map.keys())
    keys_cloud = set(cloud_map.keys())

    lines = []
    lines.append(f"===== 校验报告：{company} {period} =====")
    lines.append(f"校对版行数: {len(excel_rows)}  指标键数: {len(keys_excel)}")
    lines.append(f"云端(入库)行数: {len(cloud_rows)}  指标键数: {len(keys_cloud)}")
    lines.append("")

    # 4. 全面性：缺失项
    missing = sorted(keys_excel - keys_cloud)
    lines.append(f"【全面性】校对版有而云端缺失: {len(missing)}")
    for k in missing:
        v = excel_map[k]
        lines.append(f"  MISSING T={k[0]} code={k[1]} 期间={k[2]} 应=({v[0]}, {v[1]})")
    extra = sorted(keys_cloud - keys_excel)
    lines.append(f"【全面性】云端有而校对版没有(疑似多提取): {len(extra)}")
    for k in extra:
        v = cloud_map[k]
        lines.append(f"  EXTRA  T={k[0]} code={k[1]} 期间={k[2]} 值=({v[0]}, {v[1]})")
    lines.append("")

    # 5. 准确性：共同项对比
    common = sorted(keys_excel & keys_cloud)
    diff_cnt = 0
    lines.append(f"【准确性】共同指标: {len(common)}")
    for k in common:
        ev = excel_map[k]; cv = cloud_map[k]
        diffs = []
        if ev[0] is None and cv[0] is None:
            pass
        elif ev[0] is None or cv[0] is None:
            diffs.append(f"数值: 校对={ev[0]}({ev[1]}) vs 云端={cv[0]}({cv[1]})")
        else:
            # 换算成同一单位比较
            e_yuan = ev[0] * norm_scale(ev[1])
            c_yuan = cv[0] * norm_scale(cv[1])
            if e_yuan and c_yuan:
                ratio = e_yuan / c_yuan
                if abs(ratio - 1) > 0.0005:  # 0.05% 容差
                    diffs.append(f"数值: 校对={ev[0]}({ev[1]}) vs 云端={cv[0]}({cv[1]}) 比率={ratio:.4f}")
        if str(ev[2] or '').strip() != str(cv[2] or '').strip():
            diffs.append(f"指标来源: '{ev[2]}' vs '{cv[2]}'")
        if diffs:
            diff_cnt += 1
            lines.append(f"  DIFF T={k[0]} code={k[1]} 期间={k[2]}")
            for d in diffs:
                lines.append(f"       {d}")
    lines.append(f"【准确性】有差异指标数: {diff_cnt} / {len(common)}")
    lines.append("")
    lines.append(f"===== 汇总: 缺失 {len(missing)} | 多提取 {len(extra)} | 数值/来源差异 {diff_cnt} =====")

    report = '\n'.join(lines)
    print(report)
    return report

if __name__ == '__main__':
    excel = sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/Lenovo/Desktop/AI/年报/数据库/终版/国寿.xlsx"
    cloud = sys.argv[2] if len(sys.argv) > 2 else "C:/Users/Lenovo/WorkBuddy/2026-08-04-15-22-31/.workbuddy/tmp/cloud_data.json"
    company = sys.argv[3] if len(sys.argv) > 3 else '中国人寿'
    period = sys.argv[4] if len(sys.argv) > 4 else '2025年度'
    main(excel, cloud, company, period)
