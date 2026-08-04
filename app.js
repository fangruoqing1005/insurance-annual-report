/**
 * 应用核心逻辑
 * 数据驱动：从config.js读取图表配置，从data.js读取数据库，动态渲染所有图表
 */

// ============ 全局状态 ============
let currentSubPage = 'key-report';
let selectedCompany = '';
let selectedPeriod = '';
let chartInstances = {};

// ============ 数据预处理 ============

/**
 * 从原始数据中提取可用选项（公司、报告期）
 */
function extractFilters() {
  const companies = [...new Set(RAW_DATA.map(r => r['公司名称']))].filter(Boolean);
  const periods = [...new Set(RAW_DATA.map(r => r['报告期']))].filter(Boolean);
  const companyTypes = [...new Set(RAW_DATA.map(r => r['公司类型']))].filter(Boolean);
  return { companies, periods, companyTypes };
}

/**
 * 判断指标编号是否为原生指标（简单编码，如A06、B17）
 */
function isNativeCode(code) {
  return /^[A-Z]\d{2}$/.test(code);
}

/**
 * 判断公式是否为比率（包含除法）
 */
function isRatio(formula) {
  return formula.includes('/');
}

/**
 * 获取原生指标在指定时间标签下的值
 * @param {string} code - 指标编号
 * @param {string} chartPeriod - 图表期间（期末/本期）
 * @param {string} companyName - 公司名称
 * @param {string} reportPeriod - 报告期
 * @returns {{current: number|null, previous: number|null}}
 */
function getNativeValues(code, chartPeriod, companyName, reportPeriod) {
  const rows = RAW_DATA.filter(r =>
    r['指标编号'] === code &&
    r['公司名称'] === companyName &&
    r['报告期'] === reportPeriod
  );

  let current = null, previous = null;

  if (chartPeriod === '期末') {
    // 优先查找 期末/期初 类型（T01资产表、T07合同服务边际表）
    const qiMoRows = rows.filter(r => r['期间'] === '期末');
    if (qiMoRows.length > 0) {
      for (const row of qiMoRows) {
        const source = String(row['指标来源'] || '');
        const value = parseFloat(row['数值-换算']);
        if (!source.includes('上期')) {
          if (current === null) current = value;
        } else if (source.includes('上期末')) {
          previous = value;
        }
      }
      // 如果没有从"上期末"获取到previous，尝试从"期初"获取（T01逻辑：期初=上年末）
      if (previous === null) {
        const qiChuRows = rows.filter(r => r['期间'] === '期初');
        for (const row of qiChuRows) {
          const source = String(row['指标来源'] || '');
          if (!source.includes('上期')) {
            previous = parseFloat(row['数值-换算']);
            break;
          }
        }
      }
    } else {
      // 回退到 本期/上期（T04的D系列，期间="本期"代表年末时点值）
      for (const row of rows) {
        if (row['期间'] === '本期') current = parseFloat(row['数值-换算']);
        else if (row['期间'] === '上期') previous = parseFloat(row['数值-换算']);
      }
    }
  } else if (chartPeriod === '本期') {
    // 优先查找 本期/上期 类型（T02利润表、T04、T06、T08）
    const benQiRows = rows.filter(r => r['期间'] === '本期');
    if (benQiRows.length > 0) {
      for (const row of rows) {
        if (row['期间'] === '本期') current = parseFloat(row['数值-换算']);
        else if (row['期间'] === '上期') previous = parseFloat(row['数值-换算']);
      }
    } else {
      // 回退到 期末/期初
      for (const row of rows) {
        const source = String(row['指标来源'] || '');
        if (row['期间'] === '期末' && !source.includes('上期')) current = parseFloat(row['数值-换算']);
        else if (row['期间'] === '期初' && !source.includes('上期')) previous = parseFloat(row['数值-换算']);
      }
    }
  }

  return { current, previous };
}

/**
 * 从公式中提取所有指标编号
 */
function extractCodes(formula) {
  const matches = formula.match(/[A-Z]\d{2}/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * 计算公式指标的值
 * @param {string} formula - 计算公式，如 "D10/D02" 或 "B02+B03-B08"
 * @param {string} chartPeriod - 图表期间
 * @param {string} companyName - 公司名称
 * @param {string} reportPeriod - 报告期
 * @returns {{current: number|null, previous: number|null}}
 */
function calcFormulaValues(formula, chartPeriod, companyName, reportPeriod) {
  const codes = extractCodes(formula);
  const currentVals = {};
  const previousVals = {};

  for (const code of codes) {
    const { current, previous } = getNativeValues(code, chartPeriod, companyName, reportPeriod);
    currentVals[code] = current;
    previousVals[code] = previous;
  }

  // 检查是否所有当前期值都存在
  const hasCurrent = codes.every(c => currentVals[c] !== null);
  const hasPrevious = codes.every(c => previousVals[c] !== null);

  let current = null, previous = null;

  if (hasCurrent) {
    current = evalFormula(formula, currentVals);
    // 比率指标取绝对值
    if (isRatio(formula) && current !== null) {
      current = Math.abs(current);
    }
  }

  if (hasPrevious) {
    previous = evalFormula(formula, previousVals);
    if (isRatio(formula) && previous !== null) {
      previous = Math.abs(previous);
    }
  }

  return { current, previous };
}

/**
 * 安全求值公式
 */
function evalFormula(formula, values) {
  let expr = formula;
  const codes = Object.keys(values).sort((a, b) => b.length - a.length);
  for (const code of codes) {
    const val = values[code];
    if (val === null || val === undefined) return null;
    // 使用 split/join 安全替换，避免正则特殊字符问题
    expr = expr.split(code).join(`(${val})`);
  }
  try {
    const result = new Function('return ' + expr)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch (e) {
    console.warn('Formula eval error:', formula, expr, e);
    return null;
  }
}

/**
 * 获取指标的值（自动判断原生或计算）
 */
function getIndicatorValues(indicator, chartPeriod, companyName, reportPeriod) {
  if (isNativeCode(indicator)) {
    return getNativeValues(indicator, chartPeriod, companyName, reportPeriod);
  } else {
    return calcFormulaValues(indicator, chartPeriod, companyName, reportPeriod);
  }
}

// ============ 图表渲染 ============

/**
 * 格式化数值显示
 */
function formatValue(value, isPercent) {
  if (value === null || value === undefined) return 'N/A';
  if (isPercent) {
    return (value * 100).toFixed(2) + '%';
  }
  if (Math.abs(value) >= 10000) {
    return (value / 10000).toFixed(2) + '万亿';
  }
  return value.toFixed(2);
}

/**
 * 判断图表是否为百分比类型
 */
function isPercentChart(config) {
  return config.indicators.some(ind => !isNativeCode(ind) && isRatio(ind));
}

/**
 * 渲染单张图表
 */
function renderChart(config, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isPercent = isPercentChart(config);
  const indicators = config.indicators;
  const displayNames = config.displayNames;

  // 获取X轴标签（期间）
  const periodLabels = getTimeLabels(config.period);

  // 为每个指标获取数据
  const series = [];
  for (let i = 0; i < indicators.length; i++) {
    const indicator = indicators[i];
    const displayName = displayNames[i];
    const { current, previous } = getIndicatorValues(
      indicator, config.period, selectedCompany, selectedPeriod
    );

    const data = [];
    if (current !== null) data.push(current);
    else data.push(null);
    if (previous !== null && periodLabels.length > 1) data.push(previous);
    else if (periodLabels.length > 1) data.push(null);

    series.push({
      name: displayName,
      type: config.chartType === 'line' ? 'line' : 'bar',
      data: data,
      // 只保留实际存在的数据点
      barWidth: config.chartType === 'stackedBar' || config.chartType === 'groupedBar' ? '40%' : '50%',
      itemStyle: {
        color: CHART_COLORS[i % CHART_COLORS.length]
      },
      lineStyle: { width: 3 },
      symbolSize: 10,
      label: {
        show: true,
        position: config.chartType === 'stackedBar' ? 'inside' : 'top',
        formatter: (params) => {
          if (params.value === null || params.value === undefined) return '';
          return formatValue(params.value, isPercent);
        },
        fontSize: 11,
        color: config.chartType === 'stackedBar' ? '#fff' : '#666'
      }
    });
  }

  // 堆叠柱状图设置
  if (config.chartType === 'stackedBar') {
    series.forEach(s => { s.stack = 'total'; });
  }

  // 过滤掉所有值都为null的期间
  const validPeriodLabels = periodLabels.slice(0, series[0].data.length);

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        let html = `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>`;
        params.forEach(p => {
          if (p.value !== null && p.value !== undefined) {
            html += `<div style="display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
              <span>${p.seriesName}:</span>
              <span style="font-weight:600;margin-left:auto">${formatValue(p.value, isPercent)}</span>
            </div>`;
          }
        });
        return html;
      }
    },
    legend: {
      show: indicators.length > 1,
      top: 5,
      textStyle: { fontSize: 11, color: '#555' },
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 15
    },
    grid: {
      left: '8%',
      right: '5%',
      bottom: '10%',
      top: indicators.length > 1 ? 45 : 25,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: validPeriodLabels,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { color: '#666', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#666',
        fontSize: 11,
        formatter: (val) => {
          if (isPercent) return (val * 100).toFixed(0) + '%';
          if (Math.abs(val) >= 10000) return (val / 10000).toFixed(1) + '万亿';
          return val.toFixed(0);
        }
      },
      splitLine: { lineStyle: { color: '#f0f0f0' } }
    },
    series: series
  };

  // 销毁旧实例
  if (chartInstances[containerId]) {
    chartInstances[containerId].dispose();
  }

  const chart = echarts.init(container);
  chart.setOption(option);
  chartInstances[containerId] = chart;
}

/**
 * 根据图表期间获取时间标签
 */
function getTimeLabels(chartPeriod) {
  // 从报告期中提取年份，如 "2025年度" → "2025"
  const yearMatch = selectedPeriod.match(/(\d{4})/);
  if (!yearMatch) return ['本期', '上期'];

  const currentYear = yearMatch[1];
  const prevYear = String(parseInt(currentYear) - 1);

  if (chartPeriod === '期末') {
    return [currentYear + '年末', prevYear + '年末'];
  } else {
    return [currentYear + '年度', prevYear + '年度'];
  }
}

/**
 * 渲染子页面的所有图表
 */
function renderSubPage(subPageId) {
  const content = document.getElementById('chart-content');
  const configs = CHART_CONFIGS.filter(c => c.subPage === subPageId);

  if (configs.length === 0) {
    content.innerHTML = '<div class="no-data">暂无图表配置</div>';
    return;
  }

  // 检查是否已选择公司和报告期
  if (!selectedCompany || !selectedPeriod) {
    content.innerHTML = '<div class="no-data">请在上方选择公司和报告期</div>';
    return;
  }

  // 构建HTML
  let html = '<div class="chart-grid">';
  configs.forEach((config, index) => {
    html += `
      <div class="chart-card">
        <div class="chart-card-header">
          <h3>${config.title}</h3>
        </div>
        <div id="chart-${subPageId}-${index}" class="chart-container"></div>
        ${config.annotation ? `<div class="chart-annotation">${config.annotation}</div>` : ''}
      </div>
    `;
  });
  html += '</div>';

  content.innerHTML = html;

  // 渲染图表
  configs.forEach((config, index) => {
    const containerId = `chart-${subPageId}-${index}`;
    setTimeout(() => renderChart(config, containerId), 50);
  });
}

// ============ 导航逻辑 ============
// 导航通过 buildSidebar 中的事件绑定处理

// ============ 筛选器逻辑 ============

function initFilters() {
  const { companies, periods, companyTypes } = extractFilters();

  // 公司选择
  const companySelect = document.getElementById('company-select');
  companySelect.innerHTML = '<option value="">请选择公司</option>' +
    companies.map(c => `<option value="${c}">${c}</option>`).join('');
  companySelect.value = selectedCompany;

  // 报告期选择
  const periodSelect = document.getElementById('period-select');
  periodSelect.innerHTML = '<option value="">请选择报告期</option>' +
    periods.map(p => `<option value="${p}">${p}</option>`).join('');
  periodSelect.value = selectedPeriod;

  // 公司类型选择
  const typeSelect = document.getElementById('type-select');
  typeSelect.innerHTML = '<option value="">全部类型</option>' +
    companyTypes.map(t => `<option value="${t}">${t}</option>`).join('');
}

function applyFilters() {
  selectedCompany = document.getElementById('company-select').value;
  selectedPeriod = document.getElementById('period-select').value;

  if (!selectedCompany || !selectedPeriod) {
    document.getElementById('chart-content').innerHTML =
      '<div class="no-data">请选择公司和报告期后查看图表</div>';
    return;
  }

  renderSubPage(currentSubPage);
}

// ============ 初始化 ============

function initApp() {
  // 初始化筛选器
  initFilters();

  // 构建左侧导航
  buildSidebar();

  // 默认选择第一个公司和报告期
  const { companies, periods } = extractFilters();
  if (companies.length > 0) selectedCompany = companies[0];
  if (periods.length > 0) selectedPeriod = periods[0];

  // 更新筛选器UI
  document.getElementById('company-select').value = selectedCompany;
  document.getElementById('period-select').value = selectedPeriod;

  // 渲染默认子页面
  renderSubPage(currentSubPage);

  // 窗口resize时重绘图表
  window.addEventListener('resize', () => {
    Object.values(chartInstances).forEach(chart => {
      if (chart && !chart.isDisposed()) chart.resize();
    });
  });
}

function buildSidebar() {
  const sidebar = document.getElementById('sidebar-nav');
  let html = `
    <div class="nav-section">
      <div class="nav-section-title">
        <i class="fas fa-chart-bar"></i>
        <span>数据分析</span>
      </div>
      <div class="nav-sub-items">
  `;

  SUB_PAGES.forEach(page => {
    html += `
      <div class="nav-sub-item ${page.id === currentSubPage ? 'active' : ''}"
           data-sub-page="${page.id}">
        <i class="fas ${page.icon}"></i>
        <span>${page.name}</span>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  sidebar.innerHTML = html;

  // 绑定点击事件
  sidebar.querySelectorAll('.nav-sub-item').forEach(el => {
    el.addEventListener('click', () => {
      currentSubPage = el.dataset.subPage;
      // 更新高亮
      sidebar.querySelectorAll('.nav-sub-item').forEach(item => {
        item.classList.toggle('active', item === el);
      });
      renderSubPage(currentSubPage);
    });
  });
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
