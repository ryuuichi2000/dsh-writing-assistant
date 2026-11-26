// 写作助手 · 任务说明（prompt）构造
// 页面只做「把填的单子拼成一段清楚的任务描述」，具体怎么写由 skill 决定。
// 每段都带上「存稿 + 机检 + 5 行内回复」的交付要求：后台任务没有人在旁边追问，必须一次到位。
;(function () {
  const trim = (s) => String(s ?? '').trim()
  const MATERIAL_LIMIT = 60000

  // 和 lib/analysis.js 保持同一口径（浏览器端只做轻量判断，真正的检查在 Host）
  function analysisMeta(title = '') {
    const raw = trim(title)
    const t = raw
    const future = /20\d{2}\s*年|明年|下一年|未来/.test(t)
    const predict = /预测|展望|走势|趋势|判断|会(不会|怎样|如何)?|将(会)?|能到|达到|突破|增长到|规模|增量|从哪里来/.test(t)
    const retro = /复盘|回顾|过去|已经|历史|为何|为什么|原因|机制|是否|是不是|争议|比较|对比|利弊|怎样|如何/.test(t)
    let mode = 'analysis'
    if (future && predict && !retro) mode = 'prediction'
    else if (/是否|是不是|该不该|争议|不务正业|对错|利弊|值不值/.test(t)) mode = 'dispute'
    else if (/怎样|如何|为什么|为何|机制|吸引|增长|从哪里来|靠什么|凭什么/.test(t)) mode = 'mechanism'
    // 和 lib/analysis.js 的 titleAndBrief 保持同一口径：「用《某作》的材料说清楚」是委托，不是标题
    const usesMaterial = /用\s*[《「][^》」]{1,30}[》」][^。\n]{0,12}(材料|玩法|案例|数据)/.test(raw)
    const endsAsInstruction = /(说清楚|讲清楚|说清|讲清)[。！？!?]?$/.test(raw)
    const brief = /自拟题目|题目自拟|写一篇|请写|要求|分\s*[2-9]\s*[-—~至]\s*[2-9]\s*点|分\s*[2-9]\s*点|从.{2,24}(出发|角度|切入)|结合|围绕|需要.{0,8}(数据|佐证|证据)/.test(raw) || raw.length > 34 || usesMaterial || endsAsInstruction
    const range = raw.match(/分\s*([2-9])\s*[-—~至]\s*([2-9])\s*点/)
    const single = raw.match(/(?:分|写)\s*([2-9])\s*点/)
    return {
      mode,
      titleMode: brief ? 'brief' : 'given',
      points: range ? [Number(range[1]), Number(range[2])] : single ? [Number(single[1]), Number(single[1])] : null,
      angles: ['品类', '消费', '行业', '用户', '收入', '出海', '政策', '公司', 'IP', '女性'].filter((x) => raw.includes(x)),
      needsData: /数据|佐证|证据|来源|口径/.test(raw),
    }
  }

  const ANALYSIS_RULES = [
    '【写法 · 文章写作】',
    '- 先加载 skill research-writing，读 references/analysis-playbook.md（唯一规则正文）。',
    '- 写正文或大幅重写前读 references/wechat-analysis/drafting.md：以真实材料开稿，让对象和动作先出现，每段增加一项读者需要的信息；例子只支持它实际说明的范围。',
    '- 拿到草稿、只润色或交稿前读 references/wechat-analysis/editing.md：先改判断再改句子，只改有具体问题的地方，改完对原稿和来源保真回读。',
    '- 用户原话完整保留。先拆任务：核心问题、对象/地域/时间、期望判断数、要覆盖的角度、证据要求、标题归属。',
    '- 如果用户已经给出完整标题：原样使用，不改写、不加副标题。如果用户给的是委托：自拟标题，点明对象、时间和要回答的问题；不强制短句/转折/问句。',
    '- 结构服从题目：写 2—3 个有根据的判断即可，不为凑节数硬加；不做“现状—问题—建议”模板，不强制每节同形。',
    '- 先写提纲：主线 + 每节判断/问题 + 证据 + 预测稿的基线与成立条件；调用 writing_save_outline，通过后再写正文。',
    '- 语义检查处理“这个论证成不成立”；程序只做口径、算术和证据边界。',
  ]

  // 研究型写作：三种文体的写法要求（分析型对齐作者本人的公众号写法）
  function materialsBlock(text) {
    const body = trim(text)
    if (!body) return '（没有上传材料：请自己检索公开资料，并把每条来源落进 sources.md）'
    const cut = body.length > MATERIAL_LIMIT ? `${body.slice(0, MATERIAL_LIMIT)}\n\n……（材料过长，已截断，完整内容见用户上传的原文件）` : body
    return `"""\n${cut}\n"""`
  }

  // 材料清单：每份多少字、哪些超上限没全文送进来
  function materialList(files) {
    const list = Array.isArray(files) ? files.filter((x) => x && x.name) : []
    if (!list.length) return ''
    let used = 0
    const rows = list.map((f) => {
      const keep = Math.max(0, Math.min(Number(f.chars) || 0, MATERIAL_LIMIT - used))
      used += keep
      const omitted = (Number(f.chars) || 0) - keep
      return `- ${f.name}：${f.chars} 字${omitted ? `（本次只采用前 ${keep} 字，省略 ${omitted} 字）` : '（全部采用）'}`
    })
    return `\n材料清单：\n${rows.join('\n')}`
  }

  // 研究型写作：三种文体的写法要求（分析型对齐作者本人的公众号写法）
  const ARTICLE_STYLE = {
    analysis: ANALYSIS_RULES,
    essay: [
      '【写法 · 随笔】',
      '- 先加载 skill research-writing，读 references/quality-gate.md。',
      '- 第一人称，写一件具体的事或一段真实感受，不要写成议论文。',
      '- 800—2000 字；允许慢节奏、允许留白，最多 2—3 个小节，也可以不分节。',
      '- 细节代替评论：写看到什么、听到什么、当时怎么想；少下结论。',
      '- 结尾不要升华成道理，停在一个具体的画面或一句话上。',
    ],
    research: [
      '【写法 · 深度研究型文章（面向大众）】',
      '- 加载 skill research-writing，按 references/deep-research.md 的现有规范写作，并按其中指引读取 references/deep-research-methods.md。按题目选择研究角度，核对关键变化与同期可比对象，再用已有证据解释当前差异。',
      '- 语言要严谨：判断词分级（已确认 / 据…显示 / 公开信息无法确认）；不用「必然」「毫无疑问」「极大地」这类词代替证据；作者不出场，不写「我认为」「在我看来」。',
      '- 排版要精确：标题层级只用 `##` / `###`；编号连续；表格列对齐、数据完整；日期统一「YYYY 年 M 月 D 日」；数字与单位之间空格统一；不靠加粗堆重点。',
      '- 不用比喻：不写「像 / 如同 / 无异于 / 好比」这类句式，也不要用比喻解释概念；材料自己带比喻时用引号引原话并注明出处。',
      '- 结构：`# 标题` 紧跟一段摘要（核心内容 3—5 条 + 下文从哪几方面展开，摘要里不展开分析、不罗列判断），然后主体，再结论——只写材料支持的结论，分「已确认 / 只有单一来源 / 公开信息无法确认」三档。',
      '- 主体从五种骨架（条文型 / 事件型 / 案例型 / 对比型 / 问题拆解型）里选最接近的当骨架，但**不要照搬**：章节按内容自己命名，可跨骨架组合，没价值的删、缺的加。',
      '- 不擅自推论、不做未来展望、不提行动建议：只基于搜集到的材料做分析和研究；材料本身提到建议时转述并注明是谁提的。',
      '- 信源按规范来：一手优先（政府 / 法院 / 公告 / 年报 / 招股书 / 统计 / 裁判文书 / 一手访谈），关键事实至少两个独立来源、其中至少一个一手；法规类引到原文条款，条款编号不能错；每条引用优先官方 URL，二手不能当原文；查不到写〔待核：…〕。',
      '- 篇幅以本任务单为准；每个核心结论至少一条直接证据；允许写「没有答案的部分」；图表只在真帮助理解时用，用了就校验格式。',
      '- 写完后必须做两件事：四维自查（信源 / 逻辑 / 一致性 / 边界），以及对抗式审查（逐条反问最重的三条结论，看材料够不够、有没有反例）。',
      '- 这个文体的风格语料还在补充中：按上面这套写，交付时说明「深度研究型文体的风格样本尚未到位」。',
    ],
  }

  function article(f = {}) {
    const hasMaterials = trim(f.materials).length > 0
    const supplement = f.supplement !== false
    const isResearch = f.kindId === 'research'
    const mode = hasMaterials
      ? supplement
        ? '用户提供材料 + 自行检索补充'
        : '只用用户提供的材料（不额外检索）'
      : supplement
        ? '自己检索公开资料'
        : isResearch
          ? '没有材料，且关闭检索（说明资料缺口，只列待核问题，不写未经查证的事实结论）'
          : '没有材料，也不检索（只按题目写通用判断，具体数字一律留待核）'
    const voice = trim(f.voice)
    const style = ARTICLE_STYLE[f.kindId] || ARTICLE_STYLE.analysis
    const meta = analysisMeta(f.title)
    const constraints = []
    if (meta.points) constraints.push(`用户要求的判断数：${meta.points[0] === meta.points[1] ? `${meta.points[0]} 点` : `${meta.points[0]}–${meta.points[1]} 点（够用即可，不要为凑数硬加）`}`)
    if (meta.angles.length) constraints.push(`用户点到的角度：${meta.angles.join('、')}`)
    if (meta.needsData) constraints.push('用户要求数据/证据支撑')
    const taskMeta = [
      `任务类型：${meta.mode}${meta.mode === 'prediction' ? '（只因为用户要求判断未来；不是所有带年份的题都算）' : ''}`,
      `标题归属：${meta.titleMode === 'given' ? '用户已经给了完整标题——原样使用，不改写、不加副标题' : '用户给的是委托——自拟标题，点明对象、时间和要回答的问题'}`,
      `用户约束：${constraints.length ? constraints.join('；') : '没有额外结构要求，按题目本身决定'}`,
    ]
    const modeNote = meta.mode === 'prediction'
      ? [
          '【预测稿附加规则】',
          '- 每一节先回答一个关于目标时期的判断或可检验问题，再给基线、机制/证据和成立条件；不要前两节只解释历史、把预测全压在末节。',
          '- 出海只在能说明国内供给或企业选择时出现，并写清中间关系；行业发展不限于海外经营。',
          '- 没有概率依据就不写「大概率/必然/有望」；区间算术要写基数、增速和端点。',
          '- 预测稿可以全篇零比喻，不要求人物或场景；不要为“完整”硬加未来展望以外的段落。',
        ]
      : meta.mode === 'mechanism'
        ? ['【机制题附加规则】', '- 重点解释因果、参与者和约束；用具体动作或产品选择说明机制；不做未来展望，不硬加预测段。']
        : meta.mode === 'dispute'
          ? ['【争议题附加规则】', '- 两边最强论据都要有来源，再给有条件判断；不靠反问句或“不务正业”这类标签代替论证。']
          : []
    const length = Math.max(isResearch ? 2000 : 800, Math.min(12000, Math.trunc(Number(f.length)) || (isResearch ? 3000 : 1500)))
    // 篇幅是硬约束，不是参考值：给模型一个可执行区间，存稿时 Host 也按同一口径校验
    const lengthMin = Math.max(isResearch ? 2000 : 0, Math.round(length * 0.9))
    const lengthMax = Math.round(length * 1.1)
    const numbered = isResearch && f.citation === 'numbered'
    const cite = isResearch
      ? numbered
        ? [
            '【引用规范（硬要求）】',
            '本次约定：全篇用编号。正文用 [1]、[2]… 标注（编号紧跟在事实后，不加括号说明），文末「## 参考资料」逐条对应。',
            '- 编号从 [1] 连续编，不许跳号、不许有编号没条目；条目写清名称、发布者（能确定时）、日期、链接（有就给）。',
            '- 编号只标在需要出处的独家数据、直接引语、具体结论上；公共常识不编号，避免满篇数字。',
            '- 一处编号后面不要塞两家以上的数据；相邻两段不连续挂编号。',
            '- 信源必须可靠：一手优先，关键事实两个独立来源；二手不能当原文；查不到写〔待核：…〕，不用确定语气。',
          ]
        : [
            '【引用规范（硬要求）】',
            '本次约定：全篇用行内归属，不在正文挂编号。',
            '- 出处写进句子：据《XX》报道 / 据 XX 统计 / XX 数据显示 / 据 XX 估算。',
            '- 关键事实两个独立来源；二手不能当原文；查不到写〔待核：…〕，不用确定语气。',
            '- 文末固定加 `## 参考资料`，逐条列全部来源：报告或媒体名 + 文章名 + 日期 + 能查到的链接。',
          ]
      : [
          '【引用规范（硬要求）】',
          '- 分两类，别一视同仁：',
          '  ① 广为人知、公开可查的事实——事件年份、产品归属、行业惯例、法规名称、"第一款/最早"这类常识——不标出处，直接写。例：「1994 年，《安琪莉可》是第一款乙女游戏。」',
          '  ② 独家或需要口径的数据——某家媒体统计的榜单收入、某机构的调研数字、公司财报里的单项、内部人士的说法——必须写清谁统计的、什么时候、统计口径。例：「游戏新知统计了 2025 年进入 iOS 畅销榜 TOP600 的 24 款产品：全年合计约 27.31 亿元。」',
          '- 引用密度按论证需要定，不设「一段最多一处」的配额：一处引用里不要塞两家以上的数据；连着两句都以「据 X 报道」开头，就把后一句改成你自己的分析。数据必须和它支撑的判断待在同一段，不要为了“均匀”把它挪到无关段落。',
          '- 引用是论据，不是骨架：能靠常识说清的，不引。',
          '- 正文不要出现 [1]、①、（数据来源：…）这类编号或括号；出处写在句子里（据 XX 统计 / XX 数据显示 / 据 XX 估算）。',
          '- 文末固定加 `## 参考资料`，逐条列全部来源：报告或媒体名 + 文章名 + 日期 + 能查到的链接。',
          '- 数字、日期、引文都要能回到来源；查不到就写〔待核：…〕或删掉这句，不编。',
        ]
    return [
      '【写作台 · 任务单】',
      `题目 / 描述：${trim(f.title) || '（未填）'}`,
      ...(isResearch ? taskMeta.slice(1) : taskMeta),
      `写作模式：${mode}`,
      materialList(f.materialFiles) || '',
      `检索补充：${supplement ? (isResearch ? '要（从关键问题出发，优先找原始资料，按证据缺口交叉核对）' : '要（官方文件、行业媒体、研究机构、一线产品各查一轮）') : '不要'}`,
      `文体：${trim(f.kindName) || '文章写作'}${trim(f.kindHint) ? `（${f.kindHint}）` : ''}`,
      `目标读者：${trim(f.audience) || '未指定，按常识读者处理'}`,
      `篇幅：约 ${length} 字（按正文汉字与西文词计，标点、空格、Markdown 标记、链接地址和文末「参考资料」不计；成稿须落在 ${lengthMin}–${lengthMax} 字）`,
      voice
        ? `语气档案：${voice}。后台已附档案正文时直接用该版本；若是手动提交本任务单，明确传 profile=${JSON.stringify(voice)} 调用 writing_voice show。档案只用于表达，事实、文体和当场要求优先。`
        : '语气档案：本次不用，按文体和事实要求写。不要读取默认档案。',
      isResearch ? `引用格式：${numbered ? '编号＋文末参考资料' : '行内归属＋文末参考资料'}` : '',
      '',
      ...style,
      ...(isResearch ? [] : modeNote),
      '',
      ...cite,
      '',
      '【交付前必须自检（不是建议）】',
      '1. 按 references/quality-gate.md 过一遍：事实核对 + 去 AI 味。',
      '2. 删掉空泛套话和没有具体所指的词。不要硬凑三段式，不要在每段沿用同一个开头。档案记录的说法在适合语境时按原频率使用。',
      isResearch
        ? '3. 材料红线：全文至少有一份可核对的原始材料（原文、公告、判决、统计表），不能只有转述；结论不许出现推论、预测、展望、建议。'
        : '3. 判断红线：每个主体判断都要能回答“证据支持到什么强度”。单期数据不推跨期，人均贡献不推单价，区间算术不推概率；预测节必须有基线和成立条件。用户只要求两点时，不硬凑第三节。',
      isResearch
        ? '4. 比喻红线：一处也不要有（包括用来解释概念的比喻）；材料自带的比喻要引原文并注明出处。'
        : '4. 文风红线：不设“必须有一个人物/场景”“必须有 2—3 个比喻”的配额；有实际机制支撑的比喻可以保留，没有就零比喻。标题、导语、各节判断、结论要回答同一个问题。',
      isResearch
        ? '5. 检查引用：编号与「## 参考资料」一一对应（或全篇行内归属）；没有孤编号；排版精确（层级、编号连续、表格列对齐、日期格式统一）。'
        : '5. 引用与台账：正文不挂编号，出处写进句子；台账区分「来源 / 口径 / 本文推算 / 待核」。作者推算写“按……推算”，不能写成“据……显示”。直接引语逐字保留；改顺句子时，统计期间、范围、限定条件和判断强度不能漂移。',
      isResearch
        ? '6. 写完用 writing_save_work 存进稿库'
        : '6. 先调 writing_save_outline 交提纲，通过后再写正文；写完用 writing_save_work 存稿。保存后读 review/warnings：error 要改，剩余缺口写“草稿已保存，需核对”。',
      isResearch
        ? '7. 最后 5 行内说明：标题、稿件 id、字数、哪些是假设、哪些还标着待核。'
        : '7. 最后 5 行内说明：标题、稿件 id、字数、哪些是推算/待核、审校状态。',
      `8. 字数自检：成稿须落在 ${lengthMin}–${lengthMax} 字，过短补足证据和分析，过长删减重复内容。`,
      '',
      '【材料】',
      materialsBlock(f.materials),
    ].join('\n')
  }

  // 公文起草 · 模板起草
  function officialTemplate(f = {}) {
    const isSpeech = f.docType === 'speech' || /讲话|发言/.test(String(f.docTypeName || ''))
    const filled = (f.fields || [])
      .filter((x) => trim(x.value))
      .map((x) => `${x.label}：${trim(x.value)}`)
    const empty = (f.fields || []).filter((x) => x.required && !trim(x.value)).map((x) => x.label)
    const length = Math.max(300, Math.min(5000, Number(f.length) || 800))
    const template = String(f.templateText || '').trim()
    return [
      '【公文起草 · 文种起草】',
      `文种：${trim(f.docTypeName)}（${trim(f.docType)}，${trim(f.category)}）`,
      `适用：${trim(f.description)}`,
      `撰写要点：${trim(f.guidance)}`,
      `篇幅：约 ${length} 字`,
      '',
      '【用户填的要素】',
      filled.length ? filled.join('\n') : '（没有填任何要素：按文种模板出具结构完整的初稿，全部具体信息留占位符）',
      empty.length ? `\n必填但没填：${empty.join('、')}（这些留占位符，不要猜）` : '',
      '',
      ...(template
        ? [
            '【参考模板】',
            `文件：${trim(f.templateName) || '（用户导入的模板）'}。按它的章节顺序、条目层级和行文口径写；只借结构，不照抄原文内容。若模板结构与文种规范冲突，以 GB/T 9704-2012 和该文种规则为准。${template.length > 8000 ? '（模板较长，这里只取前 8000 字）' : ''}`,
            '"""',
            template.slice(0, 8000),
            '"""',
            '',
          ]
        : []),
      '【语言】',
      isSpeech
        ? '讲话稿：以书面语为主，允许极少量口语色彩（引述、比喻、现场提醒），全篇不超过三处；网络词、俚语、第二人称劝阻一律不用。'
        : '正式书面语，全篇零口语：不用网络词、俚语、反问感叹、第二人称劝阻，不用“使劲／搞定／踩坑／翻车／说白了／一句话”这类口语词。',
      '小标题：动宾并列双句（“坚持……，把……放在首位”），句式对齐，6—20 字；不带冒号引出解释、不设问、不喊口号、不用口语动词。',
      '写完把每条小标题和每个句子单独念一遍：像在会上讲话是合格的，像在聊天就重写。',
      '',
      '【硬要求】',
      '1. 先加载 skill：official-document-drafting，读 references/rules.md 和 references/doc-types/ 里对应文种的参考，按它的「起草前确认—撰写思路—写作规则—模板」写。',
      '2. 只用上面给的事实。缺的人名、单位、时间、数字、文号、政策依据一律留 [占位符] 或写「待核实」，不编造，不用其他文种的结构硬套。',
      '3. 写完用 writing_save_work 存进稿库：kind 传 "official"，docType 传文种 id，docTypeName 传中文文种名，fields 传上面这些要素的 JSON，draft 传整篇 Markdown。',
      '4. 再调 writing_check（传稿件 id）跑机检；有 errors 就补齐后重新保存，warnings 自己判断并在回复里说明取舍。',
      '5. 最后 5 行内说明：标题、稿件 id、字数、还有哪些占位待填。',
    ]
      .filter((l) => l !== null)
      .join('\n')
  }

  // 公文起草 · 自定义提示词（开放式）
  function officialFree(f = {}) {
    const template = String(f.templateText || '').trim()
    const ref = !template && trim(f.docTypeName)
      ? `参考文种：${f.docTypeName}（${trim(f.refDocType)}），按该文种的格式起草。`
      : '根据用途、材料和参考模板（如有）判断最合适的文种。'
    return [
      '【公文起草 · 自定义提示词】',
      trim(f.prompt) || '依据补充材料判断用途并起草一份公文。',
      '',
      `篇幅：约 ${Math.max(300, Math.min(5000, Number(f.length) || 800))} 字`,
      ref,
      trim(f.notes) ? `补充材料：\n${materialsBlock(f.notes)}` : '',
      ...(template
        ? [
            '',
            '【参考模板】',
            `文件：${trim(f.templateName) || '（用户导入的模板）'}。采用它的章节顺序、条目层级和行文格式，正文事实以本次需求与材料为准。`,
            '"""',
            template.slice(0, 8000),
            '"""',
          ]
        : []),
      '',
      '【语言】',
      '正式书面语，全篇零口语（若判断为讲话稿，允许极少量口语色彩，全篇不超过三处）。小标题写成动宾并列双句，不带冒号、不设问、不喊口号。',
      '',
      '【硬要求】',
      '1. 先加载 skill：official-document-drafting，按 references/rules.md 的事实边界和行文规则写。有参考时按选中的参考格式起草，未选参考时按用途和材料确定文种，遵循该文种的排版、字体和行文规范。',
      '2. 不编造人名、数字、日期、文号、政策依据；信息不足留 [占位符] 或写「待核实」。',
      '3. 写完用 writing_save_work 存进稿库：kind 传 "official"，docType 和 docTypeName 分别传所用文种的 id 和中文名，draft 传整篇 Markdown。',
      '4. 再调 writing_check 机检；有 errors 补齐后重新保存。',
      '5. 最后 5 行内说明：选了哪个文种、标题、稿件 id、字数、哪些地方是假设。',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // 改稿：只改一块
  function reviseBlock(f = {}) {
    return [
      '【改稿 · 只改选中的这一块】',
      `稿件：${trim(f.title)}（${trim(f.id)}）`,
      `块：${trim(f.blockId)}（hash ${trim(f.hash)}，类型 ${trim(f.type)}${f.section ? `，在「${f.section}」下` : ''}）`,
      '',
      '这一块现在的原文：',
      '"""',
      String(f.blockText || '').trim(),
      '"""',
      '',
      `用户的要求：${trim(f.instruction) || '润色这一段，保持原意和事实不变'}`,
      '',
      '【硬要求】',
      '1. 先调 writing_read_work（传 id）确认这一块现在的 id 和哈希；预览可能是旧的，哈希对不上就先停下来说明。',
      '2. 只改这一块，用 writing_suggest_block 提交建议（blockId 传这一块，text 传整块新原文，reason 传一句改法说明）。不要用 writing_patch_blocks 直接写正文——用户要先看到原句和新句再决定采用。',
      '3. 选区外一个字都不动。需要相邻改动时，在回复里列成建议，不要顺手改。',
      '4. 事实、数字、引文、占位符保持原样，除非用户明确要求改。',
      '5. 回复一句话：改了哪块、改了什么。',
    ].join('\n')
  }

  // 改稿：整篇
  function reviseWork(f = {}) {
    return [
      '【改稿 · 整篇】',
      `稿件：${trim(f.title)}（${trim(f.id)}，${f.chars || 0} 字）`,
      `用户的要求：${trim(f.instruction)}`,
      '',
      '【硬要求】',
      '1. 先调 writing_read_work（传 id）读全文和分块清单。',
      '2. 只按用户的要求改：结构级改动（合并 / 移动 / 新增小节）可以重写整篇，用 writing_save_work 传 id 覆盖；局部改动优先用 writing_patch_blocks 逐块改，未涉及的块保持原样。',
      '3. 事实、数字、引文、占位符不擅自改动；用户没提的地方不要顺手润色。',
      '4. 公文改完调 writing_check 机检。',
      '5. 回复 3 行内：动了哪些块 / 哪几节、为什么、还剩什么。',
    ].join('\n')
  }

  // 语气档案：从语料提炼
  function voiceLearn(f = {}) {
    return `为「${trim(f.profile) || '我的语气'}」提炼语气档案。`
  }

  window.WA_PROMPTS = { article, officialTemplate, officialFree, reviseBlock, reviseWork, voiceLearn, analysisMeta }
})()
