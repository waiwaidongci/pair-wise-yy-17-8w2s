module.exports = {
  port: 3912,
  title: '钟乳石洞穴微环境巡测',
  lede: '围绕洞穴、分区、样点和巡测路线记录微环境数据；讲解换班补测上下风段两层读数，温差超限或下层湿度下降即生成待调风闭环。',
  tones: {
    '常规观察': 'ok',
    '正常': 'ok',
    '已复查': 'ok',
    '已结束': 'ok',
    '重点保护': 'warn',
    '复测中': 'warn',
    '异常待复查': 'bad',
    '暂停开放': 'bad',
    '待调风': 'bad'
  },
  collections: {
    sites: { label: '样点档案' },
    surveys: { label: '巡测记录' },
    'shift-readings': { label: '换班分层读数' },
    'vent-adjusts': { label: '调风记录' }
  },
  stats: [
    { label: '样点', collection: 'sites' },
    { label: '分层读数', collection: 'shift-readings' },
    { label: '待调风', collection: 'vent-adjusts', filter: { field: 'status', value: '待调风' } },
    { label: '复测中', collection: 'vent-adjusts', filter: { field: 'status', value: '复测中' } }
  ],
  views: [
    {
      id: 'dashboard',
      label: '趋势看板',
      type: 'dashboard',
      focusTitle: '待调风与复测',
      focus: { collection: 'vent-adjusts', field: 'status', values: ['待调风', '复测中'], limit: 8 }
    },
    {
      id: 'vent-adjusts',
      label: '调风记录',
      collection: 'vent-adjusts',
      noForm: true,
      listTitle: '调风记录（自动建立，同一样点未结束前只累加次数）',
      searchPlaceholder: '搜索触发原因、巡测员、调风人、复测人',
      searchFields: ['trigger', 'surveyor', 'adjustBy', 'lastRecheckBy'],
      statusField: 'status',
      statusOptions: ['待调风', '复测中', '已结束'],
      titleFields: ['trigger'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      summaryFields: ['closeReason'],
      detailFields: [
        { label: '当前温差℃', name: 'currentTempDiff' },
        { label: '触发次数', name: 'count' },
        { label: '原巡测员', name: 'surveyor' },
        { label: '调风人', name: 'adjustBy' },
        { label: '最近复测人', name: 'lastRecheckBy' },
        { label: '复测到期', name: 'recheckDueAt', type: 'datetime' }
      ]
    },
    {
      id: 'shift-readings',
      label: '换班分层读数',
      collection: 'shift-readings',
      editable: true,
      formTitle: '登记分层读数',
      listTitle: '读数历史',
      submitLabel: '保存读数',
      searchPlaceholder: '搜索巡测员、风向、备注',
      searchFields: ['surveyor', 'windDirection', 'note'],
      statusField: 'layer',
      statusOptions: ['上风段', '下风段'],
      titleFields: ['surveyor', 'layer'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      summaryFields: ['note'],
      detailFields: [
        { label: '温度℃', name: 'temperature' },
        { label: '湿度%', name: 'humidity' },
        { label: '风向', name: 'windDirection' },
        { label: '离场时间', name: 'departAt', type: 'datetime' }
      ],
      fields: [
        { label: '样点', name: 'siteId', type: 'relation', collection: 'sites', labelFields: ['cave', 'zone', 'pointCode'], required: true, wide: true },
        { label: '巡测员', name: 'surveyor', required: true },
        { label: '层位', name: 'layer', type: 'select', options: ['上风段', '下风段'], required: true },
        { label: '风向', name: 'windDirection', type: 'select', options: ['洞外向内', '洞内向外', '无明显风向'] },
        { label: '离场时间', name: 'departAt', type: 'datetime-local', required: true },
        { label: '温度℃', name: 'temperature', type: 'number', required: true },
        { label: '湿度%', name: 'humidity', type: 'number', required: true },
        { label: '备注', name: 'note', type: 'textarea', wide: true }
      ]
    },
    {
      id: 'sites',
      label: '样点档案',
      collection: 'sites',
      editable: true,
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
        { label: '敏感等级', name: 'sensitivity' },
        { label: '温差限值℃', name: 'tempDiffLimit' },
        { label: '基准湿度%', name: 'baselineHumidity' }
      ],
      fields: [
        { label: '洞穴', name: 'cave', required: true },
        { label: '分区', name: 'zone', required: true },
        { label: '样点编号', name: 'pointCode', required: true },
        { label: '巡测路线', name: 'route', required: true },
        { label: '敏感等级', name: 'sensitivity', type: 'select', options: ['低', '中', '高'] },
        { label: '保护状态', name: 'protectedStatus', type: 'select', options: ['常规观察', '重点保护', '暂停开放'] },
        { label: '基准温度', name: 'baselineTemp', type: 'number', required: true },
        { label: '基准湿度', name: 'baselineHumidity', type: 'number', required: true },
        { label: '基准CO2', name: 'baselineCo2', type: 'number', required: true },
        { label: '温差限值℃', name: 'tempDiffLimit', type: 'number', required: true },
        { label: '备注', name: 'note', type: 'textarea', wide: true }
      ]
    },
    {
      id: 'surveys',
      label: '巡测记录',
      collection: 'surveys',
      formTitle: '登记巡测',
      listTitle: '巡测历史',
      submitLabel: '保存巡测',
      searchPlaceholder: '搜索人员、干扰痕迹、照片',
      searchFields: ['surveyor', 'disturbance', 'photoUrl'],
      statusField: 'status',
      statusOptions: ['正常', '异常待复查', '已复查'],
      titleFields: ['surveyor', 'date'],
      relation: { collection: 'sites', localKey: 'siteId', labelFields: ['cave', 'zone', 'pointCode'] },
      summaryFields: ['disturbance', 'reviewNote'],
      detailFields: [
        { label: '温度', name: 'temperature' },
        { label: '湿度', name: 'humidity' },
        { label: 'CO2', name: 'co2' }
      ],
      defaults: { status: '正常', reviewNote: '' },
      fields: [
        { label: '样点', name: 'siteId', type: 'relation', collection: 'sites', labelFields: ['cave', 'zone', 'pointCode'], required: true, wide: true },
        { label: '巡测人员', name: 'surveyor', required: true },
        { label: '日期', name: 'date', type: 'date', required: true },
        { label: '温度', name: 'temperature', type: 'number', required: true },
        { label: '湿度', name: 'humidity', type: 'number', required: true },
        { label: 'CO2', name: 'co2', type: 'number', required: true },
        { label: '滴水频率', name: 'dripRate', type: 'number', required: true },
        { label: '照片链接', name: 'photoUrl' },
        { label: '游客干扰痕迹', name: 'disturbance', type: 'textarea', wide: true }
      ]
    }
  ],
  actions: [
    { id: 'site-normal', label: '常规观察', collection: 'sites', patches: [{ field: 'protectedStatus', value: '常规观察' }] },
    { id: 'site-focus', label: '重点保护', collection: 'sites', patches: [{ field: 'protectedStatus', value: '重点保护' }] },
    { id: 'site-close', label: '暂停开放', collection: 'sites', danger: true, patches: [{ field: 'protectedStatus', value: '暂停开放' }] },
    {
      id: 'survey-alert',
      label: '标记异常',
      collection: 'surveys',
      relation: { collection: 'sites', localKey: 'siteId' },
      patches: [
        { field: 'status', value: '异常待复查' },
        { target: 'related', field: 'protectedStatus', value: '重点保护' }
      ]
    },
    { id: 'survey-review', label: '完成复查', collection: 'surveys', patches: [{ field: 'status', value: '已复查' }, { field: 'reviewNote', value: '异常已复核' }] },
    {
      id: 'vent-adjust',
      label: '登记调风',
      collection: 'vent-adjusts',
      endpoint: '/api/vent-adjusts/{id}/adjust',
      visibleWhen: { field: 'status', values: ['待调风'] },
      prompts: [
        { name: 'adjustBy', label: '调风人', required: true }
      ]
    },
    {
      id: 'vent-recheck',
      label: '复测',
      collection: 'vent-adjusts',
      endpoint: '/api/vent-adjusts/{id}/recheck',
      visibleWhen: { field: 'status', values: ['复测中'] },
      prompts: [
        { name: 'recheckBy', label: '复测人（须为另一位巡测员）', required: true },
        { name: 'upperTemp', label: '上风段温度℃', type: 'number', required: true },
        { name: 'upperHumidity', label: '上风段湿度%', type: 'number', required: true },
        { name: 'lowerTemp', label: '下风段温度℃', type: 'number', required: true },
        { name: 'lowerHumidity', label: '下风段湿度%', type: 'number', required: true }
      ]
    }
  ]
};
