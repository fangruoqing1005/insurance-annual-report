/* ========== 年度报告 RN2 图文写作台（移植自 liutiaoren.html，适配本项目 40 图配置） ========== */
(function () {
  if (window.RN2) return;

  /* ---- 工具 ---- */
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function $(id) { return document.getElementById(id); }
  function subPageName(key) {
    for (let i = 0; i < SUB_PAGES.length; i++) if (SUB_PAGES[i].key === key) return SUB_PAGES[i].name;
    return key;
  }
  const PAGE_NAME_OF = {};
  CHART_CONFIGS.forEach(c => { PAGE_NAME_OF[c.id] = subPageName(c.subPage); });

  /* ---- 图表清单（按子页分组） ---- */
  const CHARTLIST = [];
  CHART_CONFIGS.forEach(function (c) {
    if (c && c.title) CHARTLIST.push({ page: subPageName(c.subPage), cfg: c });
  });
  function findC(pg, ti) {
    const list = CHARTLIST.filter(x => x.cfg.title === ti && (!pg || x.page === pg));
    return list.length ? list[0].cfg : null;
  }
  function cfgHint(cfg) { return (PAGE_NAME_OF[cfg.id] || '') + '→' + cfg.title; }

  /* ---- 公司组别 / 报告期 ---- */
  const TYPES = (window.COMPANIES_DATA && COMPANIES_DATA.types) ? COMPANIES_DATA.types.slice() : [];
  function grpComps(grp) {
    let cs = COMPANIES.filter(c => grp === '全部' || (c.types || []).indexOf(grp) >= 0);
    if (grp === '全部') cs = cs.filter(c => c.has_data);
    return cs.map(c => c.short_name);
  }
  function sortedReps() {
    let rs = (window.REPORT_PERIODS && REPORT_PERIODS.length) ? REPORT_PERIODS.slice() : ['2025年度'];
    rs = rs.filter(v => /\d{4}/.test(v));
    rs.sort((a, b) => parseInt(b.match(/\d{4}/)[0]) - parseInt(a.match(/\d{4}/)[0]) ||
      (a < b ? 1 : a > b ? -1 : 0));
    return rs.length ? rs : ['2025年度'];
  }
  const REPS = sortedReps();
  function defaultRep() { return REPS.indexOf('2025年度') >= 0 ? '2025年度' : REPS[0]; }

  /* ---- 智能配图规则（关键词 → 我方图表标题，已按本项目 40 图校准） ---- */
  const RULES = [
    { kw: ['税前利润', '所得税', '递延所得税', '税率', '税后净利润', '实际税'], page: '利润分析', title: '税前利润、税率及净利润' },
    { kw: ['净利润', '利润总额'], page: '利润分析', title: '税前利润、税率及净利润' },
    { kw: ['保险服务业绩', '保险业务业绩', '承保经营'], page: '利润分析', title: '保险服务业绩和投资服务业绩' },
    { kw: ['投资服务业绩', '投资业务业绩', '投资业绩', '利差'], page: '利润分析', title: '保险服务业绩和投资服务业绩' },
    { kw: ['总资产'], page: '关键经营指标', title: '总资产' },
    { kw: ['净资产'], page: '关键经营指标', title: '净资产' },
    { kw: ['CSM 余额', 'CSM余额', '合同服务边际余额'], page: '关键经营指标', title: 'CSM 余额' },
    { kw: ['新业务 CSM', '新单CSM', '新单 CSM', '新业务CSM'], page: '关键经营指标', title: '新业务 CSM' },
    { kw: ['新业务 LC', '新单 LC', '亏损合同'], page: '关键经营指标', title: '新业务 LC' },
    { kw: ['其他综合收益', 'OCI'], page: '关键经营指标', title: '其他综合收益(OCI)' },
    { kw: ['保险服务收入', '保险服务费用'], page: '保险服务业绩', title: '保险服务收入/费用/业绩' },
    { kw: ['业务及管理费', '获取费用', '维持费用', '履约费用', '费用分析'], page: '保险服务业绩', title: '费用分析' },
    { kw: ['Non-PAA', '非 PAA', '非PAA', '收入构成', '费用构成'], page: '保险服务业绩', title: '非PAA合同组的收入构成' },
    { kw: ['净投资回报', '投资回报率'], page: '投资服务业绩', title: '净投资回报' },
    { kw: ['承保财务'], page: '投资服务业绩', title: '承保财务净损益' },
    { kw: ['IFRS 9', 'IFRS9', '金融资产', '债权投资', '交易性金融资产'], page: '投资服务业绩', title: 'IFRS 9 金融资产分类' },
    { kw: ['CSM 摊销比例', '摊销比例', '摊销前CSM'], page: '关键监测指标', title: 'CSM 摊销比例' },
    { kw: ['持续率'], page: '关键监测指标', title: 'CSM 持续率' },
    { kw: ['新业务IFRS 利润率', 'IFRS 利润率', '新业务CSM 利润率', '新业务 CSM 利润率'], page: '关键监测指标', title: '新业务IFRS 利润率' },
    { kw: ['亏损率', '亏损占比', '新业务亏损'], page: '关键监测指标', title: '新业务亏损合同占比' },
    { kw: ['保险合同负债'], page: '关键监测指标', title: 'CSM余额占保险合同负债比例' },
    { kw: ['折现率'], page: '其他披露信息', title: '折现率' },
    { kw: ['非金融风险调整', '置信水平'], page: '其他披露信息', title: '非金融风险调整置信水平' },
    { kw: ['CSM 变动', 'CSM变动', 'CSM 变动分析'], page: '关键监测指标', title: 'CSM 变动分析' },
    { kw: ['LC 变动', 'LC变动', 'LC 变动分析'], page: '关键监测指标', title: 'LC 变动分析' }
  ];
  function kwMax(s, rule) {
    let best = 0;
    rule.kw.forEach(function (k) { if (s.indexOf(k) >= 0 && k.length > best) best = k.length; });
    return best;
  }
  function tok(pg, ti, grp) { return '【图:' + pg + '→' + ti + (grp && grp !== '全部' ? '@' + grp : '') + '】'; }
  function ruleTargetOk(ru) { return !!findC(ru.page, ru.title); }

  /* ---- 元素 ---- */
  const el = {};
  const rn2Snaps = [];
  function rn2Push() { if (el.ta) rn2Snaps.push(el.ta.value); if (rn2Snaps.length > 60) rn2Snaps.shift(); }

  function initUI() {
    if (el.ok) return;
    el.ok = true;
    el.type = $('rn2Type'); el.rep = $('rn2Rep'); el.chart = $('rn2Chart');
    el.ta = $('rn2Ta'); el.paper = $('rn2Paper');
    if (!el.type || !el.ta) return;
    let t = '<option value="全部">全部（有数据）</option>';
    TYPES.forEach(function (x) { t += '<option value="' + esc(x) + '">' + esc(x) + '</option>'; });
    el.type.innerHTML = t;
    const headIdx = Math.max(0, TYPES.indexOf('头部险企'));
    el.type.selectedIndex = headIdx + 1; // +1 跳过「全部」
    let r = '';
    REPS.forEach(function (x) { r += '<option value="' + esc(x) + '">' + esc(x) + '</option>'; });
    el.rep.innerHTML = r;
    el.rep.value = defaultRep();
    let cs = '';
    SUB_PAGES.forEach(function (p) {
      const items = CHART_CONFIGS.filter(c => c.subPage === p.key && c.title);
      if (!items.length) return;
      cs += '<optgroup label="' + esc(p.name) + '">';
      items.forEach(function (c) { cs += '<option value="' + esc(p.name + '→' + c.title) + '">' + esc(c.title) + '</option>'; });
      cs += '</optgroup>';
    });
    el.chart.innerHTML = cs;

    $('rn2Auto').onclick = function () {
      rn2Push();
      el.ta.value = autoInsert(el.ta.value);
      refresh();
      toastTip('已按关键词自动插入图表标记，可继续手动微调');
    };
    $('rn2Ins').onclick = function () {
      const v = el.chart.value; if (!v) return;
      const sp = v.indexOf('→'); if (sp < 0) return;
      const pg = v.slice(0, sp), ti = v.slice(sp + 1);
      const s = el.ta.value, pos = el.ta.selectionStart || s.length, end = el.ta.selectionEnd || pos;
      rn2Push();
      el.ta.value = s.slice(0, pos) + tok(pg, ti, el.type.value) + s.slice(end);
      el.ta.focus();
      refresh();
    };
    $('rn2Go').onclick = refresh;
    $('rn2ExH').onclick = function () {
      rn2Push();
      el.ta.value = autoInsert(EX_HEAD);
      refresh();
      toastTip('已载入「示例·头部」，并自动完成智能配图');
    };
    $('rn2ExY').onclick = function () {
      rn2Push();
      el.ta.value = autoInsert(EX_BANK);
      refresh();
      toastTip('已载入「示例·银保系」，并自动完成智能配图');
    };
    $('rn2Copy').onclick = copyHtml;
    $('rn2Dl').onclick = downloadHtml;
    $('rn2Clear').onclick = function () { rn2Push(); el.ta.value = ''; el.paper.innerHTML = ''; };
    $('rn2Reset').onclick = function () {
      rn2Push();
      el.ta.value = window.REPORT_DEFAULT || '';
      try { localStorage.removeItem('rn2draft'); } catch (e) {}
      refresh();
      toastTip('已恢复默认报告模板');
    };
    $('rn2Undo').onclick = function () {
      if (!rn2Snaps.length) { toastTip('没有可撤回的操作（打字误删请用 Ctrl+Z）'); return; }
      el.ta.value = rn2Snaps.pop();
      el.ta.focus();
      refresh();
    };
    el.type.onchange = refresh;
    el.rep.onchange = refresh;
    el.ta.addEventListener('input', function () {
      try { localStorage.setItem('rn2draft', el.ta.value); } catch (e) {}
    });
    el.ta.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); refresh(); }
    });
  }
  function toastTip(msg) { try { if (window.showToast) showToast(msg); } catch (e) {} }

  /* ---- 智能配图 ---- */
  function autoInsert(text) {
    const blocks = text.split(/\n{2,}/), out = [], used = {};
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b].trim();
      if (!block) continue;
      const sents = block.split(/(?=[。；!？])/), rebuilt = [];
      for (let i = 0; i < sents.length; i++) {
        const s = sents[i];
        if (!s.trim()) continue;
        const cands = [];
        for (let r2 = 0; r2 < RULES.length; r2++) {
          const ru = RULES[r2], key = ru.page + '→' + ru.title;
          if (used[key] || !ruleTargetOk(ru)) continue;
          const w = kwMax(s, ru);
          if (w > 0) cands.push({ ru: ru, w: w });
        }
        cands.sort(function (a, bb) { return bb.w - a.w; });
        if (cands.length) {
          used[cands[0].ru.page + '→' + cands[0].ru.title] = 1;
          rebuilt.push(s.trim() + tok(cands[0].ru.page, cands[0].ru.title, el.type.value));
        } else rebuilt.push(s.trim());
      }
      out.push(rebuilt.join(''));
    }
    return out.join('\n\n');
  }

  /* ---- 预览渲染 ---- */
  function refresh() {
    if (!el.ok || !el.paper) return;
    el.paper.innerHTML = '';
    const box = document.createElement('div');
    el.paper.appendChild(box);
    const t = el.ta.value;
    if (!t.trim()) {
      box.innerHTML = '<div class="rn2-empty">等待输入…<br>粘贴段落文字后点「智能配图」，或点上方「示例·头部 / 示例·银保系」体验图文联动；也可点「恢复默认报告」查看整篇示例。</div>';
      return;
    }
    const lines = t.split('\n');
    const buf = [];
    function flushP() {
      if (buf.length) {
        const pp = document.createElement('p');
        pp.className = 'rn2-p';
        pp.textContent = buf.join('').replace(/\s+/g, ' ').trim();
        if (pp.textContent) box.appendChild(pp);
        buf.length = 0;
      }
    }
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const hm = /^(#{1,4})\s*(.*)$/.exec(line);
      if (hm) {
        flushP();
        const hh = document.createElement('h' + hm[1].length);
        hh.className = 'rn2-h';
        hh.textContent = hm[2];
        box.appendChild(hh);
        continue;
      }
      if (!line.trim()) { flushP(); continue; }
      const pieces = line.split(/(【图[：:][^】]*】)/g);
      for (let pi = 0; pi < pieces.length; pi++) {
        const part = pieces[pi];
        const tm = /^【图[：:]([^@】]+?)(?:@([^】]*))?】$/.exec(part);
        if (tm) {
          flushP();
          let pg = '', ti = tm[1], sp2 = tm[1].indexOf('→'), sep2 = 1;
          if (sp2 < 0) { sp2 = tm[1].indexOf('->'); sep2 = 2; }
          if (sp2 > 0) { pg = tm[1].slice(0, sp2).trim(); ti = tm[1].slice(sp2 + sep2).trim(); }
          box.appendChild(figEl(pg, ti, tm[2] ? tm[2].trim() : (el.type.value || '')));
        } else if (part && part.trim()) buf.push(part.trim());
      }
    }
    flushP();
    window.requestAnimationFrame(function () {
      box.querySelectorAll('.rn2-figbox').forEach(function (d) {
        const inst = (typeof echarts !== 'undefined') ? echarts.getInstanceByDom(d) : null;
        if (inst) inst.resize();
      });
    });
  }
  function figEl(pg, ti, grp) {
    const w = document.createElement('div');
    w.className = 'rn2-fig';
    const cap = document.createElement('span');
    cap.className = 'rn2-figcap';
    cap.textContent = (pg ? pg + ' · ' : '') + ti + (grp && grp !== '全部' ? '（' + grp + '）' : '');
    w.appendChild(cap);
    const body = document.createElement('div');
    body.className = 'rn2-figbox';
    w.appendChild(body);
    const cfg = findC(pg, ti);
    if (!cfg) {
      body.innerHTML = '<div class="rn2-empty">未找到图表：' + esc((pg ? pg + '→' : '') + ti) + '<br>可用标题请在右上「手动选图」下拉中查看（格式：子页→图表标题）</div>';
      return w;
    }
    if (cfg.chartType === 'table') body.classList.add('table');
    if (cfg.chartType === 'waterfall') body.classList.add('wf');
    const rep = el.rep ? el.rep.value : defaultRep();
    const comps = grpComps(grp);
    const renderFn = function () {
      try {
        renderChart(cfg, { el: body, companies: comps, periods: [rep] });
      } catch (e) {
        body.innerHTML = '<div class="rn2-empty">渲染失败：' + esc(String((e && e.message) || e)) + '</div>';
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(renderFn);
    else setTimeout(renderFn, 0);
    return w;
  }

  /* ---- 快照 / 复制 / 下载（按文档顺序，含标题/段落/图） ---- */
  function snap() {
    let html = '', plain = '';
    const walk = el.paper.querySelector('.rn2-paper > div');
    if (!walk) return { html: html, plain: plain };
    Array.prototype.forEach.call(walk.childNodes, function (node) {
      if (node.nodeType !== 1) return;
      if (node.classList && node.classList.contains('rn2-fig')) {
        const cap = node.querySelector('.rn2-figcap');
        const capText = cap ? cap.textContent : '';
        html += '<p style="text-align:center;font-size:12px;color:#1f3b63;margin:16px 0 2px">' + esc(capText) + '</p>';
        plain += capText + '\n';
        const box = node.querySelector('.rn2-figbox');
        if (box) {
          const inst = (typeof echarts !== 'undefined') ? echarts.getInstanceByDom(box) : null;
          if (inst && typeof inst.getDataURL === 'function') {
            html += '<img src="' + inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }) + '" style="width:100%;border:1px solid #e2e8f0;border-radius:6px">';
            plain += '[图]\n';
          } else {
            const tbl = box.querySelector('table');
            if (tbl) { html += tbl.outerHTML; plain += '[表格]\n'; }
            else { html += '<div class="rn2-empty">[图渲染未就绪，请先刷新预览]</div>'; plain += '[图未就绪]\n'; }
          }
        }
      } else if (node.classList && node.classList.contains('rn2-p')) {
        html += '<p style="font-size:14px;line-height:2.05;text-align:justify;margin:10px 0">' + esc(node.textContent) + '</p>';
        plain += node.textContent + '\n';
      } else if (node.tagName && /^H[1-4]$/.test(node.tagName)) {
        const lv = parseInt(node.tagName.charAt(1));
        html += '<h' + lv + ' style="color:#1f3b63;margin:18px 0 8px">' + esc(node.textContent) + '</h' + lv + '>';
        plain += node.textContent + '\n';
      }
    });
    return { html: html, plain: plain };
  }
  function copyHtml() {
    const s = snap();
    if (!s.html) { toastTip('正文为空，无可复制内容'); return; }
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0';
    holder.innerHTML = s.html;
    document.body.appendChild(holder);
    try {
      const sel = window.getSelection(), rng = document.createRange();
      rng.selectNodeContents(holder);
      sel.removeAllRanges(); sel.addRange(rng);
      const ok = document.execCommand('copy');
      sel.removeAllRanges();
      const imgN = holder.querySelectorAll('img').length;
      toastTip(ok ? ('已复制 ' + imgN + ' 张图与正文，可直接粘贴到 Word/文档') : '复制失败，请用「下载 HTML」');
    } catch (e) {
      toastTip('复制失败：' + e.message);
    }
    document.body.removeChild(holder);
  }
  function downloadHtml() {
    const s = snap();
    if (!s.html) { toastTip('正文为空，无可下载内容'); return; }
    const doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>年度报告片段</title>' +
      '<style>body{font-family:"Microsoft YaHei","SimHei",sans-serif;max-width:900px;margin:0 auto;padding:36px 20px;color:#2b2b28;line-height:2.05;text-align:justify}table{border-collapse:collapse}td,th{border:1px solid #dde3ea;padding:4px 8px;font-size:12px}th{background:#eef3f9}</style></head><body>' +
      s.html + '</body></html>';
    const a = document.createElement('a');
    a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(doc);
    a.download = '年度报告片段_图文.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  /* ---- 示例短文（演示智能配图） ---- */
  const EX_HEAD = [
    '在利润维度，我们对比了税前利润与净利润表现。2025年末财政部、税务总局出台保险合同准则转换的企业所得税处理公告，明确计税基础后续将切换为新保险合同会计准则下的会计利润。受该政策影响，各家头部险企两年间实际所得税税率出现较为明显的波动。其中太平人寿出现税后净利润高于税前利润的特殊现象，应该主要源于准则切换时点，一次性确认历史可抵扣亏损对应的递延所得税资产，带来的所得税费用抵减效应。',
    '在剔除税务因素对当期利润的扰动后，再观察税前利润，可拆分为保险业务业绩与投资业务业绩两大板块，分别衡量承保经营与投资运营的贡献。'
  ].join('\n\n');
  const EX_BANK = [
    '（银保系正文待您撰写——以下仅演示图文联动机制，请以实际分析替换正文。）',
    '对银行系公司而言，税前利润与净利润的差额主要来自所得税费用与少数股东损益。准则转换企业所得税处理公告落地后，各家两年间实际所得税税率亦出现波动。在利润维度，我们同样对比税前利润、税率及净利润表现；进一步把税前利润拆分为保险服务业绩与投资服务业绩两大板块观察。'
  ].join('\n\n');

  /* ---- 初始化 ---- */
  function initDelayed() {
    if (!document.getElementById('rn2Ta')) { setTimeout(initDelayed, 120); return; }
    initUI();
    // 首载：无草稿则填入默认报告（默认报告含图位标记，打开即演示图文联动）
    setTimeout(function () {
      try {
        if (!el.ta) return;
        let draft = '';
        try { draft = localStorage.getItem('rn2draft'); } catch (e) {}
        if (!draft || draft.length < 20) {
          el.ta.value = (window.REPORT_DEFAULT && window.REPORT_DEFAULT.length > 20) ? window.REPORT_DEFAULT : EX_HEAD;
        } else {
          el.ta.value = draft;
        }
        refresh();
      } catch (e) {}
    }, 60);
  }
  initDelayed();

  window.RN2 = { refresh: refresh };
})();
