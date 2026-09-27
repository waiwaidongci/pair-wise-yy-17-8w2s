module.exports = {
  port: 3912,
  title: '钟乳石洞穴微环境巡测',
  lede: '巡测登记上下两层温湿度、风向与离场时间；温差超样点限值或下层湿度下降即建立待调风记录，调风30分钟后由另一位巡测员复测，两层恢复方可结束。',
  tones: {
    '常规观察': 'ok',
    '正常': 'ok',
    '已复查': 'ok',
    '复测': 'warn',
    '已结束': 'ok',
    '重点保护': 'warn',
    '待复测': 'warn',
    '异常': 'bad',
    '异常待复查': 'bad',
    '待调风': 'bad',
    '暂停开放': 'bad'
  },
  collections: {
    sites: { label: '样点档案' },
    surveys: { label: '巡测记录' },
    windRecords: { label: '待调风记录', readonly: true }
  },
  stats: [
    { label: '样点', collection: 'sites' },
    { label: '巡测记录', collection: 'surveys' },
    { label: '待调风', collection: 'windRecords', filter: { field: 'status', value: '待调风' } },
    { label: '待复测', collection: 'windRecords', filter: { field: 'status', value: '待复测' } }
  ],
  views: [
    {
      id: 'dashboard',
      label: '趋势看板',
      type: 'dashboard',
      focusTitle: '待调风与复测',
      board: { kind: 'windBoard', title: '当前风况（两层温差 / 最近复测人）' },
      focus: { collection: 'windRecords', field: 'status', values: ['待调风', '待复测'], limit: 8 }
    },
    {
      id: 'sites',
      label: '样点档案',
      collection: 'sites',
      formTitle: '新增样点',
      listTitle: '样点列表',
      submitLabel: '保存样点',
      searchPlaceholder: '搜索洞穴、分区、样点、路线',
      searchFields: ['cave', 'zone', 'pointCode', 'route'],
      statusField: 'protectedStatus',
      statusOptions: ['常规观察', '重点保护', '暂停开放'],
      titleFields: ['pointCode', 'zone'],
      summaryFields: ['note'],
      detailFields: [
        { label: '洞穴', name: 'cave' },
        { label: '巡测路线', name: 'route' },
        { label: '温差限值(℃)', name: 'tempDiffLimit' },
        { label: '基准湿度(%)', name: 'baselineHumidity' },
        { label: '敏感等级', name: 'sensitivity' }
      ],
      fields: [
        { label: '洞穴', name: 'cave', required: true },
        { label: '分区', name: 'zone', required: true },
        { label: '样点编号', name: 'pointCode', required: true },
        { label: '巡测路线', name: 'route', required: true },
        { label: '敏感等级', name: 'sensitivity', type: 'select', options: ['低', '中', '高'] },
        { label: '保护状态', name: 'protectedStatus', type: 'select', options: ['常规观察', '重点保护', '暂停开放'] },
        { label: '基准温度', name: 'baselineTemp', type: 'number', required: true },
        { label: '基准湿度(%)', name: 'baselineHumidity', type: 'number', required: true },
        { label: '温差限值(℃)', name: 'tempDiffLimit', type: 'number', required: true },
        { label: '基准CO2', name: 'baselineCo2', type: 'number', required: true },
        { label: '备注', name: 'note', type: 'textarea', wide: true }
      ]
    },
    {
      id: 'surveys',
      label: '巡测记录',
      collection: 'surveys',
      formTitle: '登记巡测（两层读数）',
      listTitle: '巡测历史',
      submitLabel: '保存巡测',
      searchPlaceholder: '搜索人员、风向、层位、干扰痕迹',
      searchFields: ['surveyor', 'windDirection', 'layerPosition', 'disturbance'],
      statusField: 'status',
      statusOptions: ['正常', '异常', '复测'],
      titleFields: ['surveyor', 'date'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      summaryFields: ['windDirection', 'layerPosition', 'disturbance'],
      detailFields: [
        { label: '上层(上风段)温度', name: 'upperTemp' },
        { label: '下层(下风段)温度', name: 'lowerTemp' },
        { label: '两层温差(℃)', name: 'tempDiff' },
        { label: '上层湿度(%)', name: 'upperHumidity' },
        { label: '下层湿度(%)', name: 'lowerHumidity' },
        { label: '风向', name: 'windDirection' },
        { label: '离场时间', name: 'leaveAt', type: 'datetime' }
      ],
      defaults: { status: '正常' },
      fields: [
        { label: '样点', name: 'siteId', type: 'relation', collection: 'sites', labelFields: ['cave', 'zone', 'pointCode'], required: true, wide: true },
        { label: '巡测人员', name: 'surveyor', required: true },
        { label: '日期', name: 'date', type: 'date', required: true },
        { label: '风向', name: 'windDirection', type: 'select', options: ['东风', '西风', '南风', '北风', '东南风', '东北风', '西南风', '西北风', '不定向', '无风'] },
        { label: '测点层位', name: 'layerPosition', placeholder: '如：上层步道 / 下层观景台' },
        { label: '上层(上风段)温度', name: 'upperTemp', type: 'number', required: true },
        { label: '下层(下风段)温度', name: 'lowerTemp', type: 'number', required: true },
        { label: '上层湿度(%)', name: 'upperHumidity', type: 'number', required: true },
        { label: '下层湿度(%)', name: 'lowerHumidity', type: 'number', required: true },
        { label: '离场时间', name: 'leaveAt', type: 'datetime-local' },
        { label: 'CO2', name: 'co2', type: 'number', required: true },
        { label: '滴水频率', name: 'dripRate', type: 'number', required: true },
        { label: '照片链接', name: 'photoUrl', wide: true },
        { label: '游客干扰痕迹', name: 'disturbance', type: 'textarea', wide: true }
      ]
    },
    {
      id: 'windRecords',
      label: '待调风记录',
      collection: 'windRecords',
      card: 'windRecord',
      hideForm: true,
      listTitle: '待调风记录（由异常巡测自动建立）',
      searchPlaceholder: '搜索样点、原巡测员、复测人',
      searchFields: ['surveyor', 'lastRecheckSurveyor', 'adjustNote'],
      statusField: 'status',
      statusOptions: ['待调风', '待复测', '已结束'],
      titleFields: ['surveyor'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      fields: []
    }
  ],
  actions: [
    { id: 'site-normal', label: '常规观察', collection: 'sites', patches: [{ field: 'protectedStatus', value: '常规观察' }] },
    { id: 'site-focus', label: '重点保护', collection: 'sites', patches: [{ field: 'protectedStatus', value: '重点保护' }] },
    { id: 'site-close', label: '暂停开放', collection: 'sites', danger: true, patches: [{ field: 'protectedStatus', value: '暂停开放' }] },
    { id: 'wind-adjust', label: '完成调风', collection: 'windRecords', kind: 'windAdjust' },
    { id: 'wind-recheck', label: '登记复测', collection: 'windRecords', kind: 'windRecheck' }
  ]
};
