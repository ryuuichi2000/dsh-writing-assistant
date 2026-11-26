// 插件注册给模型的六个工具。它们在 Host 进程里执行，不经过模型的 bash 沙箱：
// 稿库在 $DSH_HOME/writing-assistant，沙箱里的脚本写不进去。
// 工具注册在根上，所有智能体预设都能继承。
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { checkDraft } from './python.js'
import { docTypeById } from './docs.js'
import { auditAnalysis } from './evidence.js'
import { detectAnalysisMode, reviewOutline } from './analysis.js'
import { draftStats, shortHash } from './blocks.js'
import { lengthState, lengthText } from './length.js'
import { activeVoice, listVoice, listWorks, patchWorkBlocks, readVoice, readWork, saveCheck, saveVoice, saveWork, setActiveVoice, voiceSampleStamp, workMeta, worksDir, addSuggestion, readAnalysisOutline, saveAnalysisOutline, saveReview } from './store.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OFFICIAL_SKILL = join(ROOT, 'skills', 'official-document-drafting')

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

// 参数校验：注册的是原始 JSON Schema，没有 defineTool 帮忙校验，这里自己挡住缺字段和类型错
function check(args, schema) {
  const errs = []
  for (const k of schema.required || []) if (args?.[k] === undefined || args[k] === '') errs.push(`缺少 ${k}`)
  for (const [k, v] of Object.entries(args || {})) {
    const p = schema.properties[k]
    if (!p) errs.push(`未知参数 ${k}`)
    else if (p.enum && !p.enum.includes(v)) errs.push(`${k} 只能是 ${p.enum.join(' / ')}`)
    else if (p.type === 'string' && typeof v !== 'string') errs.push(`${k} 应该是字符串`)
    else if (p.type === 'array' && !Array.isArray(v)) errs.push(`${k} 应该是数组`)
    else if (p.type === 'boolean' && typeof v !== 'boolean') errs.push(`${k} 应该是布尔值`)
  }
  if (errs.length) throw new Error(errs.join('；'))
}

const SAVE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'draft'],
  properties: {
    id: str('更新已有稿件时传它的 id（w-xxxxxxxx）。新建不传'),
    kind: str('article：文章；official：公文起草', { enum: ['article', 'official'] }),
    title: str('标题。不传就从正文第一个一级标题取'),
    draft: str('整篇成稿的 Markdown 原文（这是唯一真相源，页面预览和导出都读它）'),
    brief: str('文章任务卡：题眼、读者、文体、篇幅、假设（可选）'),
    sources: str('来源台账：主张 → 来源 → 原文摘录 → 链接（可选，但每处具体事实都该能回到这里）'),
    outline: str('大纲：主线、每节功能、证据编号（可选）'),
    mode: str('怎么写的：materials（用户给材料）/ prompt（自己检索）/ template（按公文模板）/ free（自定义提示词）/ revise（改稿）'),
    docType: str('公文文种的英文 id，例如 minutes / summary / crisis-report（公文才传）'),
    docTypeName: str('公文文种的中文名，例如 纪要 / 工作总结（公文才传，导出 Word 用它）'),
    fields: { type: 'object', additionalProperties: true, description: '公文表单要素：key → 值，例如 {"matter":"…","recipient":"…"}' },
    voiceProfile: str('这次写作依据的语气档案名（文章可选）'),
    note: str('一两句交付说明：哪些是假设、哪些还标着待核实'),
  },
}

export const saveWorkTool = {
  name: 'writing_save_work',
  description: '把稿件存进「写作助手」稿件库。正文使用 Markdown，页面支持预览、逐段修改和导出 Word。更新已有稿件时传 id。',
  parameters: SAVE_PARAMS,
  timeoutMs: 30_000,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'id', 'title', 'chars'],
      properties: {
        ok: { type: 'boolean' },
        id: { type: 'string' },
        title: { type: 'string' },
        chars: { type: 'integer' },
        blocks: { type: 'integer' },
        warnings: { type: 'array', items: { type: 'string' } },
        reviewOk: { type: 'boolean' },
        reviewBlocking: { type: 'integer' },
        reviewSummary: { type: 'string' },
      },
    },
    render: (args, v) => {
      const warn = v.warnings?.length ? `\n\n注意：${v.warnings.join('\n')}\n请用 writing_read_work + writing_patch_blocks 改掉后再回复用户。` : ''
      return text(
        `已存入「稿件库」：${v.title}（${v.id}，${v.chars} 字，${v.blocks} 个可编辑段落）。` +
          `用户可以在侧栏「写作助手」里打开这份稿子预览、逐段修改，或让模型改某一段；在预览顶栏还能导出 Word。${warn}`,
      )
    },
  },
  async execute(args, execution, job) {
    check(args, SAVE_PARAMS)
    if (job?.kind === 'voice') throw new Error('语气提炼请用 writing_voice save 保存档案')
    const existing = args.id ? workMeta(args.id) : null
    if (args.id && !existing) throw new Error(`找不到稿件 ${args.id}；要新建就不要传 id`)
    const owned = job && ['article', 'official'].includes(job.kind)
    if (job?.kind === 'revise' && args.id !== job.workId) throw new Error('改稿须使用当前任务指定的稿件 id')
    if (owned && (args.kind !== job.kind || (existing && existing.jobId !== job.id))) {
      throw new Error('存稿须使用当前任务的类别和稿件。首次存稿请省略 id。')
    }
    const previous = owned && !args.id ? listWorks().find(w => w.jobId === job.id) : null
    const analysisJob = Boolean(job && job.kind === 'article' && job.request?.group === 'analysis')
    const outlineRecord = analysisJob ? readAnalysisOutline(job.id) : null
    // 分析型：没有通过检查的提纲，不接受正文交付。提纲按任务 id 持久化，恢复后仍然有效。
    if (analysisJob && job.request?.outlineRequired !== false && !outlineRecord?.ok) {
      throw new Error('文章写作要先调用 writing_save_outline 提交提纲并通过检查（主线、每节判断、证据、预测条件），再保存正文。不要先存稿后补提纲。')
    }
    // 首次存稿按任务单篇幅校验。深度研究的正文下限为 2000 字。
    const draftChars = draftStats(args.draft).chars
    const researchMin = job?.request?.group === 'research' ? 2000 : 0
    const lengthInfo = lengthState(draftChars, job?.request?.length, researchMin)
    if (lengthInfo && lengthInfo.state !== 'ok' && job?.kind === 'article' && !args.id && !previous) {
      throw new Error(`${lengthText(lengthInfo)} 这次存稿没有落盘，请把调整后的全文重新传给 writing_save_work。`)
    }
    const reference = job?.kind === 'official' && !job.request?.templateName && docTypeById(job.request?.refDocType)
    const layout = job?.kind === 'official' ? { pageNumber: job.request?.pageNumber,
      headerImage: job.request?.headerImage, footerImage: job.request?.footerImage,
      ...(reference ? { docType: reference.id, docTypeName: reference.name } : {}) } : {}
    const voice = job?.voiceSnapshot !== undefined ? { voiceProfile: job.voiceSnapshot?.name || '' } : {}
    const meta = saveWork({ ...args, ...layout, ...voice, id: args.id || previous?.id,
      ...(owned ? { jobId: job.id, articleKind: job.request?.articleKind } : {}),
      revisionAction: 'model', origin: 'generated' })
    const work = readWork(meta.id)
    const mode = job?.request?.analysisMode || detectAnalysisMode(args.title || work?.title || '')
    const audit = auditAnalysis(args.draft, args.sources || work?.sources || '', { mode, title: args.title || work?.title || '', outline: outlineRecord?.outline || work?.outline || '' })
    if (work && work.kind === 'article') saveReview(work.id, { ...audit.review, outlineHash: outlineRecord?.hash || '', outlineTitle: outlineRecord?.title || '' })
    const auditWarnings = [...audit.items, ...audit.review.items]
      .filter((x) => x.level === 'warn' || x.level === 'error')
      .map((x) => x.message)
      .slice(0, 6)
    const lengthWarning = lengthInfo && lengthInfo.state !== 'ok' ? lengthText(lengthInfo) : ''
    return {
      ok: true,
      id: meta.id,
      title: meta.title,
      chars: meta.chars,
      blocks: work?.blocks.length || 0,
      warnings: [...citationWarnings(args.draft), ...(lengthWarning ? [lengthWarning] : []), ...auditWarnings],
      reviewOk: audit.review.ok,
      reviewBlocking: audit.review.blocking,
      reviewSummary: audit.review.summary,
    }
  },
}

const OUTLINE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['outline'],
  properties: {
    jobId: str('本次后台任务的 id（后台任务会带，一般不用自己填）'),
    title: str('这篇准备用的标题；用户给了标题就原样写'),
    mode: str('任务类型：prediction / mechanism / dispute / analysis（不填按题目判断）', { enum: ['prediction', 'mechanism', 'dispute', 'analysis'] }),
    outline: str('提纲 Markdown：主线 + 每节的判断/问题、证据、条件；预测稿必须写清基线与可改变结论的变量'),
  },
}

// 分析型任务的扩写前检查点：模型先交提纲，Host 用确定性规则检查，
// 不通过就把问题返回给模型改；通过后才允许 writing_save_work。
export const saveOutlineTool = {
  name: 'writing_save_outline',
  description: '文章写作扩写前的提纲检查点。先提交主线、每节的判断/问题、证据、以及预测稿的成立条件；Host 会检查是否每一节都有判断和证据、预测稿是否有条件。通过后再写正文并调用 writing_save_work；不通过按返回的 issues 修改后重交。',
  parameters: OUTLINE_PARAMS,
  timeoutMs: 30_000,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'sections', 'issues'],
      properties: {
        ok: { type: 'boolean' },
        sections: { type: 'array', items: { type: 'string' } },
        issues: { type: 'array', items: { type: 'string' } },
      },
    },
    render: (_args, v) => text(v.ok ? `提纲通过（${v.sections.length} 节）。可以写正文了；保存时仍会按这份提纲和来源台账复核。` : `提纲没通过：\n- ${v.issues.join('\n- ')}\n按这些改完后重新调用 writing_save_outline。`),
  },
  async execute(args, execution, job) {
    check(args, OUTLINE_PARAMS)
    if (job?.kind === 'voice') throw new Error('语气提炼不需要文章提纲')
    if (job && args.jobId && job.id !== args.jobId) throw new Error('请将提纲提交给当前任务')
    const jobId = String(job?.id || args.jobId || '').trim()
    if (!jobId) throw new Error('缺少任务 id：请在后台任务里调用，或显式传 jobId')
    const mode = args.mode || job?.request?.analysisMode || detectAnalysisMode(args.title || job?.name || '')
    const result = reviewOutline(args.outline, { mode })
    saveAnalysisOutline(jobId, { ...result, outline: args.outline, mode, title: args.title || job?.name || '' })
    return { ok: result.ok, sections: result.sections, issues: result.issues.map((x) => x.message) }
  },
}

// 引用规范（按文体不同）：
//   分析型 / 随笔：正文不挂编号，出处写成行内归属；
//   深度研究型：行内归属或「文中编号 + 文末参考资料」二选一。
// 存稿时不拦，但编号必须有对应条目，否则给一句警告让模型自己改。
const CITE_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g
function citationWarnings(draft) {
  const text = String(draft || '')
  const refs = [...text.matchAll(CITE_RE)]
    .flatMap((m) => m[1].split(',').map((x) => Number(x.trim())))
    .filter((n) => Number.isFinite(n))
  if (!refs.length) return []
  const head = text.match(/^##\s*(?:参考资料|参考文献|来源)\s*$/m)
  if (!head) {
    const sample = [...new Set(refs)].slice(0, 5).map((n) => `[${n}]`).join(' ')
    return [`正文用了引用编号（${sample}），但文末没有「## 参考资料」：编号必须有对应条目，否则改成行内归属。`]
  }
  const tail = text.slice(head.index)
  const declared = new Set([...tail.matchAll(/^\s*(\d+)[.、)]\s+/gm)].map((m) => Number(m[1])))
  const missing = [...new Set(refs)].filter((n) => !declared.has(n)).sort((a, b) => a - b)
  if (missing.length) return [`正文编号 ${missing.map((n) => `[${n}]`).join('、')} 在「## 参考资料」里没有对应条目。`]
  return []
}

const PATCH_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'edits'],
  properties: {
    id: str('要改的稿件 id（w-xxxxxxxx）'),
    edits: {
      type: 'array',
      description: '改动列表。replace：换掉整块；insert：在 afterId 后面插入一块；delete：删掉一块',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          blockId: str('目标块 id，例如 b3（insert 时可省，用 afterId）'),
          afterId: str('insert 时插在这一块后面'),
          action: str('replace（默认）/ insert / delete', { enum: ['replace', 'insert', 'delete'] }),
          expect: str('这一块现在的哈希（writing_read_work 会给出）。对不上说明预览是旧的，工具会拒绝，避免改错'),
          content: str('replace / insert 时的整块新原文（Markdown）'),
        },
      },
    },
    note: str('一句话说明改了什么，会记进 revisions.jsonl'),
  },
}

export const patchBlocksTool = {
  name: 'writing_patch_blocks',
  description: '按块修改「写作助手」稿库里的一篇成稿。先调 writing_read_work 拿到块 id 和哈希，只改选区所在的块，选区外的块一个字都不动；用户没选中的段落不要顺手改。改完工具会把 Markdown 写回 draft.md 并重新分块。',
  parameters: PATCH_PARAMS,
  timeoutMs: 30_000,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'applied', 'warnings'],
      properties: {
        ok: { type: 'boolean' },
        applied: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
        chars: { type: 'integer' },
      },
    },
    render: (_args, v) => {
      if (!v.ok) return text(`没有改动。${(v.warnings || []).join('；') || '请先用 writing_read_work 读最新的块 id 和哈希。'}`)
      const warn = v.warnings?.length ? `\n注意：${v.warnings.join('；')}` : ''
      return text(`已改 ${v.applied.length} 处（${v.applied.join('、')}），现在 ${v.chars} 字。用户刷新预览就能看到。${warn}`)
    },
  },
  async execute(args, execution, job) {
    check(args, PATCH_PARAMS)
    if (job?.kind === 'voice') throw new Error('语气提炼不修改稿件')
    const work = readWork(args.id)
    if (!work) throw new Error(`找不到稿件 ${args.id}`)
    if ((['article', 'official'].includes(job?.kind) && work.jobId !== job.id)
        || (job?.kind === 'revise' && work.id !== job.workId)) {
      throw new Error('局部修改须使用当前任务的稿件')
    }
    const result = patchWorkBlocks(args.id, args.edits, { action: 'model', note: args.note || '' })
    const after = readWork(args.id)
    const warnings = [...(result.warnings || [])]
    const researchMin = job?.request?.group === 'research' ? 2000 : 0
    const lengthInfo = lengthState(after?.chars || 0, job?.request?.length, researchMin)
    if (lengthInfo && lengthInfo.state !== 'ok') warnings.push(lengthText(lengthInfo))
    if (after && after.kind === 'article') {
      const mode = job?.request?.analysisMode || detectAnalysisMode(after.title, after.draft)
      const audit = auditAnalysis(after.draft, after.sources, { mode, outline: after.outline || '' })
      saveReview(after.id, audit.review)
      for (const item of audit.review.items.filter((x) => x.level === 'error')) warnings.push(item.message)
    }
    return {
      ok: Boolean(result.ok),
      applied: (result.applied || []).map((a) => `${a.blockId}${a.action === 'replace' ? '' : ` ${a.action}`}`),
      warnings,
      chars: after?.chars || 0,
    }
  },
}

const SUGGEST_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'blockId', 'text'],
  properties: {
    id: str('稿件 id（w-xxxxxxxx）'),
    blockId: str('要改的那一块，例如 b3'),
    text: str('这一块改完后的整段原文（Markdown）'),
    reason: str('一句话说明为什么这么改'),
  },
}

export const suggestBlockTool = {
  name: 'writing_suggest_block',
  description:
    '改稿时用这个：把改好的整段作为「建议」提交给用户，不直接写进正文。用户会在预览里看到原句、新句和原因，自己决定采用还是忽略。先调 writing_read_work 拿块 id；只提这一块的改动。',
  parameters: SUGGEST_PARAMS,
  timeoutMs: 30_000,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'suggestionId', 'blockId'],
      properties: { ok: { type: 'boolean' }, suggestionId: { type: 'string' }, blockId: { type: 'string' } },
    },
    render: (_args, v) => text(`已把改动作为建议提交（${v.blockId}，建议 ${v.suggestionId}）。用户在预览里采用后才会写进正文。`),
  },
  async execute(args) {
    check(args, SUGGEST_PARAMS)
    const work = readWork(args.id)
    if (!work) throw new Error(`找不到稿件 ${args.id}`)
    const target = work.blocks.find((b) => b.id === String(args.blockId))
    if (!target) throw new Error(`找不到块 ${args.blockId}；先用 writing_read_work 看块清单`)
    const entry = addSuggestion(args.id, {
      blockId: String(args.blockId),
      hash: target.hash,
      original: target.text,
      proposed: args.text,
      reason: args.reason || '',
    })
    return { ok: true, suggestionId: entry.id, blockId: entry.blockId }
  },
}

const READ_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: str('稿件 id（w-xxxxxxxx）'),
    blocksOnly: { type: 'boolean', description: '只要块清单（改稿时用），不返回 brief/sources/outline' },
  },
}

export const readWorkTool = {
  name: 'writing_read_work',
  description: '读取「写作助手」稿库里的一篇成稿：元信息、正文全文、以及分块清单（每块的 id / 类型 / 哈希 / 原文）。改稿前必须先用它，块 id 和哈希是 writing_patch_blocks 的凭据。',
  parameters: READ_PARAMS,
  output: {
    schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
    render: (_args, v) => text(v.text),
  },
  async execute(args) {
    check(args, READ_PARAMS)
    const work = readWork(args.id)
    if (!work) throw new Error(`找不到稿件 ${args.id}`)
    const head = [
      `稿件 ${work.id}｜${work.title}`,
      `${{ analysis: '文章写作', research: '深度研究', official: '公文起草', imported: '我的稿件' }[work.type]}${work.docTypeName ? ` · ${work.docTypeName}` : ''}｜${work.chars} 字｜更新 ${work.updatedAt.slice(0, 16).replace('T', ' ')}`,
      work.voiceProfile ? `语气档案：${work.voiceProfile}` : '',
      work.fields && Object.keys(work.fields).length ? `表单要素：${JSON.stringify(work.fields)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const blockList = work.blocks
      .map((b) => {
        const one = b.text.replace(/\n/g, ' ⏎ ')
        return `- ${b.id}｜${b.type}${b.type === 'section' ? `(${b.text.replace(/^#+\s*/, '')})` : ''}｜hash ${b.hash}｜${one.length > 160 ? `${one.slice(0, 160)}…` : one}`
      })
      .join('\n')
    const extra =
      args.blocksOnly
        ? ''
        : [work.brief && `\n## 任务卡（brief.md）\n\n${work.brief}`, work.sources && `\n## 来源台账（sources.md）\n\n${work.sources}`, work.outline && `\n## 大纲（outline.md）\n\n${work.outline}`]
            .filter(Boolean)
            .join('\n')
    return { text: `${head}\n\n## 分块（${work.blocks.length} 块，改稿按这些 id 定位）\n\n${blockList}\n\n## 正文（draft.md）\n\n${work.draft}${extra}` }
  },
}

const LIST_PARAMS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: str('article：全部文章（含导入）；official：公文；all：全部（默认）', { enum: ['article', 'official', 'all'] }),
    q: str('按标题 / 文种 / 表单 / 正文关键字过滤'),
    limit: { type: 'number', description: '返回几条，默认 20' },
  },
}

export const listWorksTool = {
  name: 'writing_list',
  description: '查看「写作助手」稿库里的稿件清单（最近更新在前），用来判断某篇是不是已经写过、要不要接着改。',
  parameters: LIST_PARAMS,
  output: {
    schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
    render: (_args, v) => text(v.text),
  },
  async execute(args) {
    check(args, LIST_PARAMS)
    const list = listWorks(args.q || '', args.kind || 'all').slice(0, Math.max(1, Math.min(50, Number(args.limit) || 20)))
    if (!list.length) return { text: '稿库里还没有稿件。' }
    return {
      text: `稿库共 ${list.length} 篇：\n${list
        .map((w) => `- ${w.id}｜${w.kind === 'official' ? '公文' : '文章'}${w.docTypeName ? `（${w.docTypeName}）` : ''}｜${w.title}｜${w.chars} 字｜更新 ${String(w.updatedAt).slice(0, 10)}`)
        .join('\n')}`,
    }
  },
}

const VOICE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: str('show：读档案；save：整份覆盖；note：追加一条对话里学到的修正；use：设为当前档案；list：列出全部档案', {
      enum: ['show', 'save', 'note', 'use', 'list'],
    }),
    profile: str('档案名，默认当前 active'),
    text: str('save 时是整份档案 Markdown；note 时是一条观察（写清用户原话和改法）'),
  },
}

const NO_PROFILE = [
  '还没有语气档案。',
  '不是错误：这次照常写，按文体和事实要求来，不要提醒用户「档案缺失」。',
  '如果用户想建档案：先上传 3 篇以上他自己写过的文章（页面「语气档案」页可拖入），再从语料里提炼特征。',
].join('\n')

export const voiceTool = {
  name: 'writing_voice',
  description: '读写「写作助手」的语气档案。后台写作按任务指定的档案或不用档案；普通对话需要时用 show 读取。用户明确希望记录措辞偏好时用 note。',
  parameters: VOICE_PARAMS,
  output: {
    schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' }, profile: { type: 'string' } } },
    render: (_args, v) => text(v.text),
  },
  async execute(args, execution, job) {
    check(args, VOICE_PARAMS)
    if (job?.kind === 'voice') {
      if (args.action !== 'save') throw new Error('本次提炼只保存目标档案')
      const learning = job.voiceLearning
      if (job._cancelled) throw new Error('语气提炼已取消')
      if (!learning || (args.profile && args.profile !== learning.profile)) throw new Error('请保存到本次任务指定的档案')
      const current = readVoice(learning.profile, { includeCorpus: false })
      if (voiceSampleStamp(current.samples) !== learning.sampleStamp ||
           (current.profileJobId !== job.id && shortHash(current.profile) !== learning.profileHash)) {
        throw new Error('旧稿或档案已经改动，请重新提炼')
      }
      const body = String(args.text || '').trim()
      if (!/^#\s+.+\n+[\s\S]*\S/.test(body)) throw new Error('请提交带一级标题和实际特征的完整语气档案')
      const saved = saveVoice(learning.profile, body, { jobId: job.id })
      return { text: `已保存语气档案「${saved.name}」。`, profile: saved.name }
    }
    if (job?.voiceSnapshot !== undefined) {
      if (args.action !== 'show') throw new Error('写作任务只使用提交时的语气档案')
      const snapshot = job.voiceSnapshot
      return snapshot ? { text: snapshot.profile, profile: snapshot.name } : { text: '本次按文体写，未使用语气档案。', profile: '' }
    }
    if (args.action === 'list') {
      const list = listVoice()
      if (!list.length) return { text: '还没有语气档案。' }
      return { text: `语气档案共 ${list.length} 份：\n${list.map((v) => `- ${v.name}${v.active ? '（写作默认）' : ''}｜${v.samples} 篇样本 / ${v.sampleChars} 字`).join('\n')}` }
    }
    if (args.action === 'use') {
      if (!args.profile) throw new Error('use 需要 profile')
      setActiveVoice(args.profile)
      return { text: `已把「${args.profile}」设为当前语气档案。`, profile: args.profile }
    }
    if (args.action === 'note') {
      const body = String(args.text || '').trim()
      if (!body) throw new Error('note 需要 text')
      const cur = readVoice(args.profile || activeVoice(), { includeCorpus: false })
      const name = args.profile || activeVoice() || '我的语气'
      const base = cur?.profile?.trim() || '# 语气档案\n\n## 对话中学到的\n'
      const line = `- ${new Date().toISOString().slice(0, 10)}：${body}`
      const next = /##\s*对话中学到的/.test(base) ? `${base.replace(/(##\s*对话中学到的[^\n]*\n)/, `$1${line}\n`)}\n` : `${base}\n\n## 对话中学到的\n${line}\n`
      saveVoice(name, next)
      return { text: `已记进「${name}」的「对话中学到的」。同一条规律出现第二次时，再把它挪进正文小节。`, profile: name }
    }
    if (args.action === 'save') {
      const body = String(args.text || '').trim()
      if (!body) throw new Error('save 需要 text（整份档案 Markdown）')
      if (!/^#\s+/.test(body)) throw new Error('档案要以一级标题开头，例如「# 语气档案：我的公众号文」')
      const v = saveVoice(args.profile || activeVoice() || '我的语气', body)
      return { text: `已保存语气档案「${v.name}」（${v.chars} 字）。`, profile: v.name }
    }
    const v = readVoice(args.profile || activeVoice(), { includeCorpus: false })
    if (!v?.exists) return { text: NO_PROFILE, profile: '' }
    const samples = v.samples.length ? `\n\n（依据 ${v.samples.length} 篇样本 / ${v.sampleChars || v.samples.reduce((n, s) => n + (s.chars || 0), 0)} 字，更新 ${String(v.updatedAt).slice(0, 10) || '—'}）` : ''
    return { text: `${v.profile}${samples}`, profile: v.name }
  },
}

const CHECK_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: str('稿件 id（w-xxxxxxxx）') },
}

export const checkTool = {
  name: 'writing_check',
  description: '对「写作助手」稿库里的一篇公文跑机检（scripts/check_draft.py）：必备章节、结构顺序、层级跳级、文号日期红线、结尾套语、占位符、具体事实清单。机器只做提示，最终以人工校对为准；errors 必须改，warnings 自己判断。',
  parameters: CHECK_PARAMS,
  timeoutMs: 120_000,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'text'],
      properties: {
        ok: { type: 'boolean' },
        text: { type: 'string' },
        errors: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    },
    render: (_args, v) => text(v.text),
  },
  async execute(args) {
    check(args, CHECK_PARAMS)
    const work = readWork(args.id)
    if (!work) throw new Error(`找不到稿件 ${args.id}`)
    if (work.kind !== 'official') throw new Error('此工具适用于公文；文章可使用预览顶栏的「文章检查」')
    const docType = work.docTypeName || work.docType
    if (!docType) throw new Error('这篇公文没有登记文种，先在页面里选一个文种或补 docTypeName')
    // 机检读磁盘上的 draft.md（唯一真相源），不再另写临时文件
    const draftFile = join(worksDir(), work.id, 'draft.md')
    const r = await checkDraft({ skillDir: OFFICIAL_SKILL, draftFile, docType })
    saveCheck(work.id, { docType, ok: r.ok, errors: r.errors, warnings: r.warnings, infos: r.infos, items: r.items, output: r.output })
    const lines = [
      `机检（${docType}）：${r.ok ? '通过' : '未通过'}`,
      r.errors.length ? `错误：\n${r.errors.map((e) => `- ${e}`).join('\n')}` : '',
      r.warnings.length ? `警告：\n${r.warnings.map((e) => `- ${e}`).join('\n')}` : '',
      r.infos.length ? `提示：\n${r.infos.map((e) => `- ${e}`).join('\n')}` : '',
      r.items.length ? `清单：\n${r.items.slice(0, 40).map((e) => `- ${e}`).join('\n')}` : '',
    ].filter(Boolean)
    return { ok: r.ok, text: lines.join('\n\n'), errors: r.errors, warnings: r.warnings }
  },
}

export const TOOLS = [saveOutlineTool, saveWorkTool, patchBlocksTool, suggestBlockTool, readWorkTool, listWorksTool, voiceTool, checkTool]
