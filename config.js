/**
 * 图表配置 - v2（数据驱动，40个图表/表格）
 * 依据：表格清单-v2.xlsx（6个子页面）
 * chartType: bar | groupedBar | stackedBar | line | waterfall | table | barLine
 */

const SUB_PAGES = [
  { key: 'key-ops', name: '关键经营指标' },
  { key: 'profit-analysis', name: '利润分析' },
  { key: 'insurance-service', name: '保险服务业绩' },
  { key: 'investment-service', name: '投资服务业绩' },
  { key: 'key-monitor', name: '关键监测指标' },
  { key: 'disclosure', name: '其他披露信息' }
];

const CHART_CONFIGS = [
  // ==================== 关键经营指标 ====================
  {
    id: 'chart1',
    subPage: 'key-ops',
    title: '关键数据总览',
    indicators: ['A07', 'A06', 'B17', 'B01', 'D10'],
    displayNames: ['总资产', '净资产', '净利润', '保险服务收入', 'CSM余额'],
    periods: ['期末', '期末', '本期', '本期', '本期'],
    chartType: 'table',
    tableTranspose: true,
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart2',
    subPage: 'key-ops',
    title: '总资产',
    indicators: ['A07'],
    displayNames: ['总资产'],
    chartType: 'bar',
    period: '期末',
    unit: '亿元'
  },
  {
    id: 'chart3',
    subPage: 'key-ops',
    title: '净资产',
    indicators: ['A06'],
    displayNames: ['净资产'],
    chartType: 'bar',
    period: '期末',
    unit: '亿元'
  },
  {
    id: 'chart4',
    subPage: 'key-ops',
    title: '净利润',
    indicators: ['B17'],
    displayNames: ['净利润'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart5',
    subPage: 'key-ops',
    title: '其他综合收益(OCI)',
    indicators: ['B18'],
    displayNames: ['其他综合收益(OCI)'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart6',
    subPage: 'key-ops',
    title: 'CSM 余额',
    indicators: ['D10'],
    displayNames: ['CSM余额'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart7',
    subPage: 'key-ops',
    title: '按过渡期方法拆分CSM',
    indicators: ['G01', 'G02', 'G03'],
    displayNames: ['采用修正追溯法计量的合同', '采用公允价值法计量的合同', '其他保险合同'],
    chartType: 'stackedBar',
    period: '本期末',
    unit: '亿元'
  },
  {
    id: 'chart8',
    subPage: 'key-ops',
    title: '新业务 CSM',
    indicators: ['D08'],
    displayNames: ['新业务CSM'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart9',
    subPage: 'key-ops',
    title: '新业务 LC',
    indicators: ['E11'],
    displayNames: ['新业务LC'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元'
  },

  // ==================== 利润分析 ====================
  {
    id: 'chart10',
    subPage: 'profit-analysis',
    title: '税前利润、税率及净利润',
    indicators: ['B15', 'B17', 'B16/B15'],
    displayNames: ['税前利润', '净利润', '税率'],
    chartType: 'barLine',
    period: '本期',
    unit: '亿元',
    valueFormatter: [null, null, v => v != null ? (v * 100).toFixed(2) : null],
    annotation: '税率 = 所得税费用 / 利润总额（右轴）'
  },
  {
    id: 'chart11',
    subPage: 'profit-analysis',
    title: '保险服务业绩和投资服务业绩',
    indicators: ['B01+B12', 'B02+B03+B04+B05+B06+B08+B09+B07+B10+B11'],
    displayNames: ['保险服务业绩', '投资服务业绩'],
    chartType: 'groupedBar',
    period: '本期',
    unit: '亿元'
  },

  // ==================== 保险服务业绩 ====================
  {
    id: 'chart12',
    subPage: 'insurance-service',
    title: '保险服务收入/费用/业绩',
    indicators: ['B01', 'B12', 'B01+B12'],
    displayNames: ['保险服务收入', '保险服务费用', '保险服务业绩'],
    chartType: 'groupedBar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart13',
    subPage: 'insurance-service',
    title: '收入构成 — PAA vs Non-PAA',
    indicators: ['F05', 'F06'],
    displayNames: ['保险服务收入-非PAA', '保险服务收入-PAA'],
    chartType: 'stackedBar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart14',
    subPage: 'insurance-service',
    title: '非PAA合同组的收入构成',
    indicators: ['F01', 'F02', 'F03', 'F04'],
    displayNames: ['预计当期发生的赔款及其他相关费用', '非金融风险调整的变动', '合同服务边际的释放', '保险获取现金流量的摊销'],
    chartType: 'stackedBar',
    period: '本期',
    unit: '亿元',
    bodyHeight: 440,
    legendBottom: true
  },
  {
    id: 'chart15',
    subPage: 'insurance-service',
    title: '非PAA合同组的费用构成',
    indicators: ['C06', 'F04', 'C03', 'C09'],
    displayNames: ['当期发生赔款及其他相关费用', '保险获取现金流量的摊销', '亏损部分的确认及转回', '已发生赔款负债相关履约现金流量变动'],
    chartType: 'stackedBar',
    period: '本期',
    unit: '亿元',
    bodyHeight: 440,
    legendBottom: true
  },
  {
    id: 'chart16',
    subPage: 'insurance-service',
    title: '费用分析',
    indicators: ['H01', 'H02', 'H03'],
    displayNames: ['获取费用', '维持费用', '非履约费用'],
    chartType: 'stackedBar',
    period: '本期',
    unit: '亿元'
  },

  // ==================== 投资服务业绩 ====================
  {
    id: 'chart17',
    subPage: 'investment-service',
    title: '投资服务业绩',
    indicators: ['B02+B03+B04+B05+B06+B08+B09+B07+B10+B11'],
    displayNames: ['投资服务业绩'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart18',
    subPage: 'investment-service',
    title: '净投资回报',
    indicators: ['B02+B03+B04+B05+B06+B08+B09+B07'],
    displayNames: ['净投资回报'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元',
    annotation: '净投资回报 = 利息收入+投资收益+公允价值变动+汇兑损益-利息支出-其他资产减值-信用减值损失'
  },
  {
    id: 'chart19',
    subPage: 'investment-service',
    title: '承保财务净损益',
    indicators: ['B10+B11'],
    displayNames: ['承保财务净损益'],
    chartType: 'bar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart20',
    subPage: 'investment-service',
    title: 'IFRS 9 金融资产分类',
    indicators: ['A02', 'A03', 'A01', 'A04'],
    displayNames: ['债权投资', '其他债权投资', '交易性金融资产', '其他权益工具投资'],
    chartType: 'stackedBar',
    period: '期末',
    unit: '亿元'
  },

  // ==================== 关键监测指标 ====================
  {
    id: 'chart21',
    subPage: 'key-monitor',
    title: 'CSM 变动分析',
    indicators: ['D05', 'D08', 'D06', 'D09', 'D07', 'D10'],
    displayNames: ['期初CSM', '新单CSM', 'CSM计息', 'CSM吸收', 'CSM摊销', '期末CSM'],
    chartType: 'waterfall',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart22',
    subPage: 'key-monitor',
    title: 'LC 变动分析',
    indicators: ['C01+C10', 'E11', 'C02+C11', 'C03+C12-E11', 'C04+C13', 'C05+C14'],
    displayNames: ['期初LC', '新业务LC', 'LC计息', 'LC加剧', 'LC摊销', '期末LC'],
    chartType: 'waterfall',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart23',
    subPage: 'key-monitor',
    title: 'CSM/BEL占比',
    indicators: ['D10/D02'],
    displayNames: ['CSM/BEL占比'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null
  },
  {
    id: 'chart24',
    subPage: 'key-monitor',
    title: 'CSM余额占保险合同负债比例',
    indicators: ['D10/A05'],
    displayNames: ['CSM/保险合同负债'],
    chartType: 'line',
    period: '本期',
    periodMap: {'D10': '本期', 'A05': '期末'},
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null
  },
  {
    id: 'chart25',
    subPage: 'key-monitor',
    title: '新业务驱动率(CSM贡献率)',
    indicators: ['D08/D05'],
    displayNames: ['当期初始确认的CSM/年初的CSM'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null
  },
  {
    id: 'chart26',
    subPage: 'key-monitor',
    title: '新业务IFRS 利润率',
    indicators: ['(D08-E11)/E01'],
    displayNames: ['新业务IFRS利润率'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: '新业务IFRS利润率 = (新业务CSM-新业务LC) / 新业务合同未来现金流入现值'
  },
  {
    id: 'chart27',
    subPage: 'key-monitor',
    title: '新业务获取费用率',
    indicators: ['E07/E01'],
    displayNames: ['新业务获取费用率'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: '新业务获取费用率 = 当期初始确认保险合同的保险获取现金流量 / 新业务合同未来现金流入现值'
  },
  {
    id: 'chart28',
    subPage: 'key-monitor',
    title: '新业务亏损合同占比',
    indicators: ['E11/(D08+E11)'],
    displayNames: ['新业务亏损合同占比'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: '新业务亏损合同占比 = 初始确认的亏损 / (初始确认的CSM+初始确认的亏损)'
  },
  {
    id: 'chart29',
    subPage: 'key-monitor',
    title: 'CSM计息率',
    indicators: ['D06/D05'],
    displayNames: ['CSM计息率'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: 'CSM计息率 = CSM计息 / 期初CSM'
  },
  {
    id: 'chart30',
    subPage: 'key-monitor',
    title: 'CSM调整占比',
    indicators: ['D09/D05'],
    displayNames: ['CSM调整占比'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: 'CSM调整占比 = CSM会计估计调整额 / 期初CSM'
  },
  {
    id: 'chart31',
    subPage: 'key-monitor',
    title: 'CSM 摊销比例',
    indicators: ['-D07/(D05+D06+D08+D09)'],
    displayNames: ['CSM摊销比例'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: 'CSM摊销比例 = CSM摊销 / 摊销前CSM'
  },
  {
    id: 'chart32',
    subPage: 'key-monitor',
    title: 'CSM摊销占保险服务业绩的比例',
    indicators: ['-D07/(B01+B12)'],
    displayNames: ['CSM摊销占保险服务业绩的比例'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: 'CSM摊销占保险服务业绩的比例 = 合同服务边际摊销额 / 保险服务业绩'
  },
  {
    id: 'chart33',
    subPage: 'key-monitor',
    title: 'CSM摊销占保险服务收入的比例',
    indicators: ['-D07/F05'],
    displayNames: ['CSM摊销占保险服务收入的比例'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: 'CSM摊销占保险服务收入的比例 = 合同服务边际摊销额 / 保险服务收入'
  },
  {
    id: 'chart34',
    subPage: 'key-monitor',
    title: 'CSM 持续率',
    indicators: ['D08/D07'],
    displayNames: ['CSM持续率'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: 'CSM持续率 = 新业务CSM / CSM摊销'
  },
  {
    id: 'chart35',
    subPage: 'key-monitor',
    title: '其他综合收益(OCI)-资产负债匹配',
    indicators: ['B22', 'B20'],
    displayNames: ['可转损益的负债OCI', 'FVOCI债券公允价值'],
    chartType: 'groupedBar',
    period: '本期',
    unit: '亿元'
  },
  {
    id: 'chart36',
    subPage: 'key-monitor',
    title: '承保财务净损益占投资回报的比例',
    indicators: ['(B10+B11)/(B02+B03+B04+B05+B06+B08+B09+B07)'],
    displayNames: ['承保财务净损益占投资回报的比例'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: '承保财务净损益占投资回报的比例 = 承保财务净损益 / 净投资收益'
  },
  {
    id: 'chart37',
    subPage: 'key-monitor',
    title: '保险服务利润率',
    indicators: ['(B01+B12)/B01'],
    displayNames: ['保险服务利润率'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: '保险服务利润率 = 保险服务业绩 / 保险服务收入'
  },
  {
    id: 'chart38',
    subPage: 'key-monitor',
    title: '投入产出比',
    indicators: ['(D08-E11)/E07'],
    displayNames: ['投入产出比'],
    chartType: 'line',
    period: '本期',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null,
    annotation: '投入产出比 = (新业务CSM-新业务LC) / 保险获取现金流量'
  },

  // ==================== 其他披露信息 ====================
  {
    id: 'chart39',
    subPage: 'disclosure',
    title: '折现率',
    indicators: ['I01'],
    displayNames: ['折现率区间'],
    chartType: 'table',
    period: '本期',
    unit: ''
  },
  {
    id: 'chart40',
    subPage: 'disclosure',
    title: '非金融风险调整置信水平',
    indicators: ['J01'],
    displayNames: ['非金融风险调整置信水平'],
    chartType: 'table',
    period: '本期',
    unit: ''
  }
];
