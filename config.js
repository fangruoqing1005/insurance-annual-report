/**
 * 图表配置 - 基于表格清单.xlsx
 * 数据驱动：所有图表规格在此定义，修改图表无需改动渲染逻辑
 */

const SUB_PAGES = [
  { id: 'key-report', name: '关键年报数据', icon: 'fa-database' },
  { id: 'insurance-service', name: '保险服务业绩', icon: 'fa-shield-alt' },
  { id: 'investment-service', name: '投资服务业绩', icon: 'fa-chart-line' },
  { id: 'profit-analysis', name: '利润分析', icon: 'fa-coins' },
  { id: 'new-business', name: '新业务分析', icon: 'fa-seedling' }
];

const CHART_CONFIGS = [
  // ==================== 关键年报数据 ====================
  {
    subPage: 'key-report',
    title: '净资产',
    indicators: ['A06'],
    displayNames: ['净资产'],
    chartType: 'bar',
    period: '期末',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: '净利润',
    indicators: ['B17'],
    displayNames: ['净利润'],
    chartType: 'bar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: '总资产',
    indicators: ['A07'],
    displayNames: ['总资产'],
    chartType: 'bar',
    period: '期末',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: 'CSM 余额',
    indicators: ['D10'],
    displayNames: ['CSM 余额'],
    chartType: 'bar',
    period: '期末',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: '按过渡期方法拆分CSM',
    indicators: ['G01', 'G02', 'G03'],
    displayNames: ['采用修正追溯法计量的合同', '采用公允价值法计量的合同', '其他保险合同'],
    chartType: 'stackedBar',
    period: '期末',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: 'CSM/BEL占比',
    indicators: ['D10/D02'],
    displayNames: ['CSM/BEL占比'],
    chartType: 'bar',
    period: '期末',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: 'CSM 变动分析',
    indicators: ['D08', 'D06', 'D09', 'D07'],
    displayNames: ['新单CSM', 'CSM计息', 'CSM吸收', 'CSM摊销'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: 'CSM 摊销比例',
    indicators: ['D07/(D05+D06+D08+D09)'],
    displayNames: ['CSM 摊销比例'],
    chartType: 'line',
    period: '本期',
    annotation: 'CSM 摊销比例=CSM摊销/摊销前CSM'
  },
  {
    subPage: 'key-report',
    title: 'CSM 持续率',
    indicators: ['D08/D07'],
    displayNames: ['CSM 持续率'],
    chartType: 'line',
    period: '本期',
    annotation: 'CSM 持续率=新业务CSM/CSM摊销'
  },
  {
    subPage: 'key-report',
    title: 'IFRS 9 金融资产分类',
    indicators: ['A02', 'A03', 'A01', 'A04'],
    displayNames: ['债权投资', '其他债券投资', '交易性金融资产', '其他权益工具投资'],
    chartType: 'stackedBar',
    period: '期末',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: '其他综合收益(OCI)',
    indicators: ['B18'],
    displayNames: ['其他综合收益(OCI)'],
    chartType: 'bar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'key-report',
    title: '其他综合收益(OCI)-资产负债匹配',
    indicators: ['B22', 'B20'],
    displayNames: ['可转损益的负债OCI', 'FVOCI债券公允价值'],
    chartType: 'groupedBar',
    period: '本期',
    annotation: ''
  },

  // ==================== 保险服务业绩 ====================
  {
    subPage: 'insurance-service',
    title: '保险服务收入/费用/业绩',
    indicators: ['B01', 'B12', 'B01+B12'],
    displayNames: ['保险服务收入', '保险服务费用', '保险服务业绩'],
    chartType: 'groupedBar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'insurance-service',
    title: '收入构成 — PAA vs Non-PAA',
    indicators: ['F05', 'F06'],
    displayNames: ['保险服务收入-非PAA', '保险服务收入-PAA'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'insurance-service',
    title: '非PAA合同组的收入构成',
    indicators: ['F01', 'F02', 'F03', 'F04'],
    displayNames: ['预期当期发生的保险服务费用', '非金融风险调整的变动', '合同服务边际的释放', '保险获取现金流量的摊销'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: ''
  },

  // ==================== 投资服务业绩 ====================
  {
    subPage: 'investment-service',
    title: '投资服务业绩',
    indicators: ['B02+B03+B04+B05+B08+B09+B07+B10'],
    displayNames: ['投资服务业绩'],
    chartType: 'bar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'investment-service',
    title: '净投资回报',
    indicators: ['B02+B03+B04+B05+B08+B09+B07'],
    displayNames: ['净投资回报'],
    chartType: 'bar',
    period: '本期',
    annotation: '净投资回报=利息收入+投资收益+公允价值变动+汇兑损益-利息支出-其他资产减值-信用减值损失'
  },
  {
    subPage: 'investment-service',
    title: '承保财务净损益',
    indicators: ['B10'],
    displayNames: ['承保财务净损益'],
    chartType: 'bar',
    period: '本期',
    annotation: ''
  },

  // ==================== 利润分析 ====================
  {
    subPage: 'profit-analysis',
    title: '保险服务业绩和投资服务业绩',
    indicators: ['B01+B12', 'B02+B03+B04+B05+B08+B09+B07+B10'],
    displayNames: ['保险服务业绩', '投资服务业绩'],
    chartType: 'groupedBar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'profit-analysis',
    title: '费用分析',
    indicators: ['H01', 'H02', 'H03'],
    displayNames: ['获取费用', '维持费用', '非履约费用'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: ''
  },

  // ==================== 新业务分析 ====================
  {
    subPage: 'new-business',
    title: '新业务 CSM',
    indicators: ['D08'],
    displayNames: ['新业务CSM'],
    chartType: 'bar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'new-business',
    title: '新业务 LC',
    indicators: ['E11'],
    displayNames: ['新业务 LC'],
    chartType: 'bar',
    period: '本期',
    annotation: ''
  },
  {
    subPage: 'new-business',
    title: '新业务IFRS 利润率',
    indicators: ['(D08-E11)/E01'],
    displayNames: ['新业务IFRS 利润率'],
    chartType: 'line',
    period: '本期',
    annotation: '新业务IFRS利润率=(新业务CSM-新业务LC)/新业务合同未来现金流入现值'
  }
];

// 图表颜色方案
const CHART_COLORS = [
  '#C8102E', // 中国红
  '#1A3263', // 深蓝
  '#D4A373', // 金色
  '#2A9D8F', // 青绿
  '#E76F51', // 珊瑚
  '#6A4C93', // 紫色
  '#1982C4', // 蓝色
  '#8AC926'  // 绿色
];
