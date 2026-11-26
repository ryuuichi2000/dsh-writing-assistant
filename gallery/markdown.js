// 极简 Markdown 渲染：标题、表格、引用、列表、代码块、链接、粗体、段内换行。
// 只用于展示稿件（内容来自模型或用户），所有文本先转义再拼 HTML。
// 单块渲染：预览按块渲染，块级包裹由 app.js 负责（带 data-bid、可选中、可改）。
;(function () {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  const safeUrl = (u) => (/^(https?:)?\/\//i.test(u) || /^mailto:/i.test(u) ? u : '#')

  function inline(raw) {
    let s = esc(raw)
    const codes = []
    s = s.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(`<code>${code}</code>`)
      return `\u0001C${codes.length - 1}\u0001`
    })
    const links = []
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      links.push(`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${label}</a>`)
      return `\u0001L${links.length - 1}\u0001`
    })
    s = s.replace(/(^|[\s(（])((?:https?:\/\/)[^\s<)）]+)/g, (m, pre, url) => `${pre}<a href="${esc(url)}" target="_blank" rel="noopener">${url}</a>`)
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    s = s.replace(/\u0001C(\d+)\u0001/g, (_, i) => codes[+i])
    s = s.replace(/\u0001L(\d+)\u0001/g, (_, i) => links[+i])
    return s
  }

  const splitRow = (line) => {
    let l = line.trim()
    if (l.startsWith('|')) l = l.slice(1)
    if (l.endsWith('|')) l = l.slice(0, -1)
    return l.split('|').map((c) => c.trim())
  }
  const isSep = (line) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')

  // 单块渲染：输入是一块的原始 Markdown，输出 HTML（不含外层 .blk）
  function block(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
    const out = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) {
        i++
        continue
      }
      if (/^```/.test(line.trim())) {
        const buf = []
        i++
        while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++])
        i++
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`)
        continue
      }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line) && !line.includes('|')) {
        out.push('<hr>')
        i++
        continue
      }
      const h = /^(#{1,6})\s+(.*)$/.exec(line)
      if (h) {
        out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
        i++
        continue
      }
      if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
        const head = splitRow(line)
        i += 2
        const rows = []
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]))
        out.push(
          `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
            .map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`,
        )
        continue
      }
      if (/^\s*>/.test(line)) {
        const buf = []
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
        out.push(`<blockquote>${buf.map((b) => (b.trim() ? `<p>${inline(b)}</p>` : '')).join('')}</blockquote>`)
        continue
      }
      const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line)
      if (li) {
        const ordered = /\d+[.)]/.test(li[1])
        const items = []
        while (i < lines.length) {
          const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
          if (!m || /\d+[.)]/.test(m[1]) !== ordered) break
          items.push(`<li>${inline(m[2])}</li>`)
          i++
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
        continue
      }
      const para = [line]
      i++
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i]) &&
        !(lines[i].includes('|') && i + 1 < lines.length && isSep(lines[i + 1]))
      ) {
        para.push(lines[i++])
      }
      out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    }
    return out.join('\n')
  }

  // 整篇渲染（用于体裁说明、来源台账之类的只读文本）
  function render(md) {
    return String(md || '')
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((b) => block(b.trim()))
      .join('\n')
  }

  window.WA_MD = { render, block, inline }
})()
