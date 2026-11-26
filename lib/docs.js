// 公文文种注册表：文种、适用场景、默认字数、表单字段、必备章节、模板骨架。
// 页面「写作台 · 公文起草」读这里生成文种目录和要素表单；导出 Word 时把 name 传给 generate_docx.py。

const f = (key, label, extra = {}) => ({ key, label, required: false, multiline: false, placeholder: '', ...extra })
const req = (key, label, extra = {}) => f(key, label, { required: true, ...extra })

export const DOC_TYPES = [
  {
    id: 'public-notice',
    name: '通告',
    category: '法定公文',
    description: '在一定范围内公布应当遵守或者周知的事项。',
    guidance: '开头写「为……，根据《……》，现就……通告如下」；正文分条列要求；结尾「特此通告」，落款写发文单位与日期。',
    sections: ['标题', '正文', '落款'],
    fields: [
      req('matter', '事项名称', { placeholder: '例如：规范园区网络使用' }),
      req('purpose', '发布目的与依据', { placeholder: '例如：为保障园区网络稳定，根据《网络安全法》' }),
      req('items', '应当遵守或周知的事项', { multiline: true, placeholder: '一条一段；写明适用区域、对象、行为和起止时间' }),
      f('scope', '适用区域与对象', { placeholder: '例如：园区全体入驻企业与访客' }),
      f('effective', '执行时间', { placeholder: '例如：自 2026 年 12 月 1 日起施行' }),
      f('responsible', '责任主体与处理依据', { multiline: true, placeholder: '写明谁来执行、违规如何处理、咨询方式' }),
      req('issuer', '发文单位', { placeholder: '例如：XX 园区管理委员会' }),
      f('date', '落款日期', { placeholder: '例如：2026 年 11 月 20 日' }),
    ],
    template: `# 关于[事项名称]的通告

## 正文

为[目的]，根据《[依据]》，现就[事项名称]通告如下：

一、[通告事项一]

[写明适用区域、对象、行为和起止时间。]

二、[通告事项二]

[写明具体要求和执行标准。]

三、执行要求

[写明责任主体、处理依据、咨询方式或生效时间。]

特此通告。

## 落款

[发文单位]

[日期]
`,
  },
  {
    id: 'circular',
    name: '通报',
    category: '法定公文',
    description: '用于表彰先进、批评错误或传达重要情况。',
    guidance: '主送单位后写「现将有关情况通报如下」；正文三段式：基本情况—评价分析—工作要求；落款写发文单位与日期。',
    sections: ['标题', '主送单位', '正文', '落款'],
    fields: [
      f('kind', '通报类型', { options: ['表彰先进', '批评错误', '传达情况'] }),
      req('matter', '事项名称', { placeholder: '例如：表扬 2026 年度安全生产工作先进单位' }),
      req('recipient', '主送单位', { placeholder: '例如：各部门、各下属单位' }),
      req('event', '事件经过与结果', { multiline: true, placeholder: '时间、对象、经过、结果；表彰写事迹，批评写事实与性质' }),
      f('evaluation', '评价或原因分析', { multiline: true, placeholder: '经验做法、警示意义或原因剖析' }),
      req('requirements', '工作要求', { multiline: true, placeholder: '学习推广、整改追责、防范措施、报送要求' }),
      req('issuer', '发文单位', { placeholder: '例如：XX 有限公司' }),
      f('date', '落款日期', { placeholder: '例如：2026 年 11 月 18 日' }),
    ],
    template: `# 关于[事项名称]的通报

## 主送单位

[主送单位]：

## 正文

近期，[事件或工作情况概述]。为[目的]，现将有关情况通报如下：

一、基本情况

[写明事件经过、对象范围、主要结果或典型事迹。]

二、评价分析

[写明性质影响、经验做法、原因分析或警示意义。]

三、工作要求

[写明学习推广、整改追责、防范措施和报送要求。]

## 落款

[发文单位]

[日期]
`,
  },
  {
    id: 'letter',
    name: '函',
    category: '法定公文',
    description: '用于平行机关或不相隶属机关之间商洽、询问、答复。',
    guidance: '主送单位后直入事项；一段商洽事项，一段配合事项与时限；结语用「特此函达／特此函商／特此函复」，落款写发函单位与日期。',
    sections: ['标题', '主送单位', '正文', '落款'],
    fields: [
      req('recipient', '主送单位', { placeholder: '例如：XX 区科学技术局' }),
      req('matter', '事项名称', { placeholder: '例如：商请协助提供行业数据' }),
      req('purpose', '商洽或询问的事项', { multiline: true, placeholder: '发函背景、目的、需要协商或答复的具体内容' }),
      req('ask', '需对方反馈、办理的内容与时限', { multiline: true, placeholder: '具体要求和时限，一条一段' }),
      f('issuer', '发函单位', { placeholder: '例如：XX 行业协会' }),
      f('date', '落款日期', { placeholder: '例如：2026 年 11 月 15 日' }),
    ],
    template: `# 关于[事项名称]的函

## 主送单位

[主送单位]：

## 正文

[说明发函背景、目的和需要协商或答复的事项。]

一、[主要意见]

[写明商洽意见、请求事项或答复内容。]

二、[配合事项]

[写明需要对方反馈、办理或协同的具体要求和时限。]

特此函达。

## 落款

[发函单位]

[日期]
`,
  },
  {
    id: 'minutes',
    name: '纪要',
    category: '法定公文',
    description: '用于记载会议主要情况和议定事项。',
    guidance: '文首集中列会议信息；正文以「会议」为主语，按「会议认为—会议指出—会议强调—会议决定」递进；议定事项逐条写结论、责任单位和时限。',
    sections: ['标题', '会议信息', '正文'],
    fields: [
      req('meeting_name', '会议名称', { placeholder: '例如：内容审核体系建设专题会议' }),
      req('matter', '事项名称', { placeholder: '用于标题，例如：内容审核体系建设' }),
      req('time', '会议时间', { placeholder: '例如：2026 年 11 月 10 日 14:00' }),
      f('place', '会议地点', { placeholder: '例如：公司三层第二会议室' }),
      f('host', '主持人', { placeholder: '姓名 + 职务' }),
      f('attendees', '出席人员', { placeholder: '姓名 + 职务，逗号分隔' }),
      f('participants', '参加／列席人员', { placeholder: '列席人员、记录人' }),
      req('agenda', '议题与汇报审议情况', { multiline: true, placeholder: '听取了什么汇报、审议了什么文件、讨论了哪些议题' }),
      req('decisions', '议定事项', { multiline: true, placeholder: '一条一段：决定了什么、谁负责、何时完成、成果形式' }),
      f('followup', '落实要求', { multiline: true, placeholder: '督办、反馈、保密、归档等要求' }),
    ],
    template: `# 关于[事项名称]的专题会议纪要

## 会议信息

会议名称：[会议名称]
时间：[时间]
地点：[地点]
主持人：[主持人]
出席：[出席人员]
参加：[参加人员]
记录：[记录人]

## 正文

[时间]，[主办单位]在[地点]召开[会议名称]。[主持人]主持会议，[领导]出席会议并讲话。[范围]参加会议。会议听取了[汇报事项]，研究了[议题]，审议了[文件]。

会议认为，[总体判断和一致意见]。

会议指出，[形势、成绩、问题或意义]。

会议强调，[需要重点重申的原则和要求]。

会议决定，[总体结论]。会议议定如下事项：

一、[议定事项一]

[写明办理主体、完成时限和成果形式。]

二、[议定事项二]

[写明办理主体、完成时限和成果形式。]

三、落实要求

[写明督办、反馈、保密、归档等要求。]

## 版记

抄送：[抄送单位]
印发：[印发机关]　[印发日期]
`,
  },
  {
    id: 'special-report',
    name: '情况专报',
    category: '常见正式材料',
    description: '用于向领导或上级报送专题信息、风险情况和舆情态势。',
    guidance: '开头一段交代起因、时间地点、涉及主体和总体态势；正文按「事项概况—最新进展—风险研判—工作建议」四段；研判与事实分开写。',
    sections: ['标题', '报送对象', '正文'],
    fields: [
      req('matter', '事项名称', { placeholder: '例如：某平台内容安全事件' }),
      req('recipient', '报送对象', { placeholder: '例如：公司领导同志' }),
      req('overview', '基本情况', { multiline: true, placeholder: '事件背景、涉及主体、时间地点、当前基本态势' }),
      req('progress', '最新进展（已核实）', { multiline: true, placeholder: '已核实的最新动态、已采取措施、当前结果' }),
      f('risk', '风险研判', { multiline: true, placeholder: '风险点、影响范围、趋势判断、触发条件' }),
      f('advice', '工作建议', { multiline: true, placeholder: '建议措施、责任主体、时限、需上级协调的事项' }),
      f('issuer', '报送单位', { placeholder: '例如：XX 公司安全管理部' }),
      f('date', '落款日期', { placeholder: '例如：2026 年 11 月 16 日' }),
    ],
    template: `# 关于[事项名称]的情况专报

## 报送对象

[领导同志]：

## 正文

[导语：交代事件起因、时间地点、涉及主体和当前总体态势。]

一、事项概况

[写明事件背景、涉及主体、时间地点和当前基本态势。]

二、最新进展

[写明已核实的最新动态、已采取措施和当前结果。]

三、风险研判

[写明主要风险点、影响范围、趋势判断和触发条件，与事实分开表述。]

四、工作建议

[写明建议采取的措施、责任主体、时限和需要上级协调的事项。]

## 落款

[报送单位]

[日期]
`,
  },
  {
    id: 'speech',
    name: '讲话稿',
    category: '常见正式材料',
    description: '用于领导讲话、会议发言、动员部署和总结点评。',
    guidance: '标题「在……上的讲话」；称谓顶格；正文按「形势判断—重点任务—工作要求」展开，每层讲清做什么、为什么、怎么做；结尾收束有力。',
    sections: ['标题', '称谓', '正文'],
    fields: [
      req('occasion', '会议名称与场合', { placeholder: '例如：2026 年度安全生产工作会议' }),
      req('speaker', '讲话人身份', { placeholder: '例如：公司总经理' }),
      f('audience', '听众对象', { placeholder: '例如：各部门负责人、安全员' }),
      req('theme', '讲话主题', { placeholder: '例如：把安全生产责任落到每一个岗位' }),
      req('points', '重点任务和要求', { multiline: true, placeholder: '一层一段：任务是什么、为什么、怎么做' }),
      f('materials', '需引用的政策、数据、事例', { multiline: true, placeholder: '政策依据、本单位数据、典型事例；没有就留空，不编造' }),
    ],
    template: `# 在[会议名称]上的讲话

## 称谓

各位领导、同志们：

## 正文

[开场：交代会议背景、讲话目的和总体评价。]

一、[形势判断/提高认识]

[分析当前形势、任务要求或存在问题。]

二、[重点任务]

（一）[任务一]

[讲清做什么、为什么、怎么做。]

（二）[任务二]

[讲清做什么、为什么、怎么做。]

三、[工作要求]

[讲清组织领导、责任落实、纪律作风等要求。]

[结束语：总结收束、发出号召。]
`,
  },
  {
    id: 'summary',
    name: '工作总结',
    category: '常见正式材料',
    description: '用于阶段性复盘、年度总结、专项工作总结。',
    guidance: '标题「单位＋时间范围＋事项＋工作总结」；正文五段：基本情况—主要做法—工作成效—存在问题—下一步打算；数据注明口径和时点。',
    sections: ['标题', '正文', '落款'],
    fields: [
      req('unit', '单位名称', { placeholder: '例如：XX 公司安全管理部' }),
      req('period', '时间范围', { placeholder: '例如：2026 年' }),
      req('matter', '工作事项', { placeholder: '例如：安全生产工作' }),
      f('basics', '基本情况', { multiline: true, placeholder: '工作背景、时间范围、总体目标、总体情况' }),
      req('practice', '主要做法', { multiline: true, placeholder: '一条一段：具体做法、推进方式、责任落实' }),
      req('results', '工作成效与数据口径', { multiline: true, placeholder: '主要成果、数据（注明口径和时点）、典型经验' }),
      f('problems', '存在问题', { multiline: true, placeholder: '短板不足、风险隐患、制约因素' }),
      f('next', '下一步打算', { multiline: true, placeholder: '下一阶段安排、改进措施、责任和时限' }),
      f('date', '落款日期', { placeholder: '例如：2026 年 12 月 20 日' }),
    ],
    template: `# [单位名称][时间范围][事项名称]工作总结

## 正文

一、基本情况

[写明工作背景、时间范围、总体目标和总体情况。]

二、主要做法

（一）[做法一]

[写明具体做法、推进方式和责任落实。]

（二）[做法二]

[写明具体做法。]

三、工作成效

[写明主要成果、数据和典型经验，数据注明口径和时点。]

四、存在问题

[写明短板不足、风险隐患或制约因素。]

五、下一步打算

[写明下一阶段工作安排、改进措施、责任和时限。]

## 落款

[单位名称]

[日期]
`,
  },
  {
    id: 'crisis-report',
    name: '危机处置报告',
    category: '常见正式材料',
    description: '发生安全事件、突发事件，或收到主管部门整改通知后，向相对方报告事实、经过与整改情况。',
    guidance: '两种骨架任选：①时间线（事件情况—处置经过—整改情况）；②问题线（事实—原因—影响—整改）。必写：事件主体与业务范围、发现或接报时间与来文、当前后果、处置结果。分节名按内容自己定，不要套用某一家的固定小节。',
    sections: ['标题', '主送单位', '正文', '落款'],
    fields: [
      req('event_subject', '事件主体', { placeholder: '报告单位全称' }),
      req('counterpart', '相对方', { placeholder: '主送单位，如主管部门、监管单位' }),
      req('event_name', '事件名称', { placeholder: '如：某系统异常访问事件' }),
      f('occurred_at', '发现／接报时间', { placeholder: '如：2026 年 X 月 X 日；不确定可留空' }),
      req('process', '主要经过', { multiline: true, placeholder: '按时间线填写：如何发现、涉及系统／人员、原因、影响、已采取处置' }),
      req('result', '处置结果', { multiline: true, placeholder: '事件是否控制、风险是否消除、有无数据／人员／财产损失、整改完成情况' }),
      f('rectification', '整改措施', { multiline: true, placeholder: '制度、技术、人员、监测、问责等；可留空由模型补写通用措施' }),
      f('report_date', '落款日期', { placeholder: '如：2026 年 X 月 X 日' }),
    ],
    template: `# 关于[事件名称]危机处置情况的报告

## 主送单位

[相对方]：

## 正文

[发现或接报时间]，[事件主体]收到[相对方]关于[事件名称]的[通知／通报／整改要求]（文号 [文号]，如有）。现将核查与处置情况报告如下：

一、事件情况

[事件主体]主要从事[业务范围]，涉及[相关系统、场所或人员范围]。经核查，[发生时间]，[事件类型、发现方式和影响范围]。截至[报告时点]，[后果表述]。

二、处置经过

[按时间线写清：怎么发现或接报、向谁报告、如何核查、原因是什么（未查清写「正在进一步核查」）、影响了什么、现场做了什么处置。需要分小节时按内容命名，不必套固定四段。]

三、整改情况

（一）处置结果

（二）整改措施

（三）下一步工作

特此报告。

## 落款

[事件主体]

[日期]
`,
  },
]

export const docTypeById = (id) => DOC_TYPES.find((d) => d.id === id) || null
export const docTypeByName = (name) => DOC_TYPES.find((d) => d.name === name || d.id === name) || null
