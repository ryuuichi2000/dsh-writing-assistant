// 证据：把来源台账切成条目，给正文的每一段找依据；没有依据的数字和引语标出来。
// 只用本机文件，不联网。
import { parseLedgerDetailed, reviewArticle } from './analysis.js'

const NUM_RE = /\d+(?:\.\d+)?\s*(?:%|％|亿|万|千|百|元|人|家|款|年|个月|天|分钟|美元)/g
const QUOTE_RE = /[「“"]([^」”"]{4,60})[」”"]/g
const norm = (s) => String(s || '').replace(/\s/g, '').replace(/％/g, '%')

// 兼容旧接口：默认只把「来源」「口径」当证据；「本文推算」「待核」单独保留类型。
export function parseLedger(text) {
  return parseLedgerDetailed(text).map((e) => ({ text: e.text, plain: e.plain, link: e.link, section: e.section, kind: e.kind, numbers: e.numbers }))
}

// 4 字滑窗做粗匹配：中文里足够分辨是不是同一件事
function grams(text, n = 4) {
  const clean = String(text || '').replace(/[\s\p{P}]/gu, '')
  const out = new Set()
  for (let i = 0; i + n <= clean.length; i++) out.add(clean.slice(i, i + n))
  return out
}

export function matchEvidence(blockText, entries) {
  const target = grams(blockText)
  if (!target.size) return []
  const pool = entries.filter((e) => !e.kind || e.kind === 'source' || e.kind === 'scope')
  const scored = pool.map((e) => {
    let hit = 0
    for (const g of grams(e.plain)) if (target.has(g)) hit++
    return { ...e, score: hit }
  })
  return scored
    .filter((e) => e.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
}

// 文章检查：数字、引语、待核、编号是否对得上台账。
// 语义层面的「主张—来源—结论强度」由 reviewArticle 负责，两者分开记。
export function auditArticle(draft, sources) {
  const items = []
  const entries = parseLedgerDetailed(sources)
  const sourceText = entries.filter((e) => e.kind === 'source' || e.kind === 'scope').map((e) => e.plain).join('\n')
  const authorText = entries.filter((e) => e.kind === 'author').map((e) => e.plain).join('\n')
  const pendingText = entries.filter((e) => e.kind === 'pending').map((e) => e.plain).join('\n')
  const blocks = String(draft || '')
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
  // 台账里只有年份、没有可核的数据时，不拿“数字不在台账”去拦行内引用的普通判断；
  // 有具体数字的台账才逐项核对。
  const numericSource = (sourceText.match(NUM_RE) || []).some((n) => !/^\d{4}\s*年$/.test(n.trim()))
  const refIndex = blocks.findIndex((b) => /^##\s*参考资料/.test(b))

  blocks.forEach((block, index) => {
    // 参考资料里的标题、URL 和转述不是正文主张，不参与数字/引语核对
    if (refIndex >= 0 && index > refIndex) return
    const at = block.slice(0, 24).replace(/\s+/g, ' ')
    const numbers = (block.match(NUM_RE) || []).filter((n) => !/^\d{4}\s*年$/.test(n.trim()))
    if (!entries.length) return
    if (numericSource) for (const num of numbers.slice(0, 3)) {
      const bare = norm(num)
      if (norm(sourceText).includes(bare)) continue
      if (norm(authorText).includes(bare)) {
        // 作者推算可以出现，但不能写成外部来源
        if (/据|根据|统计|报告|显示|数据显示/.test(block)) {
          items.push({ level: 'warn', kind: 'derived-as-source', blockIndex: index, excerpt: at, message: `「${num}」只在「本文推算」里出现，却被写成外部数据；作者推算不能冒充来源。` })
        }
        continue
      }
      if (norm(pendingText).includes(bare)) {
        items.push({ level: 'warn', kind: 'pending-number', blockIndex: index, excerpt: at, message: `「${num}」只在「待核」备注里出现，不能当已核实数据写进正文。` })
        continue
      }
      items.push({ level: 'warn', kind: 'number', blockIndex: index, excerpt: at, message: `「${num}」在来源台账里找不到对应数据` })
    }
    for (const m of block.matchAll(QUOTE_RE)) {
      const quote = m[1].trim()
      if (quote.length < 4) continue
      if (sourceText.includes(quote) || authorText.includes(quote)) continue
      if (pendingText.includes(quote)) {
        items.push({ level: 'warn', kind: 'pending-quote', blockIndex: index, excerpt: at, message: `直接引语「${quote.slice(0, 18)}…」只出现在待核备注里，不能当已核实原文` })
      } else {
        items.push({ level: 'warn', kind: 'quote', blockIndex: index, excerpt: at, message: `直接引语「${quote.slice(0, 18)}…」在台账里没有原文` })
      }
    }
  })

  if (!entries.length && /\d/.test(String(draft))) {
    items.unshift({ level: 'info', kind: 'empty-ledger', excerpt: '', message: '这篇没有来源台账：正文里的数字和引语无法核对，建议先补台账' })
  }
  const pending = (String(draft).match(/待核|待核实/g) || []).length
  if (pending) items.push({ level: 'info', kind: 'pending', excerpt: '', message: `正文还有 ${pending} 处「待核」，发文前要补上或删掉` })

  const cites = [...String(draft).matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]))
  if (cites.length) {
    const hasRef = /^#{1,6}\s*参考资料/m.test(draft)
    if (!hasRef) items.push({ level: 'warn', kind: 'noref', excerpt: '', message: '正文用了编号引用，但文末没有「参考资料」章节' })
    const max = Math.max(...cites)
    const missing = []
    for (let n = 1; n <= max; n++) if (!cites.includes(n)) missing.push(n)
    if (missing.length) items.push({ level: 'warn', kind: 'gap', excerpt: '', message: `参考编号不连续，缺 [${missing.join('、')}]` })
  }

  return items
}

// 一次给出程序检查和语义检查；调用方把 review 存进稿件，界面和任务都读同一份。
export function auditAnalysis(draft, sources, options = {}) {
  const items = auditArticle(draft, sources)
  const review = reviewArticle(draft, sources, options)
  return { items, review, ok: review.ok, blocking: review.blocking }
}
