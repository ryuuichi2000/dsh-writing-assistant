// 写作助手 · 本地稿库 / 语气档案库
// 存在 $DSH_HOME/writing-assistant（没有 DSH_HOME 时是 ~/.dsh）：
//   works/<id>/meta.json        稿件元信息（类别、标题、文种、表单、状态）
//   works/<id>/draft.md         正文，唯一真相源
//   works/<id>/brief.md sources.md outline.md   研究型写作的任务卡 / 来源台账 / 大纲
//   works/<id>/revisions.jsonl  每次改动的快照（预览里手改、模型改都记）
//   works/<id>/check.json       最近一次成稿校验结果
//   voice/<profile>/profile.md  语气档案；samples/ + corpus.md 是它的素材
//   exports/*.docx              导出的 Word
// 只写本机，不上传任何地方。
import { randomUUID } from 'node:crypto'
import { normalizePageNumber } from './page-numbers.js'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { applyEdits, draftStats, normalizeText, shortHash, splitBlocks } from './blocks.js'

export const dataDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'writing-assistant')
export const worksDir = () => join(dataDir(), 'works')
export const voiceDir = () => join(dataDir(), 'voice')
export const exportsDir = () => join(dataDir(), 'exports')
export const workspaceDir = () => join(dataDir(), 'workspace')

const newId = (p) => `${p}-${randomUUID().slice(0, 8)}`
const now = () => new Date().toISOString()
const ensure = (dir) => mkdirSync(dir, { recursive: true })
const clean = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function writeAtomic(file, data) {
  ensure(join(file, '..'))
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

const workPath = (id, file) => join(worksDir(), String(id), file)
const ID_RE = /^w-[\w-]+$/

export const KINDS = { article: '文章', official: '公文起草' }

function sortMeta(list) {
  return list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function snippetOf(draft, q) {
  const text = normalizeText(draft)
  if (q) {
    const at = text.toLowerCase().indexOf(String(q).toLowerCase())
    if (at >= 0) return `…${text.slice(Math.max(0, at - 40), at + 90).replace(/[#>*|\n]+/g, ' ').trim()}…`
  }
  for (const block of text.split(/\n{2,}/)) {
    const first = block.split('\n').find((l) => l.trim()) || ''
    // 标题块跳过：列表里已经有标题了，摘要要给出正文的第一句
    if (/^#{1,6}\s/.test(first.trim())) continue
    const flat = block
      .split('\n')
      .map((l) => l.replace(/^[#>\-*\s|]+/, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim()
    if (flat.length >= 18) return flat.slice(0, 110) + (flat.length > 110 ? '…' : '')
  }
  return text
    .split('\n')
    .filter((l) => !/^#{1,6}\s/.test(l.trim()))
    .join(' ')
    .replace(/[#>*|\-\s]+/g, ' ')
    .trim()
    .slice(0, 110)
}

export function workMeta(id) {
  if (!ID_RE.test(String(id))) return null
  const meta = readJson(workPath(id, 'meta.json'), null)
  if (!meta || !meta.id) return null
  return meta
}

// 导入是稿件来源。导入稿沿用文章编辑器，与生成的文章分开筛选。
export function workType(meta) {
  if (!meta) return 'analysis'
  if (meta.kind === 'official') return 'official'
  if (meta.origin === 'imported') return 'imported'
  return meta.articleKind === 'research' ? 'research' : 'analysis'
}

export function importWork({ importKey, title, draft, filename } = {}) {
  if (typeof importKey !== 'string' || !/^[a-f0-9]{32}$/.test(importKey)) throw new Error('导入标识无效，请重新打开导入窗口')
  if (typeof draft !== 'string') throw new Error('请粘贴正文或选择 Markdown 文件')
  const text = normalizeText(draft)
  if (!text.trim()) throw new Error('正文为空，请粘贴正文或选择有内容的 Markdown 文件')
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('正文超过 1 MB，请缩小后重试')
  if (text.includes('\0')) throw new Error('请使用 UTF-8 编码的文本或 Markdown 文件')

  const id = `w-${importKey}`
  const existing = workMeta(id)
  if (existing?.origin === 'imported') return existing
  ensure(worksDir())
  // 先在列表不可见的目录写完正文、元信息与第一版，再一次发布。
  const dir = mkdtempSync(join(worksDir(), '.import-'))
  try {
    const namedFile = clean(filename, 260).split(/[\\/]/).pop().replace(/\.(md|markdown|docx)$/i, '')
    const firstLine = text.trimStart().split('\n', 1)[0].replace(/^#{1,6}\s+/, '').trim()
    const heading = splitBlocks(text).blocks.find((block) => block.type === 'h1')?.text.replace(/^#\s+/, '').trim()
    const name = clean(title, 120) || heading || namedFile || firstLine
    const meta = saveWork({ title: name, draft: text, origin: 'imported', mode: 'import' }, { id, dir })
    renameSync(dir, join(worksDir(), id))
    return meta
  } catch (error) {
    const saved = workMeta(id)
    if (saved?.origin === 'imported') return saved
    throw error
  } finally {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
}

// 正文读取缓存：按文件 mtime 失效，避免每次列表都重读全文
const draftCache = new Map()
function cachedDraft(file) {
  try {
    const mtime = statSync(file).mtimeMs
    const hit = draftCache.get(file)
    if (hit && hit.mtime === mtime) return hit.text
    const text = readText(file)
    draftCache.set(file, { mtime, text })
    return text
  } catch {
    return ''
  }
}

// 列表：只读 meta，正文片段现算（稿库不大，够用）
export function listWorks(q = '', type = 'all') {
  if (!existsSync(worksDir())) return []
  const needle = clean(q, 80).toLowerCase()
  const out = []
  for (const dir of readdirSync(worksDir(), { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith('.')) continue
    const meta = workMeta(dir.name)
    if (!meta) continue
    const t = workType(meta)
    if (type !== 'all' && t !== type && !(type === 'article' && meta.kind === 'article')) continue
    const draft = cachedDraft(workPath(meta.id, 'draft.md'))
    const sources = readText(workPath(meta.id, 'sources.md'))
    const hay = [meta.title, meta.docTypeName, meta.fields && Object.values(meta.fields).join(' '), draft, sources].join('\n').toLowerCase()
    if (needle && !hay.includes(needle)) continue
    // 命中在来源台账里时，片段给台账那一句，并标出来源
    const inSources = Boolean(needle) && !draft.toLowerCase().includes(needle) && sources.toLowerCase().includes(needle)
    out.push({
      ...meta,
      type: t,
      chars: draftStats(draft).chars,
      foundIn: needle ? (inSources ? 'sources' : 'draft') : '',
      snippet: inSources ? snippetOf(sources, needle) : snippetOf(draft, needle),
      hasDraft: Boolean(draft.trim()),
      lastRevisions: readRevisions(meta.id, 2),
    })
  }
  return sortMeta(out)
}

export function readWork(id) {
  const meta = workMeta(id)
  if (!meta) return null
  const draft = readText(workPath(meta.id, 'draft.md'))
  const { blocks } = splitBlocks(draft, { kind: meta.kind })
  const check = readJson(workPath(meta.id, 'check.json'), null)
  const review = readJson(workPath(meta.id, 'review.json'), null)
  const draftHash = shortHash(draft)
  // 机检记的是当时那一版的指纹：正文后来改过，就是「需复检」
  if (check && !check.hash) check.hash = ''
  if (check) check.stale = Boolean(check.hash) && check.hash !== draftHash
  if (review) review.stale = Boolean(review.workHash) && review.workHash !== draftHash
  const versions = listVersions(meta.id)
  const history = editHistory(versions)
  return {
    ...meta,
    type: workType(meta),
    draft,
    draftHash,
    blocks,
    brief: readText(workPath(meta.id, 'brief.md')),
    sources: readText(workPath(meta.id, 'sources.md')),
    outline: readText(workPath(meta.id, 'outline.md')),
    check,
    review,
    versions,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    suggestions: listSuggestions(meta.id, ''),
    revisions: readRevisions(meta.id, 6),
    chars: draftStats(draft).chars,
  }
}

// ---------------- 分析型：提纲与审校记录 ----------------
// 提纲在稿件尚未创建时就要落盘，所以按任务 id 存在 analysis/<jobId>.json。
const analysisDir = () => join(dataDir(), 'analysis')

export function saveAnalysisOutline(jobId, record = {}) {
  const id = String(jobId || '').replace(/[^\w-]/g, '').slice(0, 60)
  if (!id) throw new Error('缺少任务 id')
  ensure(analysisDir())
  const entry = {
    jobId: id,
    outline: String(record.outline || ''),
    mode: record.mode || 'analysis',
    title: String(record.title || ''),
    ok: Boolean(record.ok),
    issues: Array.isArray(record.issues) ? record.issues : [],
    hash: shortHash(String(record.outline || '')),
    at: now(),
  }
  writeAtomic(join(analysisDir(), `${id}.json`), JSON.stringify(entry, null, 2) + '\n')
  return entry
}

export function readAnalysisOutline(jobId) {
  const id = String(jobId || '').replace(/[^\w-]/g, '').slice(0, 60)
  if (!id) return null
  return readJson(join(analysisDir(), `${id}.json`), null)
}

export function saveReview(id, review = {}) {
  const work = workMeta(id)
  if (!work) throw new Error(`找不到稿件 ${id}`)
  const draft = readText(workPath(id, 'draft.md'))
  const entry = {
    ...review,
    workId: id,
    workHash: shortHash(draft),
    at: now(),
  }
  writeAtomic(workPath(id, 'review.json'), JSON.stringify(entry, null, 2) + '\n')
  return entry
}

export function readReview(id) {
  const work = workMeta(id)
  if (!work) return null
  const review = readJson(workPath(id, 'review.json'), null)
  if (review?.workHash) review.stale = review.workHash !== shortHash(readText(workPath(id, 'draft.md')))
  return review
}

// 保存 / 更新。id 存在时覆盖正文；不传 draft 就保留旧正文（只改元信息）。
export function saveWork(input = {}, creation = {}) {
  const old = input.id ? workMeta(input.id) : null
  if (input.id && !old) throw new Error(`找不到稿件 ${input.id}`)
  const id = old?.id || creation.id || newId('w')
  const dir = creation.dir || join(worksDir(), id)
  const kind = old?.origin !== 'imported' && (input.kind === 'official' || old?.kind === 'official') ? 'official' : 'article'
  const origin = old?.origin === 'imported' ? old.origin : clean(input.origin, 20) || old?.origin || 'generated'
  let draft = input.draft === undefined ? readText(join(dir, 'draft.md')) : normalizeText(input.draft)
  if (input.draft !== undefined && origin !== 'imported') draft = draft.trim()
  if (!draft.trim()) throw new Error('正文是空的：draft 不能为空')
  if (input.draft !== undefined && !draft.endsWith('\n')) draft += '\n'
  const stats = draftStats(draft)
  const title = clean(input.title, 120) || old?.title || stats.title || (kind === 'official' ? '未命名公文' : '未命名稿件')
  const meta = {
    id,
    kind,
    articleKind: kind === 'official' ? '' : (['analysis', 'research'].includes(input.articleKind) ? input.articleKind : old?.articleKind || 'analysis'),
    title,
    mode: clean(input.mode, 20) || old?.mode || (kind === 'official' ? 'template' : 'prompt'),
    docType: clean(input.docType, 40) || old?.docType || '',
    docTypeName: clean(input.docTypeName, 40) || old?.docTypeName || '',
    fields: input.fields && typeof input.fields === 'object' ? input.fields : old?.fields || {},
    voiceProfile: clean(input.voiceProfile, 60) || old?.voiceProfile || '',
    origin,
    status: clean(input.status, 20) || old?.status || 'ready',
    jobId: clean(input.jobId, 40) || old?.jobId || '',
    note: clean(input.note, 400) || old?.note || '',
    ...(kind === 'official' ? {
      pageNumber: normalizePageNumber(input.pageNumber ?? old?.pageNumber),
      headerImage: input.headerImage ?? old?.headerImage ?? '',
      footerImage: input.footerImage ?? old?.footerImage ?? '',
    } : {}),
    chars: stats.chars,
    createdAt: old?.createdAt || now(),
    updatedAt: now(),
  }
  const beforeDraft = readText(join(dir, 'draft.md'))
  writeAtomic(join(dir, 'draft.md'), draft)
  if (input.brief !== undefined && String(input.brief).trim()) writeAtomic(join(dir, 'brief.md'), normalizeText(input.brief))
  if (input.sources !== undefined && String(input.sources).trim()) writeAtomic(join(dir, 'sources.md'), normalizeText(input.sources))
  if (input.outline !== undefined && String(input.outline).trim()) writeAtomic(join(dir, 'outline.md'), normalizeText(input.outline))
  if (!old) {
    writeAtomic(join(dir, 'versions', '0001.md'), draft)
    appendRevision(id, { n: 1, action: 'create', note: clean(input.note, 200), from: 0, chars: stats.chars, hash: shortHash(draft) }, dir)
  } else if (origin === 'imported' ? beforeDraft !== draft : beforeDraft.trim() !== draft.trim()) {
    snapshot(id, { action: clean(input.revisionAction, 20) || 'model', note: clean(input.note, 200) })
  }
  writeAtomic(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  return meta
}

export function updateWorkMeta(id, patch = {}) {
  const meta = workMeta(id)
  if (!meta) throw new Error(`找不到稿件 ${id}`)
  const next = {
    ...meta,
    ...(meta.kind === 'official' && patch.pageNumber ? { pageNumber: normalizePageNumber(patch.pageNumber) } : {}),
    ...Object.fromEntries(
      Object.entries(patch).filter(([k]) => ['title', 'docType', 'docTypeName', 'fields', 'voiceProfile', 'status', 'note', 'jobId', 'mode', 'articleKind', 'headerImage', 'footerImage', 'checkOk', 'checkAt', 'chars'].includes(k)),
    ),
    updatedAt: now(),
  }
  writeAtomic(workPath(meta.id, 'meta.json'), JSON.stringify(next, null, 2) + '\n')
  return next
}

export function patchWorkBlocks(id, edits, { action = 'model', note = '' } = {}) {
  const work = readWork(id)
  if (!work) throw new Error(`找不到稿件 ${id}`)
  const result = applyEdits(work.draft, edits, { kind: work.kind })
  if (!result.applied.length) return { ok: false, applied: [], warnings: result.warnings, text: work.draft }
  // 留一份上一版，撤销只用最近一次
  writeAtomic(workPath(id, '_prev.md'), work.draft)
  writeAtomic(workPath(id, 'draft.md'), result.text)
  const stats = draftStats(result.text)
  // 正文里的一级标题就是稿件标题：改了标题，列表和写作台要跟着变
  const nextTitle = (stats.title || '').trim() || work.title
  const meta = { ...work, title: nextTitle, chars: stats.chars, updatedAt: now() }
  delete meta.draft
  delete meta.blocks
  delete meta.canUndo
  delete meta.canRedo
  writeAtomic(
    workPath(id, 'meta.json'),
    JSON.stringify(
      Object.fromEntries(Object.entries(meta).filter(([k]) => !['brief', 'sources', 'outline', 'check', 'revisions'].includes(k))),
      null,
      2,
    ) + '\n',
  )
  snapshot(id, { action, note, from: work.revisions?.[0]?.n || 0 })
  return { ok: true, ...result }
}

// 从保存过的版本重建编辑路径。撤回和重做本身也会写入版本记录。
function editHistory(versions) {
  const undo = []
  const redo = []
  let current = 0
  for (const version of versions.toReversed()) {
    if (version.action === 'undo' && version.from === undo.at(-1)) {
      redo.push(current)
      current = undo.pop()
    } else if (version.action === 'redo' && version.from === redo.at(-1)) {
      undo.push(current)
      current = redo.pop()
    } else {
      if (current) undo.push(current)
      current = version.n
      redo.length = 0
    }
  }
  return { undo, redo }
}

export function revertWork(id, { direction = 'undo', version = 0 } = {}) {
  if (!workMeta(id)) return { ok: false, error: '找不到稿件' }
  const versions = listVersions(id)
  if (version && version !== versions[0]?.n) {
    return { ok: false, status: 409, error: '稿件刚有新改动，请核对正文后再试。' }
  }
  const op = direction === 'redo' ? 'redo' : 'undo'
  const target = editHistory(versions)[op].at(-1)
  if (!target) return { ok: false, error: op === 'redo' ? '没有可重做的改动' : '没有可撤回的改动' }
  return revertToVersion(id, target, op)
}

// ---------------- 版本快照 ----------------
// 每改一次正文存一份 versions/0001.md，改动能逐版恢复；revisions.jsonl 只记目录（n/时间/动作/字数）。
const versionsDirOf = (id) => workPath(id, 'versions')
const versionFile = (id, n) => join(versionsDirOf(id), `${String(n).padStart(4, '0')}.md`)

function versionNumbers(id) {
  const dir = versionsDirOf(id)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => /^\d{4}\.md$/.test(n))
    .map((n) => Number(n.slice(0, 4)))
    .sort((a, b) => a - b)
}

// 第一次用到版本时补种：老稿只有 _prev.md，把它当最早一版，当前正文作为最新一版
export function ensureVersions(id) {
  const nums = versionNumbers(id)
  if (nums.length) return nums
  const draft = readText(workPath(id, 'draft.md'))
  if (!draft.trim()) return []
  const prev = readText(workPath(id, '_prev.md'))
  if (prev.trim()) writeAtomic(versionFile(id, 1), prev)
  writeAtomic(versionFile(id, prev.trim() ? 2 : 1), draft)
  return versionNumbers(id)
}

function snapshot(id, entry = {}) {
  const nums = ensureVersions(id)
  if (!nums.length) return 0
  const draft = readText(workPath(id, 'draft.md'))
  if (!draft.trim()) return 0
  const latest = nums[nums.length - 1]
  const same = readText(versionFile(id, latest)) === draft
  if (same && entry.action !== 'undo' && entry.action !== 'redo') return latest
  const n = latest + 1
  writeAtomic(versionFile(id, n), draft)
  appendRevision(id, {
    n,
    action: entry.action || 'edit',
    note: entry.note || '',
    from: entry.from || 0,
    chars: draftStats(draft).chars,
    hash: shortHash(draft),
  })
  return n
}

export function listVersions(id) {
  ensureVersions(id)
  const nums = versionNumbers(id)
  const log = readRevisions(id, Infinity)
  const byN = new Map(log.filter((e) => e && e.n).map((e) => [e.n, e]))
  return nums
    .map((n) => {
      const entry = byN.get(n) || {}
      // 字数按当前口径重算：历史版本里存的是当时的字符数，直接显示会和正文/稿件库对不上
      const text = readText(versionFile(id, n))
      const chars = text.trim() ? draftStats(text).chars : entry.chars || 0
      return { n, at: entry.at || '', action: entry.action || 'edit', note: entry.note || '', from: entry.from || 0, chars }
    })
    .reverse()
}

export function readVersion(id, n) {
  const num = Number(n)
  if (!Number.isInteger(num) || num < 1) return ''
  return readText(versionFile(id, num))
}

// 回到第 n 版：改完再存一份新快照，历史不丢
export function revertToVersion(id, n, action = 'restore') {
  const meta = workMeta(id)
  if (!meta) return { ok: false, error: '找不到稿件' }
  const text = readVersion(id, n)
  if (!text.trim()) return { ok: false, error: `第 ${n} 版是空的，没法恢复` }
  const stats = draftStats(text)
  writeAtomic(workPath(id, 'draft.md'), text)
  updateWorkMeta(id, { chars: stats.chars, title: (stats.title || '').trim() || meta.title })
  const verb = { undo: '撤回改动', redo: '重做改动', restore: '恢复版本' }[action]
  const nn = snapshot(id, { action, from: Number(n), note: `${verb} · 第 ${n} 版` })
  return { ok: true, chars: stats.chars, n: nn }
}

// ---------------- 回收区 ----------------
const trashDir = () => join(worksDir(), '.trash')

export function listTrash() {
  const dir = trashDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const [id, stamp] = d.name.split('__')
      const meta = readJson(join(dir, d.name, 'meta.json'), null)
      return {
        name: d.name,
        id: id || '',
        title: meta?.title || '（没有标题）',
        kind: meta?.kind || 'article',
        docTypeName: meta?.docTypeName || '',
        deletedAt: (stamp || '').replace(/-/g, (m, i) => (i === 4 || i === 7 ? m : m)),
        at: stamp || '',
      }
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

export function restoreWork(name) {
  const safe = String(name || '').replace(/[\\/]/g, '')
  if (!safe || safe.includes('..')) return { ok: false, error: '名字不合法' }
  const from = join(trashDir(), safe)
  if (!existsSync(from)) return { ok: false, error: '回收区里没有这一项' }
  const id = safe.split('__')[0]
  if (!ID_RE.test(id)) return { ok: false, error: '这一项不是稿件' }
  const to = join(worksDir(), id)
  if (existsSync(to)) return { ok: false, error: '同 id 的稿件已经在了，先处理它再恢复' }
  renameSync(from, to)
  return { ok: true, id }
}

export function deleteWork(id) {
  if (!ID_RE.test(String(id))) return false
  const dir = join(worksDir(), String(id))
  if (!existsSync(dir)) return false
  // 先进回收区，用户可以恢复
  ensure(trashDir())
  const stamp = now().replace(/[:.]/g, '-')
  renameSync(dir, join(trashDir(), `${id}__${stamp}`))
  return true
}

export function appendRevision(id, entry, dir = workPath(id, '')) {
  const file = join(dir, 'revisions.jsonl')
  ensure(dir)
  const line = JSON.stringify({ at: now(), ...entry }).replace(/\n/g, ' ')
  writeFileSync(file, `${line}\n`, { flag: 'a' })
}

export function readRevisions(id, limit = 20) {
  const file = workPath(id, 'revisions.jsonl')
  if (!existsSync(file)) return []
  const lines = readText(file).split('\n').filter(Boolean)
  return lines
    .slice(-limit)
    .reverse()
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export function saveCheck(id, result) {
  const draft = readText(workPath(id, 'draft.md'))
  const hash = shortHash(draft)
  writeAtomic(workPath(id, 'check.json'), JSON.stringify({ at: now(), ...result, hash, chars: draftStats(draft).chars }, null, 2) + '\n')
  // 列表里要显示机检状态，顺手写进 meta
  try {
    updateWorkMeta(id, { checkOk: Boolean(result.ok), checkAt: now() })
  } catch {}
}

export function exportFile(name) {
  return join(exportsDir(), name)
}

export function listExports(id) {
  const prefix = `${id}-`
  try {
    return readdirSync(exportsDir())
      .filter((n) => n.startsWith(prefix) && /\.docx$/i.test(n))
      .map((n) => ({ name: n, at: statSync(join(exportsDir(), n)).mtime.toISOString(), size: statSync(join(exportsDir(), n)).size }))
      .sort((a, b) => b.at.localeCompare(a.at))
  } catch {
    return []
  }
}

// ---------------- 改稿建议 ----------------
// 模型改这一段时先存成建议（原句 / 新句 / 原因），用户采用后才写进正文。
const suggestionsFile = (id) => workPath(id, 'suggestions.json')

export function listSuggestions(id, status = 'pending') {
  const all = readJson(suggestionsFile(id), [])
  if (!Array.isArray(all)) return []
  return status ? all.filter((s) => s && s.status === status) : all
}

export function addSuggestion(id, { blockId = '', hash = '', original = '', proposed = '', reason = '', jobId = '' } = {}) {
  const work = readWork(id)
  if (!work) throw new Error('找不到稿件')
  const target = work.blocks.find((b) => b.id === blockId)
  if (!proposed.trim()) throw new Error('建议的正文是空的')
  const all = readJson(suggestionsFile(id), [])
  const list = Array.isArray(all) ? all : []
  const entry = {
    id: `s-${randomUUID().slice(0, 6)}`,
    at: now(),
    blockId,
    hash: hash || target?.hash || '',
    original: original || target?.text || '',
    proposed: proposed.trim(),
    reason: String(reason || '').slice(0, 300),
    jobId: String(jobId || '').slice(0, 40),
    status: 'pending',
  }
  list.push(entry)
  writeAtomic(suggestionsFile(id), JSON.stringify(list, null, 2) + '\n')
  return entry
}

export function setSuggestionStatus(id, sid, status) {
  const all = readJson(suggestionsFile(id), [])
  const list = Array.isArray(all) ? all : []
  const hit = list.find((s) => s && s.id === sid)
  if (!hit) throw new Error('找不到这条建议')
  hit.status = status
  hit.resolvedAt = now()
  writeAtomic(suggestionsFile(id), JSON.stringify(list, null, 2) + '\n')
  return hit
}

// ---------------- 语气档案 ----------------
const ACTIVE_FILE = () => join(voiceDir(), 'active')

function voiceKey(name) {
  const key = clean(name, 60)
  if (/^[.]|[.]$|[\\/:*?"<>|\x00-\x1f]/.test(key) || /^(active|__none__)$/i.test(key) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(key)) {
    throw new Error('档案名不能用作本地文件夹，请更换名称')
  }
  return key
}

const profileDir = (name) => join(voiceDir(), voiceKey(name))

export function activeVoice() {
  try {
    const key = voiceKey(readText(ACTIVE_FILE()))
    return key && readText(join(profileDir(key), 'profile.md')).trim() ? key : ''
  } catch {
    return ''
  }
}

export function setActiveVoice(name) {
  const key = voiceKey(name)
  if (key && !readText(join(profileDir(key), 'profile.md')).trim()) {
    throw new Error('请先提炼或编辑保存档案，再设为默认')
  }
  ensure(voiceDir())
  writeAtomic(ACTIVE_FILE(), key)
  return key
}

export function listVoice() {
  if (!existsSync(voiceDir())) return []
  const active = activeVoice()
  return readdirSync(voiceDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const profile = readText(join(voiceDir(), d.name, 'profile.md'))
      const index = readJson(join(voiceDir(), d.name, 'index.json'), { samples: [] })
      const samples = Array.isArray(index.samples) ? index.samples : []
      const sampleChars = samples.reduce((n, s) => n + (s.chars || 0), 0)
      return {
        name: d.name,
        active: d.name === active,
        chars: profile.length,
        samples: samples.length,
        sampleChars,
        sampleList: samples.map((s) => ({ title: s.title, chars: s.chars || 0 })),
        confidence: samples.length >= 3 && sampleChars >= 1500 ? '中等' : '较低',
        preview: profile.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim().slice(0, 90) || '',
        updatedAt: index.updatedAt || '',
      }
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export function readVoice(name, { includeCorpus = true } = {}) {
  const key = voiceKey(name) || activeVoice()
  if (!key) return null
  const profile = readText(join(voiceDir(), key, 'profile.md'))
  const index = readJson(join(voiceDir(), key, 'index.json'), { samples: [] })
  return {
    name: key,
    active: key === activeVoice(),
    profile,
    chars: profile.length,
    samples: Array.isArray(index.samples) ? index.samples : [],
    ...(includeCorpus ? { corpus: readText(join(voiceDir(), key, 'corpus.md')) } : {}),
    updatedAt: index.updatedAt || '',
    profileJobId: index.profileJobId || '',
    exists: Boolean(profile.trim()),
  }
}

export function saveVoice(name, text, { jobId = '' } = {}) {
  const key = voiceKey(name) || '我的语气'
  const body = normalizeText(text).trim()
  if (!body) throw new Error('档案内容是空的')
  // 老版本上传样本时会写默认标记。尚无档案正文的遗留标记不能在此次保存时生效。
  if (clean(readText(ACTIVE_FILE()), 60) === key && !activeVoice()) setActiveVoice('')
  ensure(profileDir(key))
  writeAtomic(join(voiceDir(), key, 'profile.md'), `${body}\n`)
  const index = readJson(join(voiceDir(), key, 'index.json'), { samples: [] })
  writeAtomic(join(voiceDir(), key, 'index.json'), JSON.stringify({ ...index, profileJobId: jobId, updatedAt: now() }, null, 2) + '\n')
  return readVoice(key)
}

export function addVoiceSample(name, { title, text, origin = 'upload' }) {
  const key = voiceKey(name) || '我的语气'
  const dir = profileDir(key)
  const body = normalizeText(text).trim()
  if (!body) throw new Error('样本是空的')
  ensure(join(dir, 'samples'))
  const index = readJson(join(dir, 'index.json'), { samples: [] })
  const hash = shortHash(body)
  const samples = Array.isArray(index.samples) ? index.samples : []
  if (samples.some((s) => s.hash === hash)) return { added: false, duplicate: true, samples }
  const n = samples.length + 1
  const safeTitle = clean(title, 80).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || `样本${n}`
  const file = `s-${String(n).padStart(3, '0')}-${safeTitle}.md`
  writeAtomic(join(dir, 'samples', file), `${body}\n`)
  const record = { file, title: clean(title, 120) || safeTitle, hash, chars: body.length, origin, addedAt: now() }
  const next = [...samples, record]
  writeAtomic(join(dir, 'index.json'), JSON.stringify({ ...index, samples: next, updatedAt: now() }, null, 2) + '\n')
  const corpus = next.map((s, k) => `## 样本 ${k + 1}：${s.title}\n\n${readText(join(dir, 'samples', s.file))}`).join('\n---\n\n')
  writeAtomic(join(dir, 'corpus.md'), `# 语料合集（${next.length} 篇，${next.reduce((n, s) => n + (s.chars || 0), 0)} 字）\n\n${corpus}`)
  return { added: true, samples: next, count: next.length }
}

export const voiceSampleStamp = (samples) => shortHash(JSON.stringify(samples))

export function voiceLearningInput(name) {
  const voice = readVoice(name, { includeCorpus: false })
  if (!voice?.samples.length) throw new Error('请先添加可读的旧稿')
  const count = Math.min(voice.samples.length, 24)
  const budget = Math.min(8000, Math.floor(36000 / count))
  const excerpts = Array.from({ length: count }, (_, i) => {
    const index = count === 1 ? 0 : Math.round(i * (voice.samples.length - 1) / (count - 1))
    const sample = voice.samples[index]
    const file = String(sample.file || '')
    const body = file && !/[\\/:]/.test(file) && file !== '..' && file !== '.'
      ? readText(join(profileDir(voice.name), 'samples', file)).trim()
      : ''
    if (!body) return null
    if (body.length <= budget) return { title: sample.title, text: body }
    const piece = Math.floor(budget / 3)
    const middle = Math.floor((body.length - piece) / 2)
    return { title: sample.title, text: [body.slice(0, piece), body.slice(middle, middle + piece), body.slice(-piece)].join('\n\n〔节选间有省略〕\n\n') }
  }).filter(Boolean)
  if (!excerpts.length) throw new Error('找不到可读取的旧稿，请重新添加')
  return {
    profile: voice.name,
    examples: excerpts,
    count: voice.samples.length,
    sampledChars: excerpts.reduce((n, sample) => n + sample.text.length, 0),
    sampleStamp: voiceSampleStamp(voice.samples),
    profileHash: shortHash(voice.profile),
  }
}

const voiceTrashDir = () => join(voiceDir(), '.trash')
const trashedVoiceParts = (name) => /^(.*)__(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/.exec(name)

export function deleteVoice(id) {
  const key = voiceKey(id)
  if (!key) return false
  const dir = profileDir(key)
  if (!existsSync(dir)) return false
  const wasActive = activeVoice() === key
  // 先进回收区：删错了还能恢复
  ensure(voiceTrashDir())
  const stamp = now().replace(/[:.]/g, '-')
  renameSync(dir, join(voiceTrashDir(), `${key}__${stamp}`))
  if (wasActive) writeAtomic(ACTIVE_FILE(), '')
  return true
}

export function listVoiceTrash() {
  const dir = voiceTrashDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const [, id, stamp] = trashedVoiceParts(d.name) || []
      const meta = readJson(join(dir, d.name, 'index.json'), null)
      return { name: d.name, id, title: meta?.name || id || '（没有名字）', samples: meta?.samples?.length || 0, at: stamp || '' }
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

export function restoreVoice(name) {
  const item = typeof name === 'string' && trashedVoiceParts(name)
  if (!item || !voiceKey(item[1])) return { ok: false, error: '名字不合法' }
  const [, id] = item
  const from = join(voiceTrashDir(), name)
  if (!existsSync(from)) return { ok: false, error: '回收区里没有这一项' }
  const to = profileDir(id)
  if (existsSync(to)) return { ok: false, error: '同名档案已经在了' }
  renameSync(from, to)
  return { ok: true, id }
}

export function stats() {
  const works = listWorks()
  const voice = listVoice()
  return {
    works: works.length,
    articles: works.filter((w) => w.kind === 'article').length,
    official: works.filter((w) => w.kind === 'official').length,
    chars: works.reduce((n, w) => n + (w.chars || 0), 0),
    voiceProfiles: voice.length,
    activeVoice: activeVoice(),
    updatedAt: works[0]?.updatedAt || '',
  }
}
