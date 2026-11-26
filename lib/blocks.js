// 稿件的块解析：把 draft.md 切成可定位、可校验的块。
// 为什么按块：预览里选中的是渲染后的文字，源文件是 Markdown；按字符偏移映射回去遇到粗体、链接、
// 角标就会错位。按块（段落 / 标题 / 列表 / 表格 / 引用 / 代码）定位，模型的输入是「整块原文 + 指令」，
// 输出是「整块新原文」，写回时用 id + 哈希 + 原文三重校验。
import { createHash } from 'node:crypto'

const STRUCT_HEADS = ['标题', '题注', '主送单位', '正文', '落款', '附注', '版记', '附件', '附件说明', '附图', '称谓', '报送对象', '会议信息', '抄送', '印发']
const ROLE_OF = {
  题注: 'caption',
  主送单位: 'recipient',
  报送对象: 'recipient',
  称谓: 'recipient',
  落款: 'signature',
  附注: 'note',
  版记: 'colophon',
  附件: 'note',
  附件说明: 'note',
  附图: 'note',
  会议信息: 'info',
}
const HEAD_KEYS = new Set(STRUCT_HEADS)

export const shortHash = (text) => createHash('sha1').update(String(text)).digest('hex').slice(0, 10)
export const normalizeText = (v) => String(v ?? '').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')

const isFence = (l) => /^\s*(```|~~~)/.test(l)
const isHeading = (l) => /^(#{1,6})\s+/.test(l)
const isQuote = (l) => /^\s*>/.test(l)
const isListItem = (l) => /^\s*([-*+]|\d+[.)])\s+/.test(l)
const isHr = (l) => /^\s*([-*_])\1{2,}\s*$/.test(l) && !l.includes('|')
const isTableRow = (l) => l.includes('|')
const isTableSep = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-')

const headName = (line) => (line.match(/^(#{1,6})\s+(.*?)\s*$/) || [])[2]?.replace(/\s*[（(]可选[^）)]*[）)]\s*$/, '').trim() || ''

// 切成块。kind=official 时把「标题 / 主送单位 / 正文 / 落款 …」这些板块名当结构标签，
// 只用来决定渲染位置和样式，不当作正文标题显示。
export function splitBlocks(markdown, { kind = 'article' } = {}) {
  const text = normalizeText(markdown)
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  // 跳过 frontmatter
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---')
    if (end > 0) i = end + 1
  }
  let section = ''

  const push = (start, end, type, extra = {}) => {
    const raw = lines.slice(start, end).join('\n')
    const trimmed = raw.replace(/^\n+|\n+$/g, '')
    if (!trimmed.trim()) return
    // 板块内的每一块都继承板块的显示角色：落款里的两行要右对齐、附注要小字、会议信息成块。
    const sectionRole = ROLE_OF[section] || 'body'
    blocks.push({
      id: `b${blocks.length + 1}`,
      type,
      role: extra.role || sectionRole,
      section,
      text: trimmed,
      hash: shortHash(trimmed),
      start,
      end,
      ...(extra.level ? { level: extra.level } : {}),
    })
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    // 注释块整体跳过（导出时会删掉，预览也不必显示）
    if (/^\s*<!--/.test(line)) {
      let j = i
      while (j < lines.length && !/-->/.test(lines[j])) j++
      i = Math.min(j + 1, lines.length)
      continue
    }
    if (isFence(line)) {
      let j = i + 1
      while (j < lines.length && !isFence(lines[j])) j++
      push(i, Math.min(j + 1, lines.length), 'code')
      i = Math.min(j + 1, lines.length)
      continue
    }
    if (isHr(line)) {
      push(i, i + 1, 'hr')
      i++
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const name = headName(line)
      if (level === 2 && HEAD_KEYS.has(name)) {
        section = name
        push(i, i + 1, 'section', { role: ROLE_OF[name] || 'body', level })
      } else {
        push(i, i + 1, `h${level}`, { level })
      }
      i++
      continue
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      let j = i + 2
      while (j < lines.length && isTableRow(lines[j]) && lines[j].trim()) j++
      push(i, j, 'table')
      i = j
      continue
    }
    if (isQuote(line)) {
      let j = i
      while (j < lines.length && isQuote(lines[j])) j++
      push(i, j, 'quote')
      i = j
      continue
    }
    if (isListItem(line)) {
      let j = i
      while (j < lines.length && (isListItem(lines[j]) || (lines[j].trim() === '' && isListItem(lines[j + 1] || '')))) j++
      push(i, j, 'list')
      i = j
      continue
    }
    let j = i + 1
    while (
      j < lines.length &&
      lines[j].trim() &&
      !isHeading(lines[j]) &&
      !isFence(lines[j]) &&
      !isQuote(lines[j]) &&
      !isListItem(lines[j]) &&
      !isHr(lines[j]) &&
      !/^\s*<!--/.test(lines[j]) &&
      !(isTableRow(lines[j]) && isTableSep(lines[j + 1] || ''))
    ) {
      j++
    }
    push(i, j, 'p')
    i = j
  }
  return { blocks, lines, text }
}

// 写回：replace / insert / delete。edits 里每个块必须带 id 和 expect（原文哈希），
// 哈希对不上说明预览是旧的，直接拒绝，不静默改错。
export function applyEdits(markdown, edits, { kind = 'article' } = {}) {
  const { blocks, lines } = splitBlocks(markdown, { kind })
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const applied = []
  const warnings = []
  // 从后往前改，避免行号漂移
  const ops = []
  for (const e of edits || []) {
    const block = byId.get(String(e.blockId || ''))
    if (e.action === 'insert') {
      const anchorId = e.beforeId || e.afterId || e.blockId
      const anchor = byId.get(String(anchorId || ''))
      if (!anchor && (anchorId || blocks.length)) {
        warnings.push(`找不到插入位置${anchorId ? ` ${anchorId}` : ''}`)
        continue
      }
      if (e.expect && anchor?.hash !== e.expect) {
        warnings.push('插入位置已经变化，请刷新预览后再试')
        continue
      }
      const content = normalizeText(e.content).trim()
      if (!content) {
        warnings.push('插入的内容是空的，已跳过')
        continue
      }
      // 前后各留一个空行，但不能因此多出连续空行（那会把正文改乱）
      const at = anchor ? (e.beforeId ? anchor.start : anchor.end) : lines.length
      const add = content.split('\n')
      if (lines[at - 1]?.trim()) add.unshift('')
      if (lines[at]?.trim()) add.push('')
      ops.push({ at, del: 0, add })
      applied.push({ blockId: anchorId || '', action: 'insert' })
      continue
    }
    if (!block) {
      warnings.push(`找不到块 ${e.blockId}`)
      continue
    }
    if (e.expect && block.hash !== e.expect) {
      warnings.push(`块 ${e.blockId} 的内容已经变了（预览是旧的），已跳过`)
      continue
    }
    if (e.action === 'move') {
      const i = blocks.findIndex((x) => x.id === block.id)
      const j = i + (Number(e.dir) < 0 ? -1 : 1)
      const other = blocks[j]
      if (!other) {
        warnings.push(`${e.blockId} 已经在${Number(e.dir) < 0 ? '第一' : '最后'}段`)
        continue
      }
      if (block.type === 'section' || other.type === 'section' || /^#{1,6}\s/.test(block.text) && block.type === 'h1') {
        warnings.push('结构板块和主标题不能移动')
        continue
      }
      ops.push({ at: other.start, del: other.end - other.start, add: block.text.split('\n') })
      ops.push({ at: block.start, del: block.end - block.start, add: other.text.split('\n') })
      applied.push({ blockId: block.id, action: 'move', into: other.id })
      continue
    }
    if (e.action === 'merge') {
      const i = blocks.findIndex((x) => x.id === block.id)
      const prev = i > 0 ? blocks[i - 1] : null
      if (!prev) {
        warnings.push(`${e.blockId} 是这一段的第一块，上面没有可合并的段落`)
        continue
      }
      if (prev.type === 'section' || block.type === 'section' || /^#{1,6}\s/.test(prev.text) || /^#{1,6}\s/.test(block.text)) {
        warnings.push('标题类板块不能合并')
        continue
      }
      if (!block.text.trim()) {
        warnings.push('这一段是空的，没法合并')
        continue
      }
      const head = prev.text.trimEnd()
      const tail = block.text.trim()
      const glue = /[\u4e00-\u9fa5，。、；：）】》”"]$/.test(head) ? '' : ' '
      const merged = head + glue + tail
      ops.push({ at: prev.start, del: prev.end - prev.start, add: merged.split('\n') })
      ops.push({ at: block.start, del: block.end - block.start, add: [] })
      applied.push({ blockId: block.id, action: 'merge', into: prev.id })
      continue
    }
    if (e.action === 'delete') {
      ops.push({ at: block.start, del: block.end - block.start, add: [] })
      applied.push({ blockId: block.id, action: 'delete' })
      continue
    }
    const content = normalizeText(e.content).trim()
    if (!content) {
      warnings.push(`块 ${e.blockId} 的新内容为空，已跳过`)
      continue
    }
    ops.push({ at: block.start, del: block.end - block.start, add: content.split('\n') })
    applied.push({ blockId: block.id, action: 'replace' })
  }
  ops.sort((a, b) => b.at - a.at)
  const out = [...lines]
  for (const op of ops) out.splice(op.at, op.del, ...op.add)
  // 只去掉开头多出来的空行：正文里原有的空行、行尾空格（Markdown 硬换行）一律不动
  let next = out.join('\n').replace(/^\n+/, '')
  if (!next.endsWith('\n')) next += '\n'
  return { text: next, applied, warnings }
}

// 从 Markdown 里取标题 / 统计字数。
// 字数口径与中文写作的习惯一致：「字数」数的是正文里的汉字（一字算一个）与西文词（一个词算一个），
// 标点、空格、Markdown 标记、表格线、链接地址都不算。文末「参考资料 / 参考文献 / 参考来源」是
// 出处清单，不计入正文字数——它只列来源，不承载论证。旧实现按「去掉标记后的字符数」算，
// 标点和链接地址也一个个计入，一篇约 3700 汉字的稿子会显示成 7000 多字。
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3007]/g
const WORD_RE = /[A-Za-z]+(?:['’\-][A-Za-z]+)*|\d+(?:[.,]\d+)*/g

// 正文范围：取最后一个「参考资料 / 参考文献 / 参考来源」标题之前的部分
function bodyOnly(text) {
  const re = /^#{1,6}\s*(参考资料|参考文献|参考来源)\s*$/gm
  let cut = -1
  for (const m of text.matchAll(re)) cut = m.index
  return cut > 0 ? text.slice(0, cut) : text
}

// 去掉 Markdown 标记、链接与表格线，只留能读的字词
function plainForCount(markdown) {
  return normalizeText(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/[*_`~]/g, '')
}

export function countWords(text, { body = true } = {}) {
  const source = normalizeText(text)
  const plain = plainForCount(body ? bodyOnly(source) : source)
  return (plain.match(CJK_RE) || []).length + (plain.match(WORD_RE) || []).length
}

export function draftStats(markdown) {
  const text = normalizeText(markdown)
  const title = (text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || ''
  return { title, chars: countWords(text), charsAll: countWords(text, { body: false }) }
}
