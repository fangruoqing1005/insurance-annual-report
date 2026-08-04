/**
 * 图表配置 - 22张图表（数据驱动）
 * 适配多公司查询：每个图表通过 indicators/formulas 从 RAW_DATA 中取数
 */

const CHART_CONFIGS = [
  // ==================== 关键年报数据 ====================
  {
    id: 'chart1',
    subPage: 'key-report',
    title: '净资产',
    tag: 'T01',
    indicators: ['A06'],
    displayNames: ['净资产'],
    chartType: 'bar',
    period: '期末',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart2',
    subPage: 'key-report',
    title: '净利润',
    tag: 'T03',
    indicators: ['B17'],
    displayNames: ['净利润'],
    chartType: 'bar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart3',
    subPage: 'key-report',
    title: '总资产',
    tag: 'T01',
    indicators: ['A07'],
    displayNames: ['总资产'],
    chartType: 'bar',
    period: '期末',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart4',
    subPage: 'key-report',
    title: 'CSM 余额',
    tag: 'T04',
    indicators: ['D10'],
    displayNames: ['CSM 余额'],
    chartType: 'bar',
    period: '期末',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart5',
    subPage: 'key-report',
    title: '按过渡期方法拆分CSM',
    tag: 'T04',
    indicators: ['G01', 'G02', 'G03'],
    displayNames: ['采用修正追溯法计量的合同', '采用公允价值法计量的合同', '其他保险合同'],
    chartType: 'stackedBar',
    period: '期末',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart6',
    subPage: 'key-report',
    title: 'CSM/BEL占比',
    tag: 'T04',
    indicators: ['D10/D02'],
    displayNames: ['CSM/BEL占比'],
    chartType: 'bar',
    period: '期末',
    annotation: '',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null
  },
  {
    id: 'chart7',
    subPage: 'key-report',
    title: 'CSM 变动分析',
    tag: 'T04',
    indicators: ['D08', 'D06', 'D09', 'D07'],
    displayNames: ['新单CSM', 'CSM计息', 'CSM吸收', 'CSM摊销'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart8',
    subPage: 'key-report',
    title: 'CSM 摊销比例',
    tag: 'T04',
    indicators: ['D07/(D05+D06+D08+D09)'],
    displayNames: ['CSM 摊销比例'],
    chartType: 'line',
    period: '本期',
    annotation: 'CSM 摊销比例 = CSM摊销 / 摊销前CSM',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null
  },
  {
    id: 'chart9',
    subPage: 'key-report',
    title: 'CSM 持续率',
    tag: 'T04',
    indicators: ['D08/D07'],
    displayNames: ['CSM 持续率'],
    chartType: 'line',
    period: '本期',
    annotation: 'CSM 持续率 = 新业务CSM / CSM摊销',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null
  },
  {
    id: 'chart10',
    subPage: 'key-report',
    title: 'IFRS 9 金融资产分类',
    tag: 'T01',
    indicators: ['A02', 'A03', 'A01', 'A04'],
    displayNames: ['债权投资', '其他债券投资', '交易性金融资产', '其他权益工具投资'],
    chartType: 'stackedBar',
    period: '期末',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart11',
    subPage: 'key-report',
    title: '其他综合收益(OCI)',
    tag: 'T03',
    indicators: ['B18'],
    displayNames: ['其他综合收益(OCI)'],
    chartType: 'bar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart12',
    subPage: 'key-report',
    title: '其他综合收益(OCI)-资产负债匹配',
    tag: 'T03',
    indicators: ['B22', 'B20'],
    displayNames: ['可转损益的负债OCI', 'FVOCI债券公允价值'],
    chartType: 'groupedBar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },

  // ==================== 保险服务业绩 ====================
  {
    id: 'chart13',
    subPage: 'insurance-service',
    title: '保险服务收入/费用/业绩',
    tag: 'T03',
    indicators: ['B01', 'B12', 'B01+B12'],
    displayNames: ['保险服务收入', '保险服务费用', '保险服务业绩'],
    chartType: 'groupedBar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart14',
    subPage: 'insurance-service',
    title: '收入构成 — PAA vs Non-PAA',
    tag: 'T03',
    indicators: ['F05', 'F06'],
    displayNames: ['保险服务收入-非PAA', '保险服务收入-PAA'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart15',
    subPage: 'insurance-service',
    title: '非PAA合同组的收入构成',
    tag: 'T03',
    indicators: ['F01', 'F02', 'F03', 'F04'],
    displayNames: ['预期当期发生的保险服务费用', '非金融风险调整的变动', '合同服务边际的释放', '保险获取现金流量的摊销'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },

  // ==================== 投资服务业绩 ====================
  {
    id: 'chart16',
    subPage: 'investment-service',
    title: '投资服务业绩',
    tag: 'T03',
    indicators: ['B02+B03+B04+B05+B08+B09+B07+B10'],
    displayNames: ['投资服务业绩'],
    chartType: 'bar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart17',
    subPage: 'investment-service',
    title: '净投资回报',
    tag: 'T03',
    indicators: ['B02+B03+B04+B05+B08+B09+B07'],
    displayNames: ['净投资回报'],
    chartType: 'bar',
    period: '本期',
    annotation: '净投资回报 = 利息收入+投资收益+公允价值变动+汇兑损益+利息支出+其他资产减值+信用减值损失',
    unit: '亿元'
  },
  {
    id: 'chart18',
    subPage: 'investment-service',
    title: '承保财务净损益',
    tag: 'T03',
    indicators: ['B10'],
    displayNames: ['承保财务净损益'],
    chartType: 'bar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },

  // ==================== 利润分析 ====================
  {
    id: 'chart19',
    subPage: 'profit-analysis',
    title: '保险服务业绩和投资服务业绩',
    tag: 'T03',
    indicators: ['B01+B12', 'B02+B03+B04+B05+B08+B09+B07+B10'],
    displayNames: ['保险服务业绩', '投资服务业绩'],
    chartType: 'groupedBar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart20',
    subPage: 'profit-analysis',
    title: '费用分析',
    tag: 'T03',
    indicators: ['H01', 'H02', 'H03'],
    displayNames: ['获取费用', '维持费用', '非履约费用'],
    chartType: 'stackedBar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },

  // ==================== 新业务分析 ====================
  {
    id: 'chart21',
    subPage: 'new-business',
    title: '新业务 CSM',
    tag: 'T06',
    indicators: ['D08'],
    displayNames: ['新业务CSM'],
    chartType: 'bar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart22',
    subPage: 'new-business',
    title: '新业务 LC',
    tag: 'T06',
    indicators: ['E11'],
    displayNames: ['新业务 LC'],
    chartType: 'bar',
    period: '本期',
    annotation: '',
    unit: '亿元'
  },
  {
    id: 'chart23',
    subPage: 'new-business',
    title: '新业务IFRS 利润率',
    tag: 'T07',
    indicators: ['(D08-E11)/E01'],
    displayNames: ['新业务IFRS 利润率'],
    chartType: 'line',
    period: '本期',
    annotation: '新业务IFRS利润率 = (新业务CSM - 新业务LC) / 新业务合同未来现金流入现值',
    unit: '%',
    valueFormatter: v => v != null ? (v * 100).toFixed(2) : null
  }
];
