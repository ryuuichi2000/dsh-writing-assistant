// 写作助手 · HTTP 半边（Host）
// 页面要的东西都从这里出：目录、稿件增删改查、逐块编辑与撤回、语气档案、后台任务、导出 Word、机检。
// 单独抽出来是为了能用 scripts/dev-server.mjs 在浏览器里预览，不必启动整个 dsh。
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { pageNumbers, normalizePageNumber } from './page-numbers.js'
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { DOC_TYPES, docTypeById, docTypeByName } from './docs.js'
import { addDocImage, docImageDir, listDocImages, removeDocImage } from './docimages.js'
import { checkDraft, exportArticle, extractDocx, findPython, generateDocx, verifyDocx } from './python.js'
import { auditAnalysis, matchEvidence, parseLedger } from './evidence.js'
import { detectAnalysisMode } from './analysis.js'
import {
  activeVoice,
  addVoiceSample,
  dataDir,
  deleteVoice,
  deleteWork,
  exportsDir,
  importWork,
  listExports,
  listVoice,
  listVoiceTrash,
  listSuggestions,
  listWorks,
  addSuggestion,
  setSuggestionStatus,
  restoreVoice,
  patchWorkBlocks,
  readVoice,
  readWork,
  revertWork,
  listTrash,
  listVersions,
  readVersion,
  restoreWork,
  revertToVersion,
  saveCheck,
  saveReview,
  saveVoice,
  saveWork,
  setActiveVoice,
  stats,
  updateWorkMeta,
  worksDir,
} from './store.js'

export const BASE = '/writing-assistant'

export function skillDirOf(root) {
  return join(root, 'skills', 'official-document-drafting')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
}

// 只在 dir 里面找文件：拒绝 ..、点文件和目录外的符号链接
export function safeFile(dir, rel) {
  if (!dir || !rel || rel.split('/').some((p) => p.startsWith('.'))) return null
  let base
  try {
    base = realpathSync(dir)
  } catch {
    return null
  }
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}

function revealFile(file) {
  const opts = { detached: true, stdio: 'ignore' }
  const child =
    process.platform === 'win32'
      ? spawn('explorer.exe', [`/select,${file}`], opts)
      : process.platform === 'darwin'
        ? spawn('open', ['-R', file], opts)
        : spawn('xdg-open', [dirname(file)], opts)
  child.on('error', () => {})
  child.unref()
}

export function serveFile(req, res, file) {
  let stat
  try {
    stat = statSync(file)
  } catch {
    return notFound(res)
  }
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'cache-control': 'no-cache' })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

// 只接受同源页面发来的 JSON
export function readJson(req, max = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('type'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > max) req.destroy()
      else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (e) {
        reject(Object.assign(e, { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

export function catalog(root) {
  let version = '0.0.0'
  try {
    version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  } catch {}
  const voice = listVoice()
  return {
    version,
    pageNumbers,
    dataDir: dataDir(),
    stats: stats(),
    works: listWorks(),
    docTypes: DOC_TYPES,
    docImages: listDocImages(skillDirOf(root)),
    trash: listTrash(),
    voiceTrash: listVoiceTrash(),
    voice: { active: activeVoice(), profiles: voice },
    python: findPython(),
  }
}

const docTypeName = (id, fallback = '') => docTypeById(id)?.name || docTypeByName(id)?.name || fallback

export async function handleApi(req, res, url, root, runner) {
  const rest = url.pathname.slice(BASE.length) || '/'
  const method = req.method || 'GET'
  let m

  if (rest === '/api/catalog') return sendJson(res, 200, catalog(root)), true
  if (rest === '/api/voice/trash') {
    try {
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, items: listVoiceTrash() })
        return true
      }
      const body = await readJson(req)
      const r = restoreVoice(String(body.name || ''))
      if (!r.ok) throw new Error(r.error || '恢复失败')
      sendJson(res, 200, { ok: true, items: listVoiceTrash() })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if ((m = rest.match(/^\/api\/works\/([\w-]+)\/suggestions$/))) {
    try {
      const id = m[1]
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, items: listSuggestions(id, '') })
        return true
      }
      const body = await readJson(req)
      const sid = String(body.sid || '')
      const action = body.action === 'adopt' ? 'adopt' : 'dismiss'
      if (action === 'dismiss') {
        setSuggestionStatus(id, sid, 'dismissed')
        sendJson(res, 200, { ok: true, work: readWork(id) })
        return true
      }
      const items = listSuggestions(id, '')
      const sug = items.find((s) => s && s.id === sid)
      if (!sug) throw new Error('找不到这条建议')
      const work = readWork(id)
      const block = work.blocks.find((b) => b.id === sug.blockId)
      if (!block) throw new Error('这一段已经不在了，建议作废')
      if (block.hash !== sug.hash) {
        setSuggestionStatus(id, sid, 'conflict')
        throw new Error('这一段在你确认之前被改过了，建议与当前正文冲突，已标记为冲突')
      }
      const r = patchWorkBlocks(id, [{ blockId: sug.blockId, action: 'replace', content: sug.proposed, expect: sug.hash }], {
        action: 'model',
        note: sug.reason ? `采用建议：${sug.reason}` : '采用模型建议',
      })
      if (!r.ok) throw new Error((r.warnings || []).join('；') || '采用失败')
      setSuggestionStatus(id, sid, 'adopted')
      sendJson(res, 200, { ok: true, work: readWork(id) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if ((m = rest.match(/^\/api\/works\/([\w-]+)\/evidence$/)) && method === 'GET') {
    try {
      const work = readWork(m[1])
      if (!work) throw new Error('找不到稿件')
      const block = String(url.searchParams.get('block') || '')
      const target = work.blocks.find((b) => b.id === block)
      const entries = parseLedger(work.sources)
      const matches = matchEvidence(target ? target.text : work.draft, entries)
      sendJson(res, 200, { ok: true, block: block || '', entries: entries.length, matches })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if ((m = rest.match(/^\/api\/works\/([\w-]+)\/audit$/)) && method === 'GET') {
    try {
      const work = readWork(m[1])
      if (!work) throw new Error('找不到稿件')
      const mode = work.kind === 'article' ? detectAnalysisMode(work.title) : 'analysis'
      const audit = auditAnalysis(work.draft, work.sources, { mode, title: work.title, outline: work.outline })
      const all = [...audit.items, ...audit.review.items]
      const items = all.map((it) => {
        const needle = String(it.excerpt || '').slice(0, 18)
        const hit = needle ? work.blocks.find((b) => b.text.includes(needle)) : null
        return { ...it, blockId: hit?.id || '' }
      })
      if (work.kind === 'article') saveReview(work.id, audit.review)
      sendJson(res, 200, { ok: true, items, review: audit.review, chars: work.chars })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/works' && method === 'GET') {
    const q = url.searchParams.get('q') || ''
    const type = url.searchParams.get('type') || 'all'
    sendJson(res, 200, { ok: true, q, type, works: listWorks(q, type) })
    return true
  }
  if (rest === '/api/health') return sendJson(res, 200, { ok: true, time: new Date().toISOString(), python: findPython() }), true

  // ---------------- 后台任务 ----------------
  if (rest === '/api/jobs' && method === 'GET') {
    sendJson(res, 200, { ok: true, jobs: runner ? runner.list() : [], concurrency: runner?.concurrency?.() || 2 })
    return true
  }
  if (rest === '/api/jobs' && method === 'POST') {
    try {
      const body = await readJson(req, 4 * 1024 * 1024)
      if (!runner) throw new Error('后台执行器没有启动；请重启 dsh')
      const job = runner.start({ kind: body.kind, name: body.name, prompt: body.prompt, workId: body.workId, request: body.request, submissionId: body.submissionId })
      sendJson(res, 200, { ok: true, job })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/jobs/resume' && method === 'POST') {
    try {
      const { id } = await readJson(req)
      if (!runner?.resume) throw new Error('执行器尚未就绪')
      sendJson(res, 200, { ok: true, job: runner.resume(String(id)) })
    } catch (e) { sendJson(res, 409, { ok: false, error: e.message }) }
    return true
  }
  if (rest === '/api/jobs/cancel') {
    try {
      const body = await readJson(req)
      sendJson(res, 200, { ok: runner ? runner.cancel(String(body.id || '')) : false })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }

  // ---------------- 稿件 ----------------
  if (rest === '/api/works/import') {
    try {
      const body = await readJson(req, 8 * 1024 * 1024)
      const meta = importWork(body)
      sendJson(res, 200, { ok: true, id: meta.id })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/works/save') {
    try {
      const body = await readJson(req, 8 * 1024 * 1024)
      if (body.kind === 'official' && !body.docTypeName && body.docType) body.docTypeName = docTypeName(body.docType)
      const meta = saveWork({ ...body, revisionAction: 'manual' })
      sendJson(res, 200, { ok: true, work: readWork(meta.id) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/works/update') {
    try {
      const body = await readJson(req)
      sendJson(res, 200, { ok: true, work: updateWorkMeta(String(body.id || ''), body.patch || {}) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/works/delete') {
    try {
      const body = await readJson(req)
      sendJson(res, 200, { ok: deleteWork(String(body.id || '')) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/works/block') {
    try {
      const body = await readJson(req, 2 * 1024 * 1024)
      const id = String(body.id || '')
      const edit = {
        blockId: body.blockId,
        beforeId: body.beforeId,
        afterId: body.afterId,
        action: ['insert', 'delete', 'merge', 'move'].includes(body.action) ? body.action : 'replace',
        dir: body.dir,
        expect: body.expect,
        content: body.content,
      }
      const work = readWork(id)
      if (!work) throw new Error('找不到稿件')
      if (body.version) {
        const latest = work.versions?.[0]?.n || 0
        if (Number(body.version) !== latest) {
          throw Object.assign(new Error(`这篇稿子在你编辑时已经变成第 ${latest} 版了；先刷新预览再改，别把别人的改动冲掉`), { status: 409 })
        }
      }
      const r = patchWorkBlocks(id, [edit], { action: 'inline', note: body.note || '预览里手改' })
      if (!r.ok) throw new Error((r.warnings || []).join('；') || '没有改动')
      sendJson(res, 200, { ok: true, work: readWork(id), warnings: r.warnings })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/works/revert') {
    try {
      const body = await readJson(req)
      const r = revertWork(String(body.id || ''), { direction: body.direction, version: Number(body.version || 0) })
      if (!r.ok) throw Object.assign(new Error(r.error || '撤回失败'), { status: r.status })
      sendJson(res, 200, { ok: true, work: readWork(String(body.id)) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if ((m = rest.match(/^\/api\/works\/([\w-]+)\/versions$/))) {
    try {
      const id = m[1]
      if (method === 'GET') {
        const work = readWork(id)
        if (!work) throw new Error('找不到稿件')
        sendJson(res, 200, { ok: true, id, versions: work.versions, check: work.check })
        return true
      }
      const body = await readJson(req)
      if (body.n && body.preview) {
        const text = readVersion(id, body.n)
        if (!text) throw new Error('这一版是空的')
        sendJson(res, 200, { ok: true, id, n: Number(body.n), text })
        return true
      }
      const r = revertToVersion(id, Number(body.n || 0))
      if (!r.ok) throw new Error(r.error || '恢复失败')
      sendJson(res, 200, { ok: true, work: readWork(id), restored: Number(body.n || 0) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if ((m = rest.match(/^\/api\/trash$/))) {
    try {
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, items: listTrash() })
        return true
      }
      const body = await readJson(req)
      const r = restoreWork(String(body.name || ''))
      if (!r.ok) throw new Error(r.error || '恢复失败')
      sendJson(res, 200, { ok: true, id: r.id, items: listTrash() })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if ((m = rest.match(/^\/api\/works\/([\w-]+)$/)) && method === 'GET') {
    const work = readWork(m[1])
    if (!work) return notFound(res), true
    return sendJson(res, 200, { ok: true, work }), true
  }

  // ---------------- 导出 / 机检 ----------------
  if (rest === '/api/export') {
    try {
      const body = await readJson(req)
      const work = readWork(String(body.id || ''))
      if (!work) throw new Error('找不到稿件')
      if (work.kind !== 'official' && !String(work.draft || '').trim()) throw new Error('这篇稿子还没有正文，先写或让模型补完再导出')
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const safeTitle = String(work.title || work.id).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)
      const outName = `${work.id}-${stamp}-${randomUUID().slice(0, 8)}-${safeTitle}.docx`
      const outFile = join(exportsDir(), outName)
      let output = ''
      if (work.kind === 'official') {
        // 公文：按文种套 GB/T 9704-2012 版式，页眉页脚图随稿保存
        const docType = work.docTypeName || docTypeName(work.docType)
        if (!docType) throw new Error('这篇文稿没有登记文种，先在页面里选一个文种')
        const headerImage = String(body.headerImage || work.headerImage || '')
        const footerImage = String(body.footerImage || work.footerImage || '')
        const numbering = normalizePageNumber(body.pageNumber ?? work.pageNumber)
        const extraArgs = [numbering.enabled ? '--show-page-number' : '--hide-page-number',
          '--page-number-style', numbering.style, '--page-number-position', numbering.position,
          ...(numbering.first ? [] : ['--hide-first-page-number'])]
        if (headerImage) extraArgs.push('--header-image', headerImage)
        if (footerImage) extraArgs.push('--footer-image', footerImage)
        if (Number(body.headerWidthMm) > 0) extraArgs.push('--header-image-width-mm', String(Number(body.headerWidthMm)))
        if (Number(body.footerWidthMm) > 0) extraArgs.push('--footer-image-width-mm', String(Number(body.footerWidthMm)))
        const r = await generateDocx({ skillDir: skillDirOf(root), draftFile: join(worksDir(), work.id, 'draft.md'), outFile, docType, extraArgs })
        output = r.output
        updateWorkMeta(work.id, { headerImage, footerImage, ...(body.pageNumber ? { pageNumber: numbering } : {}) })
      } else {
        // 文章版式：带标题、小标题、正文、列表、表格和参考资料的 A4 文档。
        const title = work.origin === 'imported' ? work.title : ''
        const r = await exportArticle({ root, draftFile: join(worksDir(), work.id, 'draft.md'), outFile, title })
        output = r.output
      }
      // 包内结构核对：缺 document.xml / 页眉图片没打进去，都提前说清楚
      const verify = await verifyDocx(outFile)
      sendJson(res, 200, { ok: true, name: outName, url: `${BASE}/files/exports/${encodeURIComponent(outName)}`, output, size: statSync(outFile).size, verify })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/doc-images' && method === 'GET') {
    sendJson(res, 200, { ok: true, images: listDocImages(skillDirOf(root)) })
    return true
  }
  if (rest === '/api/doc-images' && method === 'POST') {
    try {
      const body = await readJson(req, 16 * 1024 * 1024)
      const raw = String(body.dataUrl || '')
      const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
      if (!base64) throw new Error('没有收到图片数据')
      const buffer = Buffer.from(base64, 'base64')
      const entry = addDocImage(skillDirOf(root), { buffer, originalName: body.filename || 'image.png', name: body.name })
      sendJson(res, 200, { ok: true, image: entry, images: listDocImages(skillDirOf(root)) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/doc-images/remove') {
    try {
      const body = await readJson(req)
      removeDocImage(skillDirOf(root), String(body.name || ''))
      sendJson(res, 200, { ok: true, images: listDocImages(skillDirOf(root)) })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/check') {
    try {
      const body = await readJson(req)
      const work = readWork(String(body.id || ''))
      if (!work) throw new Error('找不到稿件')
      if (work.kind !== 'official') throw new Error('机检只对公文有意义')
      const docType = work.docTypeName || docTypeName(work.docType)
      if (!docType) throw new Error('这篇文稿没有登记文种，先在页面里选一个文种')
      const r = await checkDraft({ skillDir: skillDirOf(root), draftFile: join(worksDir(), work.id, 'draft.md'), docType })
      saveCheck(work.id, { docType, ok: r.ok, errors: r.errors, warnings: r.warnings, infos: r.infos, items: r.items, output: r.output })
      sendJson(res, 200, { ok: true, check: { docType, ok: r.ok, errors: r.errors, warnings: r.warnings, infos: r.infos, items: r.items, output: r.output } })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/exports' && method === 'GET') {
    sendJson(res, 200, { exports: listExports(url.searchParams.get('id') || '') })
    return true
  }
  if (rest === '/api/reveal') {
    try {
      const body = await readJson(req)
      const file = join(exportsDir(), String(body.name || ''))
      if (!existsSync(file)) throw new Error('文件不在了')
      revealFile(file)
      sendJson(res, 200, { ok: true, path: file })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }

  // ---------------- 语气档案 ----------------
  if (rest === '/api/voice' && method === 'GET') {
    try {
      const name = url.searchParams.get('name') || ''
      sendJson(res, 200, { ok: true, voice: readVoice(name), profiles: listVoice(), active: activeVoice() })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/voice/save') {
    try {
      const body = await readJson(req, 4 * 1024 * 1024)
      const v = saveVoice(body.profile || activeVoice() || '我的语气', body.text)
      sendJson(res, 200, { ok: true, voice: v, profiles: listVoice() })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/voice/sample') {
    try {
      const body = await readJson(req, 24 * 1024 * 1024)
      const files = Array.isArray(body.files) ? body.files : [{ title: body.title, text: body.text }]
      const profile = body.profile || activeVoice() || '我的语气'
      let added = 0
      let skipped = 0
      let last = null
      const failures = []
      for (const f of files) {
        const title = f?.title || f?.name || ''
        try {
          if (typeof f?.text !== 'string' || !f.text.trim()) throw new Error('文件里没有可读的文字')
          const r = addVoiceSample(profile, { title, text: f.text, origin: body.origin || 'upload' })
          if (r.added) added++
          else skipped++
          last = r
        } catch (e) {
          failures.push({ title, error: e.message })
        }
      }
      if (!added && !skipped) throw new Error(failures[0]?.error || '请选择可读的旧稿')
      sendJson(res, 200, { ok: true, added, skipped, failures, voice: readVoice(profile, { includeCorpus: false }), profiles: listVoice(), last })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/voice/use') {
    try {
      const body = await readJson(req)
      setActiveVoice(String(body.profile || ''))
      sendJson(res, 200, { ok: true, active: activeVoice(), profiles: listVoice() })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }
  if (rest === '/api/voice/delete') {
    try {
      const body = await readJson(req)
      const removed = deleteVoice(String(body.name || body.profile || ''))
      sendJson(res, 200, { ok: removed, profiles: listVoice(), voiceTrash: listVoiceTrash(), active: activeVoice() })
    } catch (e) {
      sendJson(res, e.status || 400, { ok: false, error: e.message })
    }
    return true
  }

  // ---------------- 材料：docx 抽正文 ----------------
  if (rest === '/api/extract') {
    try {
      const body = await readJson(req, 24 * 1024 * 1024)
      if (!/\.docx$/i.test(String(body.filename || ''))) throw new Error('只支持 .docx 文件；.md / .txt 直接读即可')
      const raw = String(body.dataUrl || '')
      const at = raw.indexOf('base64,')
      if (at < 0) throw new Error('文件数据格式不对')
      const text = await extractDocx(Buffer.from(raw.slice(at + 7), 'base64'), { markdown: body.format === 'markdown' })
      if (!text) throw new Error('文档里没有可读文字，可能是扫描件或空文档')
      sendJson(res, 200, { ok: true, text, chars: text.length })
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message })
    }
    return true
  }

  return false
}

export function createHandler(root, runner) {
  return async function handler(req, res) {
    const url = new URL(req.url || '/', 'http://x')
    const rest = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'
    let m

    if (req.method === 'GET' || req.method === 'HEAD') {
      if ((m = rest.match(/^\/files\/exports\/(.+\.docx)$/))) {
        const f = safeFile(exportsDir(), m[1])
        return f ? serveFile(req, res, f) : notFound(res)
      }
      if ((m = rest.match(/^\/api\/doc-images\/file\/([\w.-]+\.(?:png|jpg|jpeg))$/))) {
        const f = safeFile(docImageDir(skillDirOf(root)), m[1])
        return f ? serveFile(req, res, f) : notFound(res)
      }
      if ((m = rest.match(/^\/files\/works\/([\w-]+)\/([\w.-]+\.(?:md|txt))$/))) {
        const f = safeFile(join(worksDir(), m[1]), m[2])
        return f ? serveFile(req, res, f) : notFound(res)
      }
    }

    if (await handleApi(req, res, url, root, runner)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res)
    const f = safeFile(join(root, 'gallery'), rest === '/' ? 'index.html' : rest.slice(1))
    return f ? serveFile(req, res, f) : notFound(res)
  }
}
