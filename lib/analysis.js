// 文章写作的确定性规则：识别任务类型、拆来源台账、审提纲、审正文。
// 这里只做程序能确定的事（口径、算术、证据边界、明确的推断跳步）；
// 语义好不好、文风像不像人，由编辑步骤和人工判断，不能靠正则冒充。

const FUTURE_YEAR = /(20\d{2}\s*年|明年|下一年|未来\s*\d*\s*年)/g

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

export function titleAndBrief(text = '') {
  const raw = String(text || '').trim()
  // 「用《某作》的玩法材料说清楚」这类要求是委托的一部分，不是标题：带了材料/玩法指向，
  // 或整句以「说清楚/讲清楚」收尾，就按委托处理，标题让模型自拟。
  const usesMaterial = /用\s*[《「][^》」]{1,30}[》」][^。\n]{0,12}(材料|玩法|案例|数据)/.test(raw)
  const endsAsInstruction = /(说清楚|讲清楚|说清|讲清)[。！？!?]?$/.test(raw)
  const brief = /自拟题目|题目自拟|写一篇|请写|要求|分\s*[2-9]\s*[-—~至]\s*[2-9]\s*点|分\s*[2-9]\s*点|从.{2,24}(出发|角度|切入)|结合|围绕|需要.{0,8}(数据|佐证|证据)/.test(raw) || raw.length > 34 || usesMaterial || endsAsInstruction
  return { mode: brief ? 'brief' : 'given', text: raw }
}

export function detectAnalysisMode(title = '', extra = '') {
  const t = `${title}\n${extra}`.trim()
  if (!t) return 'analysis'
  const future = /20\d{2}\s*年|明年|下一年|未来/.test(t)
  const predict = /预测|展望|走势|趋势|判断|会(不会|怎样|如何)?|将(会)?|能到|达到|突破|增长到|规模|增量|从哪里来/.test(t)
  const retro = /复盘|回顾|过去|已经|历史|为何|为什么|原因|机制|是否|是不是|争议|比较|对比|利弊|怎样|如何/.test(t)
  if (future && predict && !retro) return 'prediction'
  if (/是否|是不是|该不该|争议|不务正业|对错|利弊|值不值/.test(t)) return 'dispute'
  if (/怎样|如何|为什么|为何|机制|吸引|增长|从哪里来|靠什么|凭什么/.test(t)) return 'mechanism'
  return 'analysis'
}

export function extractConstraints(title = '') {
  const t = String(title || '')
  const range = t.match(/分\s*([2-9])\s*[-—~至]\s*([2-9])\s*点/)
  const single = t.match(/(?:分|写)\s*([2-9])\s*点/)
  const points = range ? [Number(range[1]), Number(range[2])] : single ? [Number(single[1]), Number(single[1])] : null
  const angles = ['品类', '消费', '行业', '用户', '收入', '出海', '政策', '公司', 'IP', '女性'].filter((x) => t.includes(x))
  const len = t.match(/约?\s*(\d{3,4})\s*字/)
  return {
    points,
    angles,
    length: len ? Number(len[1]) : null,
    needsData: /数据|佐证|证据|来源|口径/.test(t),
    asksPrediction: /预测|展望|走势|增量|从哪里来/.test(t),
  }
}

export function constraintsText(c) {
  const out = []
  if (c.points) out.push(`用户要求的判断数：${c.points[0] === c.points[1] ? `${c.points[0]} 点` : `${c.points[0]}–${c.points[1]} 点（够用即可，不要为凑数硬加）`}`)
  if (c.angles.length) out.push(`用户点到的角度：${c.angles.join('、')}`)
  if (c.length) out.push(`用户提到的篇幅：约 ${c.length} 字`)
  if (c.needsData) out.push('用户要求数据/证据支撑')
  if (c.asksPrediction) out.push('用户要求判断未来（按预测稿规则）')
  return out.length ? out.join('；') : '用户没有额外结构要求，按题目本身决定'
}

// ---------------- 来源台账 ----------------
// 台账里的「来源」「口径」「本文推算」「待核」是四种不同强度的文字：
// 只有「来源」是外部证据；「本文推算」是作者自己的算式；「待核」是缺口备注。
export function parseLedgerDetailed(text = '') {
  const lines = String(text || '').split(/\r?\n/)
  const entries = []
  let section = '来源'
  let seq = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const h = line.match(/^#{1,6}\s*(.+)$/)
    if (h) {
      section = h[1].trim()
      continue
    }
    if (/^检索日期|^数据目录|^说明[:：]/.test(line)) continue
    const cleaned = line.replace(/^[-*+]\s*/, '').replace(/^\d+[.、)]\s*/, '').trim()
    if (cleaned.length < 6) continue
    const link = (cleaned.match(/https?:\/\/\S+/) || [''])[0]
    const kind = /推算|本文/.test(section) ? 'author' : /待核|缺口/.test(section) ? 'pending' : /口径|说明/.test(section) ? 'scope' : 'source'
    seq++
    entries.push({
      id: `e${seq}`,
      text: cleaned,
      plain: cleaned.replace(/https?:\/\/\S+/g, '').trim(),
      link,
      section,
      kind,
      numbers: extractNumbers(cleaned),
    })
  }
  return entries
}

export function extractNumbers(text = '') {
  const out = []
  for (const m of String(text || '').matchAll(/\d+(?:\.\d+)?\s*(?:%|％|亿|万|千|百|元|人|家|款|年|个月|天|分钟|美元)?/g)) {
    const v = m[0].replace(/\s+/g, '')
    if (v.length > 1 && !out.includes(v)) out.push(v)
  }
  return out
}

const sourceEntries = (entries) => entries.filter((e) => e.kind === 'source' || e.kind === 'scope')
const norm = (s) => String(s || '').replace(/\s/g, '').replace(/％/g, '%')

// ---------------- 提纲检查 ----------------
export function reviewOutline(outline = '', { mode = 'analysis' } = {}) {
  const text = String(outline || '').trim()
  const issues = []
  if (text.length < 40) issues.push({ code: 'outline-empty', message: '提纲太短：至少写清主线、2 个以上判断、每个判断的证据和条件。' })
  const heads = [...text.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => ({ title: m[1].trim(), at: m.index, length: m[0].length }))
  const numberedHeads = heads.length ? [] : [...text.matchAll(/^\d+[.、]\s*(.+)$/gm)].map((m) => ({ title: m[1].trim(), at: m.index, length: m[0].length }))
  const usedHeads = heads.length ? heads : numberedHeads
  const chunks = usedHeads.length
    ? usedHeads.map((h, i) => ({ title: h.title, body: text.slice(h.at + h.length, usedHeads[i + 1]?.at ?? text.length) }))
    : text.split(/\n{2,}/).map((body, i) => ({ title: `第 ${i + 1} 段`, body }))
  if (chunks.length < 2) issues.push({ code: 'outline-sections', message: '提纲至少要有 2 个主体判断；用户只要求两点时不必凑三节。' })
  for (const c of chunks) {
    const body = c.body
    if (!/(判断|问题|结论|回答|会|将|达到|突破|增长|来自|取决于|增加|下降|不是|是)/.test(body)) {
      issues.push({ code: 'outline-claim', section: c.title, message: `「${c.title}」没有写出这一节要回答的判断或问题。` })
    }
    if (!/(证据|来源|数据|依据|台账|指标|口径|样本|报告)/.test(body)) {
      issues.push({ code: 'outline-evidence', section: c.title, message: `「${c.title}」没有列出支撑判断的证据或来源。` })
    }
  }
  if (mode === 'prediction' && !/(条件|前提|如果|假设|取决于|变量|一旦|可能改变)/.test(text)) {
    issues.push({ code: 'outline-condition', message: '预测提纲缺少「什么条件下结论会变」：至少写一条前提或可改变结论的变量。' })
  }
  return { ok: issues.length === 0, issues, sections: chunks.map((c) => c.title) }
}

// ---------------- 正文检查 ----------------
function blockList(draft = '') {
  return String(draft || '')
    .split(/\n{2,}/)
    .map((text, index) => ({ index, text: text.trim() }))
    .filter((b) => b.text)
}

function firstTitle(draft) {
  return (String(draft || '').match(/^#\s+(.+)$/m) || [])[1]?.trim() || ''
}

export function reviewArticle(draft = '', sources = '', { mode = 'analysis', outline = '', title: titleOption = '' } = {}) {
  const text = String(draft || '')
  const blocks = blockList(text)
  const entries = parseLedgerDetailed(sources)
  const sourcesOnly = sourceEntries(entries)
  const ledger = sourcesOnly.map((e) => e.plain).join('\n')
  const ledgerNorm = norm(ledger)
  const pending = entries.filter((e) => e.kind === 'pending')
  const author = entries.filter((e) => e.kind === 'author')
  const items = []
  const add = (level, kind, block, message, advice = '') => {
    if (items.some((x) => x.kind === kind)) return
    items.push({ level, kind, blockId: block ? `blk-${block.index}` : '', excerpt: block ? clean(block.text).slice(0, 90) : '', message, advice })
  }

  // 1. 跨期判断：单期结构推不出「流向变化」
  const flowBlock = blocks.find((b) => /(钱|资金|收入|预算)[^。\n]{0,16}(流向|流向了|涌向)|流向[^。\n]{0,12}(品类|赛道)/.test(b.text))
  if (flowBlock) {
    const comparative = /(去年|上年|上一期|同比|环比|从[^。\n]{0,20}到|占比[^。\n]{0,6}(从|由)[^。\n]{0,12}(升|降)|20\d{2}[^。\n]{0,20}20\d{2})/.test(flowBlock.text)
    const periods = new Set(sourcesOnly.flatMap((e) => [...e.plain.matchAll(FUTURE_YEAR)]).map((m) => m[1].replace(/\s/g, '')))
    if (!comparative || periods.size < 2) {
      add('error', 'cross-period', flowBlock,
        '「钱流向了……」是跨期判断；台账给的是单期品类收入占比，没有同口径的上一期数据，推不出「流向变了」。',
        '改成单期事实（例如「上半年百强移动游戏中，射击和 MOBA 合计占收入的 45.19%」），或补同口径跨期数据、留存/新品供给依据。')
    }
  }

  // 2. 人均贡献 → 单价/涨价：算术结果不能推出价格
  const priceBlock = blocks.find((b) => /人均/.test(b.text) && /(单价|提价|涨价|客单)[^。\n]{0,10}(涨|升|提高|增加)|(涨|升|提高|增加)[^。\n]{0,6}(单价|提价|涨价|客单)/.test(b.text))
  if (priceBlock) {
    const hasPrice = sourcesOnly.some((e) => /(ARPU|付费率|客单价|价格|单价|付费).{0,20}(数据|显示|报告|%|元)/.test(e.plain))
    if (!hasPrice) {
      add('error', 'price-inference', priceBlock,
        '人均贡献是用「收入 ÷ 用户数」算出来的；它不能推出「单价涨了」或「靠提价」。台账里没有付费率、ARPU 或价格数据。',
        '把这句话降级成「人均贡献的算术值上升，原因可能是付费率、ARPU 或统计口径变化，现有台账无法区分」，或补价格/付费数据。')
    }
  }

  // 3. 消费分层：收入、时长、月活、广告变现混在一起
  // 这类问题往往不是一段话里说完的，按小节聚合检查。
  const sections = []
  let section = null
  for (const b of blocks) {
    if (/^##\s+/.test(b.text)) {
      section = { title: b.text.replace(/^##\s+/, ''), blocks: [] }
      sections.push(section)
    } else if (section) section.blocks.push(b)
  }
  const layerSection = sections.find((s) => /(三|两|几)层|切成|分层|价格/.test(s.title) && /(小游戏|手游|端游|主机)/.test(s.title + s.blocks.map((b) => b.text).join('\n')))
  if (layerSection) {
    const body = `${layerSection.title}\n${layerSection.blocks.map((b) => b.text).join('\n')}`
    const measures = [...new Set((body.match(/收入|流水|时长|月活|用户规模|广告|付费|定价|客单|ARPU|分钟/g) || []))]
    const common = /同一口径|统一口径|同一量度|都按.{0,6}(收入|付费|时长)/.test(text) || /同一口径|统一口径/.test(ledger)
    if (measures.length >= 3 && !common) {
      add('error', 'mixed-measure', layerSection.blocks[0] || null,
        '「消费被切成三层」同时用了收入、时长、月活和广告变现等不同量度，三个市场并不在同一张表里。',
        '拆成一个可核的问题（例如「小游戏的收入增长里，有多少来自玩家付费？」），并分别标注每个数字的口径；不要用主动句掩盖量度混用。')
    }
  }

  // 4. 概率/大概率突破：区间算术不是概率
  const probBlock = blocks.find((b) => /(大概率|很可能|有望|势必|必然|概率)/.test(b.text) && /(4000|突破|达到|增长|区间)/.test(b.text) && !/(不是|并非|不能|不要|不写|未必|不应|没有)[^。\n]{0,12}(大概率|很可能|有望|势必|必然|概率)/.test(b.text))
  if (probBlock) {
    const hasProb = sourcesOnly.some((e) => /(概率|可能性|情景|置信|预测区间)/.test(e.plain))
    if (!hasProb) {
      add('error', 'probability', probBlock,
        '「大概率突破」是概率判断；台账里只有算术区间和作者外推，没有概率依据。区间端点落在 4000 附近，不等于「大概率」。',
        '改成条件句：若 2026 年为 3750 亿元，达到 4000 需增长约 6.67%；若为 3800 亿元，需增长约 5.26%；这是情景计算，不是概率预测。')
    }
  }

  // 5. 台账已注明没有支撑的趋势判断
  const trendBlock = blocks.find((b) => /(只剩|只剩下|仅剩|只有)[^。\n]{0,14}(百人|团队|几家|头部)/.test(b.text))
  if (trendBlock) {
    const noSupport = pending.some((e) => /(没有|缺少|缺).{0,8}(支撑|名单|证据)|待核/.test(e.plain)) || !sourcesOnly.some((e) => /(团队|名单|百人)/.test(e.plain))
    if (noSupport) {
      add('error', 'unsupported-trend', trendBlock,
        '「只剩百人以上团队那几家」在台账里已注明缺少企业名单支撑；把这句话再写进台账，不等于补上了证据。',
        '删掉名单式判断，改成可核的条件（例如「若按年迭代、维持百人以上团队，能留下来的产品数量会继续减少」），或补企业名单和口径。')
    }
  }

  // 6. 预测段没有条件
  if (mode === 'prediction') {
    const predBlock = blocks.find((b) => /(20\d{2}\s*年|明年|未来)/.test(b.text) && /(会|将|达到|突破|增长|落在|站上)/.test(b.text))
    if (predBlock && !/(如果|前提|条件|假设|取决于|若|一旦|变量|可能改变)/.test(predBlock.text)) {
      add('warn', 'prediction-condition', predBlock,
        '这一段给了目标时期的判断，但没有交代成立条件；预测稿至少要说明哪些变量会改变结论。',
        '补一句「前提是……；若……变了，这个判断要往下修」。')
    }
    // 预测判断集中压在末节：前两节只解释历史，读者到末节才看到本题
    const futureAt = text.search(/(20\d{2}\s*年|明年|未来)/)
    if (futureAt > text.length * 0.55) {
      add('warn', 'late-forecast', null,
        '预测判断集中在全文后半段，前两节主要在解释历史；标题承诺的是目标时期，读者要读到后面才知道本文到底怎么判断。',
        '把每一节的判断改成面向目标时期的问题或结论：这一节对 2027 年的增量意味着什么？出海只在能说明国内供给或企业选择时使用。')
    }
  }

  // 7. 标题里的指代是否清楚（不设禁词表，只看有没有对象）
  const title = titleOption || firstTitle(text)
  if (title && /钱|它|那几个|这条|这局|线是|局/.test(title) && !/游戏|市场|行业|公司|IP|女性|消费|202\d/.test(title)) {
    add('warn', 'title-reference', null,
      `标题「${title}」里的指代在列表里无法辨认行业、年份和要回答的问题。`,
      '把对象和预测意图写进标题；可以用短语或问句，但不要只靠「钱 / 它 / 那几个」。')
  }

  // 8. 作者推算被写成外部来源
  for (const b of blocks) {
    const nums = extractNumbers(b.text).filter((n) => /\d/.test(n))
    for (const n of nums) {
      const nv = norm(n)
      const inSource = sourcesOnly.some((e) => norm(e.plain).includes(nv))
      const inAuthor = author.some((e) => norm(e.plain).includes(nv))
      if (!inSource && inAuthor && /据|根据|统计|报告|显示|数据显示/.test(b.text)) {
        add('warn', 'derived-as-source', b,
          `「${n}」只在「本文推算」里出现，却被写成外部数据；作者推算不能冒充来源。`,
          '把「据……显示」改成「按……外推/粗算」，并写出基数、期间和公式。')
        break
      }
    }
  }

  // 9. 算术提示：区间端点与阈值，不拦正确的情景区间
  if (/3750|3800|3950|4000/.test(text)) {
    const note = '情景算术：3750 × 1.05 = 3937.5，3800 × 1.06 = 4028；若基数 3750，达到 4000 需 +6.67%，若 3800 需 +5.26%。区间、阈值写对就通过；只有「大概率/必然」才需要概率依据。'
    if (!items.some((x) => x.kind === 'scenario-note')) items.push({ level: 'info', kind: 'scenario-note', blockId: '', excerpt: '', message: note, advice: '' })
  }

  // 10. 外部事实/作者推算/待核分开记录
  if (author.length && !items.some((x) => x.kind === 'derived-note')) {
    items.push({ level: 'info', kind: 'derived-note', blockId: '', excerpt: '', message: `台账里另有 ${author.length} 条作者推算、${pending.length} 条待核备注：它们不是外部证据，正文引用时要写明「按…推算/待核」。`, advice: '' })
  }

  const blocking = items.filter((x) => x.level === 'error')
  return {
    ok: blocking.length === 0,
    mode,
    title,
    items,
    blocking: blocking.length,
    summary: blocking.length ? `有 ${blocking.length} 项需要解决` : '没有发现确定的证据/口径错误',
    outlineUsed: Boolean(outline),
  }
}

export function reviewStatus(review) {
  if (!review) return '待审校'
  if (review.ok) return '已通过'
  return '需核对'
}
