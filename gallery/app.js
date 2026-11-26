// 写作助手 · 插件页面
// 读 /writing-assistant/api/catalog，按 #/路由 渲染：
//   #/write     写作台：文章写作 / 深度研究 / 公文起草 三组
//   #/works     稿件库：生成稿和导入稿，按类型筛、按关键词搜
//   #/voice     语气档案：上传语料 → 后台提炼 → 读档案
//   #/about     使用说明
// 预览是一张纸：逐段可选中，点一段可以自己改，也可以让模型改这一段。
const $ = (s, el = document) => el.querySelector(s)
document.documentElement.classList.add('js')
// 纸是滚动容器（外壳固定，纸自己滚），换文种后回到表单开头
const scrollSheetTop = () => {
  const sheet = $('.sheet')
  if (sheet) sheet.scrollTop = 0
}
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('/', '.') : '')
const time = (iso) => (iso ? new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replaceAll('/', '.') : '')
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

const ICONS = {
  pen: '<path d="M4 20l4.2-1 11-11-3.2-3.2L5 15.8z"/><path d="M14.5 6.5l3.2 3.2"/>',
  library: '<path d="M5 4.5h14v15H5zM8.5 8h7M8.5 11.5h7M8.5 15h4"/>',
  doc: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12h6M9 15.5h4"/>',
  folder: '<path d="M3 6.5h6l2 2h10v11H3z"/>',
  voice: '<path d="M4 12h2M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  book: '<path d="M4 5.5C7 4.5 9.5 4.5 12 6.5c2.5-2 5-2 8-1V19c-3-1-5.5-1-8 1-2.5-2-5-2-8-1zM12 6.5V20"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16zM14 6l4 4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  copy: '<path d="M9 9h10v11H9zM5 4h10v3M5 4v11h3"/>',
  model: '<path d="M12 4v3M12 17v3M4 12h3M17 12h3"/><circle cx="12" cy="12" r="4"/>',
  seal: '<path d="M7 4h10v5H7zM5 11h14v4H5zM8 15v5h8v-5"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  chev: '<path d="m7 10 5 5 5-5"/>',
  clip: '<path d="m8.2 13.1 6.6-6.6a2.4 2.4 0 0 1 3.4 3.4l-8 8a4 4 0 0 1-5.7-5.6l8.6-8.6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  merge: '<path d="M5 7h6l3 5h5M5 17h6l3-5"/><path d="M16 5l3 2-3 2"/>',
  heading: '<path d="M5 6v12M13 6v12M5 12h8"/><path d="M17 9v9"/>',
  sliders: '<path d="M4 8h9M17 8h3M4 16h5M13 16h7"/><circle cx="15" cy="8" r="2"/><circle cx="11" cy="16" r="2"/>',
  expand: '<path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"/>',
  undo: '<path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 5v4h4"/>',
  redo: '<path d="M20 12a8 8 0 1 0-2.3 5.7"/><path d="M20 5v4h-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 7.5a2.8 2.8 0 0 1 0 5M18.5 19c0-1.9-.7-3.3-1.8-4.2"/>',
  history: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 5v4h4"/><path d="M12 8v4l3 2"/>',
  image: '<rect x="4" y="5" width="16" height="14"/><circle cx="9" cy="10" r="1.6"/><path d="M4 16.5l5-4 4 2.6 3-2 4 3"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
}

// ---------------- 状态 ----------------
const DEFAULT = {
  write: { group: 'analysis', title: '', mode: 'materials', kindId: 'analysis', audience: '', length: '1500', lengths: { analysis: '1500', research: '3000' }, lengthPresetVersion: 2, voice: '', materials: '', materialNames: [], supplement: true, citation: 'inline' },
  official: { prompt: '', length: '', notes: '', materialFiles: [], referenceMode: 'type', refDocType: '', templateName: '', templateText: '', headerImage: '', footerImage: '' },
  voice: { profile: '' },
  worksFilter: 'all',
  tool: '',
  setOpen: '',
  promptOpen: false,
  viewerMore: false,
  railMore: false,
  wq: '',
  pending: null,
  submissions: {},
  hiddenJobs: [],
  compactJobs: {},
}
const LS = 'writing-assistant/state/v1'
function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || 'null')
    if (!saved || typeof saved !== 'object') return null
    const write = { ...DEFAULT.write, ...(saved.write || {}), lengths: { ...DEFAULT.write.lengths, ...saved.write?.lengths } }
    if (saved.write?.lengthPresetVersion !== 2) {
      for (const [group, old] of [['analysis', '1800'], ['research', '4000']]) {
        if (String(write.lengths[group]) === old) write.lengths[group] = DEFAULT.write.lengths[group]
        if (write.group === group && String(write.length) === old) write.length = DEFAULT.write.lengths[group]
      }
      write.lengthPresetVersion = 2
    }
    const official = { ...DEFAULT.official, ...saved.official }
    if (official.mode === 'template' && official.docType && !official.prompt.trim()) {
      official.refDocType ||= official.docType
      official.prompt = Object.values(official.fields || {}).some(Boolean) ? '根据材料起草公文。' : ''
      official.notes = [official.notes, ...Object.entries(official.fields || {}).filter(([, value]) => value).map(([, value]) => value)].filter(Boolean).join('\n\n')
    }
    if (!['type', 'template'].includes(saved.official?.referenceMode)) {
      official.referenceMode = official.templateText ? 'template' : 'type'
    }
    delete official.fields
    delete official.docType
    delete official.mode
    return {
      ...DEFAULT,
      ...saved,
      pending: saved.pending?.chat ? saved.pending : null,
      submissions: saved.submissions || (saved.pending?.submissionId && !saved.pending.chat ? { [saved.pending.submissionId]: saved.pending } : {}),
      hiddenJobs: saved.hiddenJobs || (saved.hiddenJob ? [saved.hiddenJob] : []),
      write,
      official,
      voice: { ...DEFAULT.voice, ...(saved.voice || {}) },
    }
  } catch {
    return null
  }
}
const state = readState() || structuredClone(DEFAULT)
let saveTimer = 0
// localStorage 只有几 MB，材料可能几十万字：超量时只记「有材料」，不把正文塞进去
function persist(immediate = false) {
  clearTimeout(saveTimer)
  const writeState = () => {
    saveTimer = 0
    try {
      const { write, official, voice, pending, submissions, hiddenJobs, compactJobs } = state
      const slim = {
        write: { ...write, materials: write.materials.length > 150000 ? '' : write.materials, materialNames: write.materials.length > 150000 ? [] : write.materialNames },
        official,
        voice,
        pending, submissions, hiddenJobs, compactJobs,
      }
      localStorage.setItem(LS, JSON.stringify(slim))
    } catch {}
  }
  if (immediate) writeState()
  else saveTimer = setTimeout(writeState, 200)
}

let data = null
let jobs = Object.values(state.submissions).filter(p => p.lastJob).map(p => ({
  ...p.lastJob, request: p.request, phase: '正在接回任务状态',
}))
const lastJobStatus = new Map()
const reviseDrafts = new Map()
let currentWork = null
let selectedBlock = null
let editingBlock = null
let historyRequest = null
// 宿主同时执行几条写作任务；以 /api/jobs 返回的为准，拿不到时按 2 条显示
// 正在手改一段时，模型改完的结果先存这里，等手改收尾再刷新预览
let pendingRefresh = null

// 三种写法。公文由文种模板决定结构，见 lib/docs.js。
const ARTICLE_KINDS = [
  { id: 'analysis', name: '文章写作', min: 800, def: 1500, presets: [800, 1500, 2000, 3000] },
  { id: 'research', name: '深度研究', min: 2000, def: 3000, presets: [2000, 3000, 5000] },
]

const JOB_LABEL = { queued: '排队中', running: '进行中', done: '已完成', error: '失败', canceled: '已取消', interrupted: '已中断' }

// ---------------- 数据 ----------------
async function load({ quiet, background } = {}) {
  try {
    data = await fetch('api/catalog', { cache: 'no-store' }).then((r) => r.json())
  } catch (e) {
    if (!quiet) toast(`读不到稿库：${e.message}`)
    showOffline()
    return
  }
  paintCounts()
  render({ keepFocus: true, background })
}

// 稿库读不到时给一张能重试的说明，而不是一片空白
function showOffline() {
  const app = $('#app')
  if (!app || data) return
  app.innerHTML = `<div class="empty" style="margin-top:64px">
    <div class="empty-title">读不到稿库</div>
    <p>暂时无法连接 DeepSeek Harness。<button class="ghost-link" data-retry-load>重试</button></p>
  </div>`
}

function paintCounts() {
  if (!data) return
  $$('[data-count="works"]').forEach((el) => (el.textContent = String((data.works || []).length)))
  paintMast()
}

// 报头右侧：后台在跑什么，一眼能看到
function jobsForView() {
  if (state.view === 'voice') return jobs.filter((job) => job.kind === 'voice')
  if (state.view === 'write') return jobs.filter((job) => job.kind !== 'voice')
  return []
}

function paintMast() {
  const box = $('#mast-job')
  if (!box) return
  const scoped = jobsForView()
  const running = scoped.filter((job) => job.status === 'running').length
  const queued = scoped.filter((job) => job.status === 'queued').length
  const hidden = scoped.some((job) => activeJob(job) && state.hiddenJobs.includes(job.id))
  const label = [running && `${running} 项进行中`, queued && `${queued} 项排队`].filter(Boolean).join(' / ')
  box.classList.toggle('busy', running + queued > 0)
  box.hidden = !label
  setJobMarkup(box, label ? `<i aria-hidden="true"></i>${hidden
    ? `<button type="button" class="job-reveal" data-show-hidden-jobs title="显示后台任务">${label}</button>`
    : `<b>${label}</b>`}` : '')
}

// ---------------- 通用块 ----------------
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
function todayLine() {
  const d = new Date()
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEK[d.getDay()]}`
}
// 页头只有三样：日期、页名（写作台不写，导航里已经有了）、一句这页能干什么
function head(title, desc) {
  if (!title) return ''
  return `<header class="head">${title ? `<h1>${esc(title)}</h1>` : ''}</header>`
}
const articleKind = (id) => ARTICLE_KINDS.find((k) => k.id === id) || ARTICLE_KINDS[0]
const articleLength = (kind, value) => Math.max(kind.min, Math.min(12000, Math.trunc(Number(value)) || kind.def))
const usableVoiceProfiles = () => (data?.voice?.profiles || []).filter((p) => p.chars > 0)
const voiceChoice = () => state.write.voice === '__none__' || usableVoiceProfiles().some((p) => p.name === state.write.voice) ? state.write.voice : ''
const defaultVoiceProfile = () => usableVoiceProfiles().find((p) => p.active)?.name || ''
const voiceProfile = () => voiceChoice() === '__none__' ? '' : voiceChoice() || defaultVoiceProfile()
const docType = (id) => data?.docTypes?.find((d) => d.id === id) || null

// ---------------- 后台任务 ----------------
const activeJob = j => j.status === 'running' || j.status === 'queued'
const jobTitle = j => {
  const type = j.request?.group === 'analysis' ? '文章写作' : j.request?.group === 'research' ? '深度研究' : j.kindLabel
  return [type, j.name].filter(Boolean).join(' · ')
}
const expandedJobDetails = new Set()

function jobPanels() {
  const visible = jobsForView()
    .filter((job) => !state.hiddenJobs.includes(job.id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  if (!visible.length) return ''
  return `<div class="job-list-head"><h2 class="job-list-title">${state.view === 'voice' ? '提炼任务' : '后台任务'}</h2></div>
    <div class="job-stack job-stack-stable">${visible.map(jobPanel).join('')}</div>`
}

function clientProgress(job) {
  if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') return 100
  if (job.status === 'queued') return 4
  const elapsed = job.startedAt ? Math.max(0, (Date.now() - new Date(job.startedAt).getTime()) / 1000) : 0
  const tau = job.kind === 'official' ? 330 : job.kind === 'revise' ? 150 : job.kind === 'voice' ? 300 : 600
  return Math.max(6, Math.min(94, Math.round(8 + 86 * (1 - Math.exp(-elapsed / tau)) + Math.min(6, (job.steps || 0) * 0.2))))
}
// 失败的终态（失败 / 取消 / 中断）没有可靠的分母：只报阶段和已用时间，不画进度条、
// 也不写「100%」——否则用户会以为任务跑完了。
const UNSUCCESSFUL_TERMINALS = ['error', 'canceled', 'interrupted']
const TERMINAL_REASON = {
  error: '任务失败，已停止。这次填的内容还在，可以改完再生成。',
  canceled: '任务被取消，未完成。这次填的内容还在，可以直接重新生成。',
  interrupted: '原会话在任务完成前停止。',
}
const jobStatusText = job => job.needsReview && job.status === 'done' ? '需核对' : (JOB_LABEL[job.status] || job.status)

function jobActions(job) {
  const id = esc(job.id)
  if (activeJob(job)) return `<button class="btn ghost sm" data-cancel-job="${id}">取消任务</button>`
  const result = job.resultIds?.[0]
  const group = job.request?.group || (job.kind === 'official' ? 'official' : job.kind === 'article' ? 'article' : '')
  const profile = job.kind === 'voice' && job.status === 'done' && (job.request?.profile || job.name)
  return `${result ? `<button class="btn sm" data-open-work="${esc(result.id)}">打开预览</button>` : ''}
    ${profile && data?.voice?.profiles?.some((item) => item.name === profile) ? `<button class="btn sm" data-pick-voice="${esc(profile)}">查看档案</button>` : ''}
    ${job.status === 'interrupted' && job.sessionId ? `<button class="btn sm" data-resume-job="${id}">继续原任务</button>`
      : UNSUCCESSFUL_TERMINALS.includes(job.status) ? `<button class="btn sm" data-continue-job="${id}" data-continue-kind="${esc(job.kind)}" data-continue-group="${esc(group)}">${job.kind === 'voice' ? '返回档案' : '重新起草'}</button>` : ''}
`
}

function jobProgress(job) {
  return `<div class="job-progress-row">
    <div class="job-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(jobTitle(job))}进度"><i></i></div>
    <span class="mono job-pct" aria-hidden="true"></span>
  </div>`
}

function paintProgress(area, job) {
  const meter = area.querySelector('[role="progressbar"]')
  const pct = clientProgress(job)
  if (!meter || meter.getAttribute('aria-valuenow') === String(pct)) return
  const value = job.status === 'done' ? '100%' : `约 ${pct}%`
  meter.setAttribute('aria-valuenow', String(pct))
  meter.setAttribute('aria-valuetext', value)
  $('i', meter).style.transform = `scaleX(${pct / 100})`
  $('.job-pct', area).textContent = value
}

function jobPanel(job) {
  const id = esc(job.id)
  const title = esc(jobTitle(job))
  const active = activeJob(job)
  const compact = state.compactJobs[job.id] ?? job.kind === 'voice'
  const detailsOpen = !active && expandedJobDetails.has(job.id)
  const toggle = active ? (compact ? '展开显示' : '收起') : (detailsOpen ? '收起详情' : '展开详情')
  return `<article class="job-panel job-card st-${esc(job.status)}${compact ? ' compact' : ''}" data-job-id="${id}" aria-label="${title}">
    <div class="job-card-frame">
      <div class="job-card-head">
        <span class="job-title" title="${title}">${title}</span>
        <span class="job-state">${esc(jobStatusText(job))}</span>
        <button class="text job-toggle" type="button" ${active ? 'data-job-compact' : 'data-job-details'}="${id}" aria-expanded="${active ? !compact : detailsOpen}">${toggle}</button>
        <button class="ibtn job-close" type="button" data-dismiss-job="${id}" title="关闭任务显示" aria-label="关闭任务显示">${icon('close')}</button>
      </div>
      <div class="job-card-meta">
        <span class="job-line"></span>
        ${!compact && job.status === 'running' ? '<span class="job-elapsed"></span>' : ''}
        ${active && !compact ? `<button class="text" type="button" data-cancel-job="${id}">取消任务</button>` : ''}
      </div>
      <div class="job-card-meter">${job.status === 'running' || job.status === 'done' ? jobProgress(job) : '<div class="job-progress-row"><div class="job-progress"></div></div>'}</div>
    </div>
    ${detailsOpen ? `<div class="job-card-details">
      ${job.request && job.kind !== 'voice' ? `<div class="job-req">${esc(requestSummary(job.request))}</div>` : ''}
      ${job.review?.summary ? `<div class="job-note">${esc(job.review.summary)}</div>` : ''}
      ${job.error ? `<div class="job-error">${esc(job.error)}</div>` : ''}
      ${job.text ? `<div class="job-text">${esc(job.text.slice(0, 700))}</div>` : ''}
      <div class="job-actions">${jobActions(job)}</div>
    </div>` : ''}
  </article>`
}

// 任务面板里那行设置：让用户看得见这次用的是哪套参数
function requestSummary(r) {
  if (!r) return ''
  if (r.group === 'official') return [r.docTypeName || '公文', r.length ? `约 ${r.length} 字` : '', r.templateName ? `模板：${r.templateName}` : '', r.materialFiles?.length ? `${r.materialFiles.length} 份材料` : ''].filter(Boolean).join(' · ')
  if (r.group === 'revise') return [r.mode === 'whole' ? '整篇改写' : `只改 ${r.blockId || '这一块'}`, r.version ? `基于第 ${r.version} 版` : ''].filter(Boolean).join(' · ')
  return [
    r.articleKind === 'research' ? '深度研究' : '文章写作',
    r.length ? `约 ${r.length} 字` : '',
    r.audience ? `读者：${r.audience}` : '',
    r.voice ? `语气：${r.voice}` : '按文体写',
    r.materials ? `材料 ${r.materials} 字` : '无材料',
    r.retrieve ? '会检索' : '不检索',
  ].filter(Boolean).join(' · ')
}

function setJobMarkup(box, html) {
  if (box.jobMarkup === html) return
  const active = document.activeElement
  const key = box.contains(active) && active.getAttributeNames().find(name => name.startsWith('data-'))
  const value = key ? active.getAttribute(key) : null
  const job = key ? active.closest('[data-job-id]')?.dataset.jobId : null
  const scroll = box.querySelector('.job-stack')?.scrollTop || 0
  box.innerHTML = html
  box.jobMarkup = html
  const stack = box.querySelector('.job-stack')
  if (stack) stack.scrollTop = scroll
  if (key) {
    const next = $$('[' + key + ']', box).find(el => el.getAttribute(key) === value && el.closest('[data-job-id]')?.dataset.jobId === job)
    const card = job && $$('[data-job-id]', box).find((el) => el.dataset.jobId === job)
    const target = next || card?.querySelector?.('.job-toggle')
    target?.focus({ preventScroll: true })
  }
}

function paintJobPanel() {
  const box = $('#job-panel')
  if (!box) return
  const html = jobPanels()
  box.hidden = !html
  setJobMarkup(box, html)
  const byId = new Map(jobs.map((job) => [job.id, job]))
  const queued = jobs.filter((job) => job.status === 'queued')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const queuePos = new Map(queued.map((job, i) => [job.id, i + 1]))
  for (const card of $$('[data-job-id]', box)) {
    const job = byId.get(card.dataset.jobId)
    const line = $('.job-line', card)
    const description = job.status === 'queued' ? `队列第 ${queuePos.get(job.id)} 位`
      : job.status === 'running' ? job.phase || '正在执行'
      : job.status === 'done' ? (job.needsReview ? '稿件已保存，待核对' : '已保存') : (job.error || TERMINAL_REASON[job.status] || '')
    if (line.textContent !== description) line.textContent = line.title = description
    const elapsed = $('.job-elapsed', card)
    if (elapsed) {
      const seconds = job.startedAt ? Math.max(0, Math.round((Date.now() - new Date(job.startedAt)) / 1000)) : 0
      const value = `已跑 ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      if (elapsed.textContent !== value) elapsed.textContent = value
    }
    paintProgress(card, job)
  }
}

let jobPoll = 0
let appliedPoll = 0
function rememberJob(pending, job) {
  const { id, submissionId, name, kind, kindLabel, workId, status, phase, steps, createdAt, startedAt, updatedAt, lastTool } = job
  pending.jobId = id
  pending.lastJob = ['running','queued'].includes(status)
    ? { id, submissionId, name, kind, kindLabel, workId, status, phase, steps, createdAt, startedAt, updatedAt, lastTool }
    : null
}
async function refreshJobs() {
  const poll = ++jobPoll
  try {
    const response = await fetch('api/jobs', { cache: 'no-store' })
    if (!response.ok) return jobs
    const snapshot = await response.json()
    if (poll < appliedPoll || !snapshot.ok || !Array.isArray(snapshot.jobs)) return jobs
    appliedPoll = poll
    jobs = snapshot.jobs
  } catch {
    return jobs
  }
  const finished = []
  let changed = false
  const byId = new Map()
  for (const [submissionId, p] of Object.entries(state.submissions)) {
    const job = jobs.find(j => j.submissionId === submissionId || j.submissionAliases?.includes(submissionId) || j.id === p.jobId)
    if (job) {
      byId.set(job.id, p)
      if (p.jobId !== job.id || (activeJob(job) && p.lastJob?.updatedAt !== job.updatedAt)) {
        rememberJob(p, job)
        changed = true
      }
    } else if (Date.now() - Date.parse(p.at) > 10 * 60 * 1000 && !starting.has(submissionId)) {
      delete state.submissions[submissionId]
      changed = true
    }
  }
  for (const j of jobs) {
    const p = byId.get(j.id)
    const prev = lastJobStatus.get(j.id)
    if (!activeJob(j) && ((p && !p.notified) || (prev !== undefined && prev !== j.status))) {
      if (j.status !== 'interrupted') finished.push(j)
      if (p) {
        for (const [sid, pending] of Object.entries(state.submissions)) {
          if (pending.jobId === j.id) delete state.submissions[sid]
        }
        changed = true
      }
    }
    lastJobStatus.set(j.id, j.status)
  }
  if (changed) persist(true)
  paintJobPanel()
  paintMast()
  paintVoiceLearning()
  if (finished.length) {
    await load({ quiet: true, background: true })
    for (const job of finished) await onJobFinished(job)
  }
  if ($('#viewer') && !$('#viewer').hidden) {
    paintViewerJobStrip()
    paintAsideProgress()
  }
  return jobs
}

async function onJobFinished(job) {
  const first = job.resultIds?.[0]
  if (job.kind === 'revise') {
    if (job.status === 'done') {
      if (job.changed === false) {
        toast('模型跑完了，但正文没有改动；看任务面板的回复找原因')
        return
      }
      if (currentWork && (!first || first.id === currentWork.id)) await refreshWorkInPlace()
      toast('模型修改已完成')
    } else if (job.status === 'error') toast(`改稿失败：${job.error || '未知错误'}`)
    return
  }
  if (job.kind === 'voice') {
    if (job.status === 'done') {
      toast('语气档案已更新')
    } else if (job.status === 'error') toast(`提炼失败：${job.error || '未知错误'}`)
    return
  }
  if (job.status === 'done') {
    if (first) {
      const review = job.needsReview ? ` · 审校：${job.review?.summary || '需核对'}` : ''
      toast(`「${first.title || '成稿'}」已存进稿库${review}`)
    } else {
      toast('任务结束，未写入新稿件。可展开详情查看回复。')
    }
  } else if (job.status === 'error') {
    toast(`后台任务失败：${job.error || '未知错误'}`)
  } else if (job.status === 'canceled') {
    toast('后台任务已取消')
  }
}

function toast(text) {
  const t = $('#toast')
  t.textContent = text
  t.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => t.classList.remove('show'), 3400)
}

// 一次点击只起一个任务：POST 还没回来时连点两下，也不能起两个 agent
const starting = new Set()
// 这次任务的设置快照：页面、任务面板、提示词共用同一份
function taskRequest(g) {
  if (g === 'official') {
    const f = state.official
    const { refDocType, docTypeName, templateName, templateText } = officialReferenceValues()
    return {
      group: 'official', mode: 'free', title: (f.prompt.trim() || '公文起草').slice(0, 60),
      docType: refDocType,
      docTypeName,
      refDocType,
      length: officialLength(),
      promptChars: f.prompt.trim().length,
      notesChars: officialMaterials().trim().length,
      materialFiles: f.materialFiles.map(({ name, text }) => ({ name, chars: text.length })),
      templateName,
      templateChars: templateText.length,
      startVersion: 0,
      headerImage: f.headerImage || '',
      footerImage: f.footerImage || '',
      pageNumber: { ...data.pageNumbers?.defaults, ...f.pageNumber },
    }
  }
  const k = articleKind(g)
  // 材料采用范围：和 materialRange 一样按 MATERIAL_LIMIT 逐份截断，快照里能复核哪份用了多少字
  let left = MATERIAL_LIMIT
  const materialFiles = (state.write.materialFiles || []).map((file) => {
    const used = Math.max(0, Math.min(Number(file.chars) || 0, left))
    left -= used
    return { name: file.name, chars: Number(file.chars) || 0, used }
  })
  const vp = voiceProfile()
  const vmeta = (data?.voice?.profiles || []).find((p) => p.name === vp)
  const am = WA_PROMPTS.analysisMeta(state.write.title)
  return {
    group: g,
    articleKind: g,
    title: state.write.title.trim(),
    titleMode: am.titleMode,
    analysisMode: g === 'analysis' ? am.mode : 'research',
    requestedPoints: am.points,
    angles: am.angles,
    outlineRequired: g === 'analysis',
    length: articleLength(k, state.write.length),
    audience: state.write.audience || '',
    voice: vp || '',
    voiceSamples: vmeta?.samples || 0,
    voiceChars: vmeta?.chars || 0,
    materials: state.write.materials.trim().length,
    materialFiles,
    retrieve: state.write.supplement !== false,
    citation: state.write.citation || 'inline',
    startVersion: 0,
  }
}

function startJob(kind, name, prompt, extra = {}) {
  const workId = extra.workId || ''
  const request = extra.request ? structuredClone(extra.request) : null
  const payload = { kind, name, prompt, workId, request }
  // 并行：写作任务（研究型 / 深度研究 / 公文）可以混跑；改稿只在同一篇稿子上串行，
  // 语气档案一次只提炼一份——避免两个任务互相覆盖同一份正文或档案。
  if (kind === 'voice' && (jobs.some(j => activeJob(j) && j.kind === 'voice')
      || Object.values(state.submissions).some(p => p.kind === 'voice' && starting.has(p.submissionId)))) {
    toast('语气档案还有一个在提炼，等它结束或先取消')
    return
  }
  if (kind === 'revise' && jobs.some(j => activeJob(j) && j.kind === 'revise' && (!workId || j.workId === workId))) {
    toast('这篇稿子有一个改稿任务在跑，等它结束或先取消')
    return
  }
  // 只用指纹为一次未知响应找回提交标识，草稿、材料不重复存进 localStorage。
  const serialized = JSON.stringify(payload)
  let hash = 2166136261
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619)
  const key = `${serialized.length}:${hash >>> 0}`
  const prior = Object.values(state.submissions).find(p => p.key === key)
  if (prior && (starting.has(prior.submissionId) || (prior.jobId && jobs.some(j => j.id === prior.jobId && activeJob(j))))) {
    toast('相同内容已在后台处理')
    return
  }
  const submissionId = prior?.submissionId || `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  const pending = prior || { kind, name, key, at: new Date().toISOString(), request, submissionId }
  const others = Object.values(state.submissions).filter(p => p !== pending)
  if (others.length || jobs.some(activeJob)) {
    pending.manualOpen = true
    for (const p of others) p.manualOpen = true
  }
  state.submissions[submissionId] = pending
  starting.add(submissionId)
  if (kind === 'voice') paintVoiceLearning()
  persist(true)
  fetch('api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, submissionId }) })
    .then(async (res) => {
      if (res.status === 404) {
        throw Object.assign(new Error('后台接口不可用'), { rejected: true, fallback: true })
      }
      const r = await res.json()
      if (!res.ok || !r.ok) {
        throw Object.assign(new Error(r.error || `后台接口不可用（HTTP ${res.status}）`), { rejected: res.status < 500 })
      }
      if (state.submissions[submissionId]) rememberJob(pending, r.job)
      persist(true)
      toast(kind === 'voice' ? (r.job.status === 'queued' ? '提炼已排队' : '已提交提炼任务')
        : r.job.status === 'queued' ? `已排队：前面还有 ${jobs.filter(j => j.status === 'queued').length} 条，轮到自动开始`
          : '已提交后台任务，可以接着写下一篇')
      await refreshJobs()
    })
    .catch(e => {
      if (!e.rejected) {
        refreshJobs()
        toast('正在核对刚才的提交；重试相同内容会沿用原任务')
        return
      }
      delete state.submissions[submissionId]
      if (e.fallback && kind === 'voice') {
        persist(true)
        toast('提炼服务暂不可用，请重启 DSH 后重试')
        return
      }
      if (e.fallback) {
        state.pending = { kind, name, at: pending.at, chat: true }
        persist(true)
        toast(postStart(prompt) ? '已在新对话里填好任务' : '已复制任务说明，粘贴到对话里使用')
        if (kind !== 'revise') render({ keepFocus: true })
        return
      }
      persist(true)
      toast(e.message || '后台任务未启动')
    })
    .finally(() => {
      starting.delete(submissionId)
      if (kind === 'voice') paintVoiceLearning()
    })
}

// ---------------- 视图：写作台（文章写作 / 深度研究 / 公文起草） ----------------
const GROUP_LABEL = { analysis: '文章写作', research: '深度研究', official: '公文起草' }
const TYPE_LABEL = { all: '全部', ...GROUP_LABEL, imported: '我的稿件' }
const workTypeOf = (w) => w.type || (w.kind === 'official' ? 'official' : w.origin === 'imported' ? 'imported' : w.articleKind === 'research' ? 'research' : 'analysis')

function setWorksFilter(type) {
  state.worksFilter = type
  history.replaceState(null, '', type === 'all' ? '#/works' : `#/works?t=${type}`)
  persist()
}
const writeGroup = () => (state.write.group === 'research' ? 'research' : state.write.group === 'official' ? 'official' : 'analysis')
// 篇幅按组记住：从研究切回分析、再切回来，用户填的值还在
function applyWriteGroup(g) {
  const next = ['analysis', 'research', 'official'].includes(g) ? g : 'analysis'
  const prev = writeGroup()
  const lengths = state.write.lengths
  if (prev !== 'official') lengths[prev] = String(state.write.length)
  state.write.group = next
  state.write.kindId = next === 'research' ? 'research' : 'analysis'
  if (next !== 'official') {
    const k = articleKind(next)
    state.write.length = String(articleLength(k, lengths[next]))
    lengths[next] = state.write.length
  }
}

function articlePrompt() {
  const g = writeGroup()
  const k = articleKind(g)
  return WA_PROMPTS.article({
    ...state.write,
    kindId: g,
    kindName: k.name,
    voice: voiceProfile(),
    supplement: state.write.supplement !== false,
    materialFiles: state.write.materialFiles || [],
  })
}

// 篇幅：一个数字框 + 一排快捷档。所有组都能自己填，低于下限会被抬到下限。
function lengthRow({ min, def, presets, current, presetsAttr }) {
  const cur = articleLength({ min, def }, current)
  return `<div class="len">
      <span>约</span>
      <input data-w="length" inputmode="numeric" value="${cur}" aria-label="篇幅（字）"><span class="unit">字</span>
      <span class="presets">${presets.map((n) => `<button ${presetsAttr}="${n}" aria-pressed="${cur === n}">${n}</button>`).join('')}</span>
    </div>
    <p class="len-note">这一组最短 ${min} 字。</p>`
}

// 一行设置摘要：篇幅 / 读者 / 语气 / 引用。点一下就地展开，改完自动收起
function articleSettings(g) {
  const f = state.write
  const k = articleKind(g)
  const cur = articleLength(k, f.length)
  const voice = voiceProfile() || '跟随文体'
  const items = [
    ['length', '篇幅', `约 ${cur} 字`],
    ['audience', '读者', f.audience.trim() || '普通读者'],
    ['voice', '语气', voice],
  ]
  if (g === 'research') items.push(['citation', '引用格式', f.citation === 'numbered' ? '编号＋参考资料' : '行内归属'])
  return items
}

function paintSettingValues() {
  const values = writeGroup() === 'official' ? [['length', '', `约 ${officialLength()} 字`]] : articleSettings(writeGroup())
  for (const [id, , value] of values) {
    const label = $(`[data-set="${id}"] .val`)
    if (label) label.textContent = value
  }
}

function settingDone() {
  return '<div class="set-confirm"><button class="btn" type="button" data-set-done>确定</button></div>'
}

function writeSettingsContent(g) {
  const id = state.setOpen
  if (g === 'official' && state.tool === 'layout') return officialLayoutPanel()
  if (!id) return ''
  const fields = g === 'official' ? `<div class="set-body">${officialLengthRow()}</div>` : settingPanel(g, id)
  return `<div class="set-panel">${fields}${settingDone()}</div>`
}

function openWriteSetting(id) {
  const g = writeGroup()
  const slot = $('#write-settings')
  if (!slot) return
  state.setOpen = id === 'layout' ? '' : id
  if (g === 'official') state.tool = id === 'layout' ? 'layout' : ''
  $$('.settings [aria-expanded]').forEach((el) => {
    el.setAttribute('aria-expanded', String((el.dataset.set || el.dataset.tool) === id))
  })
  slot.innerHTML = writeSettingsContent(g)
  slot.classList.add('changed')
}

function settingsRow(g) {
  const items = articleSettings(g)
  return `<div class="settings" role="group" aria-label="这次写作的设置">
      ${items
        .map(
          ([id, label, value]) =>
            `<button data-set="${id}" aria-controls="write-settings" aria-expanded="${state.setOpen === id}"><span class="key">${label}</span><span class="val">${esc(value)}</span>${icon('chev')}</button>`,
        )
        .join('')}
    </div>
    <div id="write-settings">${writeSettingsContent(g)}</div>`
}

function settingPanel(g, id) {
  const f = state.write
  const k = articleKind(g)
  if (id === 'length') {
    return `<div class="set-body">${lengthRow({ min: k.min, def: k.def, presets: k.presets, current: f.length, presetsAttr: 'data-len' })}</div>`
  }
  if (id === 'audience') {
    return `<div class="set-body"><input class="v-input" data-w="audience" placeholder="例如：对游戏和数字行业感兴趣的人" value="${esc(f.audience)}">
      <p class="hint">写清楚读者是谁，模型会按他们的常识水平取舍背景。</p></div>`
  }
  if (id === 'voice') {
    return `<div class="set-body">${voiceSelect()}</div>`
  }
  if (id === 'citation') {
    return `<div class="set-body"><div class="seg">
      <button data-w-cite="inline" aria-pressed="${f.citation !== 'numbered'}">行内归属</button>
      <button data-w-cite="numbered" aria-pressed="${f.citation === 'numbered'}">编号＋参考资料</button>
    </div><p class="hint">全篇统一一种：行内把出处写进句子；编号则在文末「参考资料」里一一对应。</p></div>`
  }
  return ''
}

function voiceSelect() {
  const profiles = usableVoiceProfiles()
  if (!profiles.length) return '<p class="hint">还没有可用档案。<a class="btn-text" href="#/voice">去语气档案</a></p>'
  const choice = voiceChoice()
  const fallback = defaultVoiceProfile()
  const options = [['', fallback ? `跟随默认（${fallback}）` : '跟随默认'], ['__none__', '本次不用'], ...profiles.map(({ name }) => [name, name])]
  return `<select class="v-select" aria-label="语气档案" data-w="voice">${options.map(([value, label]) => `<option value="${esc(value)}" ${choice === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`
}

// 页眉页脚：设置区就地展开两行，选图后随稿保存，导出时印上去
function officialLayoutPanel() {
  return `<div class="tool-card inline">
      <div class="imgs-stack">${imageSlot('headerImage')}${imageSlot('footerImage')}</div>
      <p class="hint" style="margin-top:8px">所选图片会随稿件保存，导出 Word 时应用。</p>
    </div>`
}

function editPageNumber(scope) {
  const spec = data.pageNumbers
  const workId = scope === 'work' ? currentWork?.id : ''
  const p = { ...spec.defaults, ...(workId ? currentWork.pageNumber : state.official.pageNumber) }
  const options = (values, chosen) => Object.entries(values).map(([k,v]) => `<option value="${k}" ${k === chosen ? 'selected' : ''}>${esc(v)}</option>`).join('')
  openModal(`<div class="modal-head"><h2>页码</h2></div>
    <form id="page-number-form" data-work="${esc(workId)}">
      <label><input type="checkbox" name="enabled" ${p.enabled ? 'checked' : ''}> 显示页码</label>
      <fieldset ${p.enabled ? '' : 'disabled'}>
        <label>样式<select name="style" class="input">${options(spec.styles, p.style)}</select></label>
        <label>位置<select name="position" class="input">${options(spec.positions, p.position)}</select></label>
        <label><input type="checkbox" name="first" ${p.first ? 'checked' : ''}> 首页显示页码</label>
      </fieldset>
      <div class="modal-actions"><button type="button" data-close-modal class="btn ghost">取消</button><button class="btn" type="submit">保存</button></div>
    </form>`, 'short')
}

document.addEventListener('submit', async (e) => {
  const form = e.target
  if (form.id !== 'page-number-form') return
  e.preventDefault()
  const f = form.elements
  const value = { enabled: f.enabled.checked, first: f.first.checked, style: f.style.value, position: f.position.value }
  const id = form.dataset.work
  const save = form.querySelector('[type=submit]')
  if (save.disabled) return
  save.disabled = true
  try {
    if (id) {
      const r = await fetch('api/works/update', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, patch: { pageNumber: value } }) }).then(res => res.json())
      if (!r.ok) throw new Error(r.error || '保存失败')
      if (currentWork?.id === id) currentWork.pageNumber = value
    } else {
      state.official.pageNumber = value
      persist()
      render()
    }
    if (form.isConnected) closeModal()
    $(id ? '[data-viewer-more]' : '[data-page-number="draft"]')?.focus()
    toast('页码设置已保存')
  } catch (error) {
    save.disabled = false
    toast(error.message)
  }
})

// 每份材料实际采用多少字：超过上限的部分不送模型，页面上说清楚
function materialRange(files) {
  let used = 0
  return files
    .map((file, index) => {
      const keep = Math.max(0, Math.min(file.chars, MATERIAL_LIMIT - used))
      used += keep
      const omitted = file.chars - keep
      return `<div class="mf"><span class="mfn">${esc(file.name)}</span><span class="hint">采用 ${keep} 字${omitted ? ` · 省略 ${omitted} 字（超出本次上限）` : ''}</span><button class="text" data-remove-material="${index}" aria-label="移除 ${esc(file.name)}">移除</button></div>`
    })
    .join('')
}

async function materialDigest(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// 只删除未被手动改写的附件原文，输入框里的其他文字继续保留。
async function removeMaterial(index) {
  const files = state.write.materialFiles || []
  const file = files[index]
  if (!file) return
  const marker = `## 材料：${file.name}\n\n`
  const text = state.write.materials
  const matches = [...text.matchAll(/(?:^|\n)## 材料：[^\n]+\n\n/g)]
  const rank = files.slice(0, index).filter((item) => item.name === file.name).length
  const markerMatch = matches.filter((item) => item[0].endsWith(marker))[rank]
  let removedText = false
  if (markerMatch) {
    const start = markerMatch.index + (markerMatch[0].startsWith('\n') ? 1 : 0)
    const end = start + marker.length + file.chars
    const original = text.slice(start + marker.length, end)
    const matchesOriginal = file.digest ? await materialDigest(original) === file.digest
      : /^\s*(?:## 材料：|$)/.test(text.slice(end))
    if (state.write.materialFiles !== files) return
    if (matchesOriginal && state.write.materials === text && (end === text.length || text[end] === '\n')) {
      state.write.materials = `${text.slice(0, start)}${text.slice(end + 1)}`.trimStart()
      removedText = true
    }
  }
  state.write.materialFiles = files.filter((_, i) => i !== index)
  state.write.materialNames = state.write.materialFiles.map((item) => item.name)
  persist()
  render()
  toast(`已移除 ${file.name}${markerMatch && !removedText ? '，保留输入框中已编辑的文字' : ''}`)
}

function articleForm(g) {
  const f = state.write
  const k = articleKind(g)
  const ready = Boolean(f.title.trim() || f.materials.trim())
  const names = f.materialNames || []
  const supplement = f.supplement !== false
  const hasMat = f.materials.trim().length > 0
  return `<h1 class="article-field-title"><label class="field" for="w-title">题目</label></h1>
    <input class="input titlein" id="w-title" data-w="title" aria-label="题目" value="${esc(f.title)}" placeholder="一句话说清要写什么">
    <div class="group">
      <label class="field" for="w-materials">材料<span class="subtle">选填</span></label>
      <div class="area" id="mat-drop">
        <textarea id="w-materials" data-w="materials" aria-label="材料" placeholder="粘贴报道原文、访谈记录或数据表，也可以拖入文件">${esc(f.materials)}</textarea>
        <div class="area-foot">
          <button class="btn" data-add-file>${icon('clip')}添加文件</button>
          <span class="types">.docx、.md、.txt、.html</span>
          <span class="mat-count" id="mat-count" ${hasMat ? '' : 'hidden'}>${f.materials.length} 字${names.length ? ` · ${names.length} 个文件` : ''}</span>
        </div>
      </div>
      ${hasMat && names.length ? `<div class="mat-files">${materialRange(f.materialFiles || [])}</div>` : ''}
    </div>
    <label class="check"><input type="checkbox" data-w-check="supplement" ${supplement ? 'checked' : ''}><span>允许检索公开资料</span></label>
    ${settingsRow(g)}
    <div class="actions">
      <button class="act" data-start-article ${ready ? '' : 'disabled'}>生成初稿${icon('right')}</button>
      <button class="text" data-toggle-prompt>查看任务说明</button>
      <button class="text" data-tool="reset" ${ready ? '' : 'hidden'}>清空</button>
    </div>
    <p class="near" data-article-hint ${ready ? 'hidden' : ''}>填写题目或添加材料即可生成。</p>
    ${state.promptOpen ? `<div class="prompt-box" id="prompt-out">${esc(articlePrompt())}</div>
      <div class="actions"><button class="btn" data-copy-prompt>复制任务说明</button></div>` : ''}`
}

// ---------------- 写作台侧栏：工具条 + 展开面板 ----------------
const TOOL_DEFS = {
  analysis: [
    ['length', '字数', 'sliders'],
    ['audience', '目标读者', 'users'],
    ['voice', '语气档案', 'voice'],
    ['reset', '清空', 'trash'],
  ],
  research: [
    ['length', '字数', 'sliders'],
    ['audience', '目标读者', 'users'],
    ['voice', '语气档案', 'voice'],
    ['reset', '清空', 'trash'],
  ],
  official: [
    ['length', '字数', 'sliders'],
    ['layout', '页眉页脚', 'image'],
    ['reset', '清空要素', 'trash'],
  ],
}

function toolPanel(g, tool) {
  if (tool === 'length') {
    const k = articleKind(g)
    return `<div class="tool-card">
      <div class="side-h">字数</div>
      ${g === 'official'
        ? officialLengthRow()
        : lengthRow({ min: k.min, def: k.def, presets: k.presets, current: state.write.length, presetsAttr: 'data-len' })}
    </div>`
  }
  if (tool === 'audience') {
    return `<div class="tool-card">
      <div class="side-h">目标读者</div>
      <input class="v-input" aria-label="目标读者" data-w="audience" placeholder="例如：对游戏和数字行业感兴趣的人" value="${esc(state.write.audience)}">
      <p class="hint" style="margin-top:8px">写清楚读者是谁，模型会按他们的常识水平取舍背景。</p>
    </div>`
  }
  if (tool === 'voice') {
    return `<div class="tool-card">
      <div class="side-h">语气档案</div>
      ${voiceSelect()}
    </div>`
  }
  if (tool === 'layout') {
    return `<div class="tool-card">
      <div class="side-h">页眉页脚</div>
      <div class="imgs-stack">${imageSlot('headerImage')}${imageSlot('footerImage')}</div>
      <p class="hint" style="margin-top:8px">图片存在本机图库，导出 Word 时印到页眉 / 页脚。</p>
    </div>`
  }
  return ''
}

function toolRail(g) {
  const defs = TOOL_DEFS[g] || TOOL_DEFS.analysis
  return `<div class="tool-rail">${defs
    .map(
      ([id, label, name]) =>
        `<button class="tool${state.tool === id ? ' on' : ''}" data-tool="${id}" data-label="${label}" aria-label="${label}" aria-pressed="${state.tool === id}">${icon(name)}</button>`,
    )
    .join('')}</div>`
}

// 侧栏默认内容：最近稿件 + 稿件库数字
function recentBlock(g) {
  const all = data?.works || []
  const isOfficial = g === 'official'
  const list = all.filter((w) => (isOfficial ? w.kind === 'official' : w.kind === 'article')).slice(0, 3)
  return `<div class="side-panel">
      <div class="side-h">最近${isOfficial ? '公文' : '稿件'} <a href="#/works">全部</a></div>
      ${list.length
        ? list.map((w) => `<button class="pick" data-open-work="${w.id}">
              <span><span class="pick-name">${esc(w.title)}</span><span class="pick-sub">${w.chars} 字 · ${time(w.updatedAt)}</span></span>
            </button>`).join('')
        : '<p class="hint" style="padding:10px 0 6px">这一组还没有成稿。</p>'}
    </div>`
}

function writeAside(g) {
  const defs = (TOOL_DEFS[g] || []).map((d) => d[0])
  const tool = defs.includes(state.tool) ? state.tool : ''
  return `${toolRail(g)}<div class="tool-area${tool ? ' open' : ''}">${tool ? toolPanel(g, tool) : recentBlock(g)}</div>`
}

function viewWrite() {
  const g = writeGroup()
  const tabs = ['analysis', 'research', 'official']
    .map((id) => `<button class="mode${g === id ? ' on' : ''}" id="write-tab-${id}" role="tab" aria-selected="${g === id}" aria-controls="write-fields" tabindex="${g === id ? 0 : -1}" data-w-group="${id}">${GROUP_LABEL[id]}</button>`)
    .join('')
  return `<div class="pg${g === 'official' ? '' : ' form'}">
    ${pendingNote(g === 'official' ? 'official' : 'article')}${jobSection()}
    <div class="modes" role="tablist" aria-label="写什么">${tabs}</div>
    <section id="write-fields" role="tabpanel" aria-labelledby="write-tab-${g}">${g === 'official' ? officialForm() : articleForm(g)}</section>
  </div>`
}

const jobSection = () => '<section id="job-panel" class="job-section" tabindex="-1" aria-label="后台任务" hidden></section>'

function hideJob(id) {
  state.hiddenJobs = [...new Set([...state.hiddenJobs, id])].slice(-40)
  persist()
}

function pendingNote(kind) {
  const p = state.pending
  if (!p || p.kind !== kind || !p.chat) return ''
  return `<div class="banner-note"><span class="mono">进行中</span><span>任务已在对话里发出（${time(p.at)}）。模型存稿后这里会提示，可到稿件库打开。<button data-refresh>刷新</button></span></div>`
}

// 列表渲染：搜到来源台账时，片段前标出来源
function worksListHtml(list, f, q) {
  if (!list.length) {
    if (q) return '<div class="empty"><h2>没有匹配稿件</h2><p class="sub">试试其他关键词，或查看当前分类的全部稿件。</p><button class="text" data-clear-search>清除关键词</button></div>'
    if (f === 'imported') return '<div class="empty"><h2>还没有导入的稿件</h2><p class="sub">粘贴正文或选择 Markdown 文件，导入后即可编辑。</p></div>'
    return '<div class="empty"><h2>还没有稿子</h2><p class="sub">在写作台生成的稿件会收在这里。</p><a class="text" href="#/write">开始写作</a></div>'
  }
  return `<div class="rows">${list
    .map(
      (w) => `<div class="row">
        <div class="main">
          <small>${TYPE_LABEL[workTypeOf(w)]}</small>
          <h2><button class="topic" data-open-work="${w.id}" title="${esc(w.title)}">${esc(w.title)}</button></h2>
          <p>${w.foundIn === 'sources' ? '<span class="tag">来源台账</span> ' : ''}${esc(w.snippet || '')}</p>
        </div>
        <div class="meta"><small><span>${w.chars} 字</span><time datetime="${esc(w.updatedAt)}">${date(w.updatedAt)}</time></small><button class="text" data-del-work="${w.id}" aria-label="删除 ${esc(w.title)}">删除</button></div>
      </div>`,
    )
    .join('')}</div>`
}

let searchTimer = 0
let searchRequest = 0
function applySearchFilter() {
  clearTimeout(searchTimer)
  const request = ++searchRequest
  searchTimer = setTimeout(() => runSearch(request), 220)
}

async function runSearch(request) {
  const wrap = $('#wlist-wrap')
  if (!wrap) return
  const q = String(state.wq || '').trim()
  const f = state.worksFilter || 'all'
  if (!q) {
    wrap.removeAttribute('aria-busy')
    wrap.innerHTML = worksListHtml((data.works || []).filter((w) => f === 'all' || workTypeOf(w) === f), f, '')
    return
  }
  wrap.setAttribute('aria-busy', 'true')
  try {
    const r = await fetch(`api/works?q=${encodeURIComponent(q)}&type=${encodeURIComponent(f)}`, { cache: 'no-store' }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error)
    if (request === searchRequest && wrap.isConnected) wrap.innerHTML = worksListHtml(r.works || [], f, q)
  } catch {
    if (request === searchRequest && wrap.isConnected) {
      wrap.innerHTML = '<div class="empty"><h2>搜索失败</h2><p class="sub">当前无法读取搜索结果。</p><button class="text" data-retry-search>重试搜索</button></div>'
    }
  } finally {
    if (request === searchRequest) wrap.removeAttribute('aria-busy')
  }
}

// ---------------- 视图：稿件库 ----------------
function viewWorks() {
  const all = data.works || []
  const counts = { all: all.length, analysis: 0, research: 0, official: 0, imported: 0 }
  all.forEach((w) => (counts[workTypeOf(w)] += 1))
  const f = state.worksFilter
  const q = String(state.wq || '').trim()
  const list = f === 'all' ? all : all.filter((w) => workTypeOf(w) === f)
  const revs = all
    .flatMap((work) => work.lastRevisions?.[0] ? [{ at: work.lastRevisions[0].at, work }] : [])
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 4)
  return `<div class="pg">
    <div class="works-head">
      <h1>稿件库</h1>
      <div class="works-actions"><button class="btn seal" data-import-work>${icon('upload')}导入稿件</button></div>
    </div>
    <div class="tools works-tools">
      <div class="pills" role="group" aria-label="按类型筛选">${Object.keys(TYPE_LABEL)
        .map((k) => `<button data-wt="${k}" class="${f === k ? 'on' : ''}" aria-pressed="${f === k}">${TYPE_LABEL[k]}<span class="n">${counts[k]}</span></button>`)
        .join('')}</div>
      <label class="works-search">${icon('search')}<input type="search" class="input search" id="wq" maxlength="80" aria-label="搜索稿件" placeholder="搜标题、正文或来源" value="${esc(state.wq || '')}"></label>
    </div>
    <div id="wlist-wrap" aria-live="polite">${q ? '<p class="works-searching">正在搜索…</p>' : worksListHtml(list, f, '')}</div>
    ${(data.trash || []).length
      ? `<details class="fold"><summary>回收区 ${data.trash.length}</summary>${data.trash
          .map(
            (t) => `<div class="fold-row"><span>${esc(t.title)}</span><small>${time(t.at)}</small><button class="btn" data-trash-restore="${esc(t.name)}">恢复</button></div>`,
          )
          .join('')}</details>`
      : ''}
    ${revs.length
      ? `<details class="fold"><summary>最近改动</summary>${revs
          .map(
            (r) => `<div class="fold-row recent-change"><span>${esc(r.work.title)}</span><time datetime="${esc(r.at)}">${time(r.at)}</time></div>`,
          )
          .join('')}</details>`
      : ''}
  </div>`
}

// ---------------- 视图：公文起草 · 模板起草 ----------------
function officialMaterials() {
  const { notes, materialFiles } = state.official
  return [notes.trim(), ...materialFiles.map(({ name, text }) => `## 材料：${name}

${text}`)].filter(Boolean).join('\n\n')
}

function officialReferenceValues() {
  const { referenceMode, refDocType, templateName, templateText } = state.official
  const reference = referenceMode === 'type' ? docType(refDocType) : null
  const useTemplate = referenceMode === 'template' && Boolean(templateText)
  return {
    refDocType: reference?.id || '', docTypeName: reference?.name || '',
    templateName: useTemplate ? templateName : '', templateText: useTemplate ? templateText : '',
  }
}

function officialPrompt() {
  return WA_PROMPTS.officialFree({ ...state.official, ...officialReferenceValues(), notes: officialMaterials(), length: officialLength() })
}

function officialNeedsTemplate() {
  return state.official.referenceMode === 'template' && !state.official.templateText
}

function officialReady() {
  return !officialNeedsTemplate() && Boolean(state.official.prompt.trim() || officialMaterials().trim())
}

function syncOfficialButton() {
  const btn = $('[data-start-official]')
  if (btn) btn.disabled = !officialReady()
  const hint = $('#official-template-needed')
  if (hint) hint.hidden = !officialNeedsTemplate()
}
// 公文篇幅允许 300–5000 字。
const OFFICIAL_DEFAULT_LENGTH = 800
function officialLength() {
  const raw = Math.trunc(Number(state.official.length))
  if (!raw) return OFFICIAL_DEFAULT_LENGTH
  return Math.max(300, Math.min(5000, raw))
}

function officialLengthRow() {
  const cur = officialLength()
  return `<div class="len">
      <input data-o="length" inputmode="numeric" value="${cur}" aria-label="字数"><span class="unit">字</span>
      <span class="presets">
        ${[800, 1500, 3000]
          .map((n) => `<button data-o-len="${n}" aria-pressed="${cur === n}">${n}</button>`)
          .join('')}
      </span>
    </div>
    <p class="len-note">默认 800 字；可以改，300–5000 之间。</p>`
}

function freeFormFields() {
  const { prompt, notes, materialFiles } = state.official
  return `<div class="group">
      <label class="field" for="o-prompt">要写什么</label>
      <textarea class="wide-text" id="o-prompt" data-o="prompt" placeholder="说明用途、送给谁，以及希望对方做什么">${esc(prompt)}</textarea>
    </div>
    <div class="group">
      <label class="field" for="o-notes">材料<span class="subtle">选填</span></label>
      <div class="area" id="official-mat-drop">
        <textarea id="o-notes" data-o="notes" placeholder="粘贴事实、数据或会议要点，也可以拖入文件">${esc(notes)}</textarea>
        <div class="area-foot">
          <button class="btn" type="button" data-add-official-file>${icon('clip')}添加文件</button>
          <span class="types">.docx、.md、.txt、.html</span>
        </div>
      </div>
      ${materialFiles.length ? `<ul class="official-material-list">${materialFiles.map(({ id, name }) =>
        `<li><span>${esc(name)}</span><button class="text" type="button" data-remove-official-file="${esc(id)}" aria-label="移除 ${esc(name)}">移除</button></li>`).join('')}</ul>` : ''}
      <p class="hint" id="official-material-limit" ${officialMaterials().length <= MATERIAL_LIMIT ? 'hidden' : ''}>本次任务采用材料前 60000 字。</p>
    </div>`
}

function officialGroups() {
  const cats = [...new Set(data.docTypes.map((d) => d.category))]
  return `<div class="template-catalog">${cats.map((category) =>
    `<section><h2 class="template-group-title">${esc(category)}</h2><ul class="doc-intro-list">${data.docTypes.filter((d) => d.category === category)
      .map((d) => `<li class="template-row"><span class="template-name">${esc(d.name)}</span><span class="template-description">${esc(d.description)}</span></li>`).join('')}</ul></section>`).join('')}</div>`
}

function officialReferences() {
  const { referenceMode, refDocType, templateName, templateText } = state.official
  const byType = referenceMode === 'type'
  return `<div class="official-references" role="radiogroup" aria-label="选择起草参考方式">
    <div class="official-reference${byType ? ' chosen' : ''}">
      <label class="official-reference-label"><input type="radio" name="official-reference" value="type" ${byType ? 'checked' : ''}><span class="key">参考文种</span></label>
      <select class="input reference-control" data-o="refDocType" aria-label="选择文种" ${byType ? '' : 'disabled'}>
        <option value="">自动判断</option>
        ${data.docTypes.map((d) => `<option value="${esc(d.id)}"${refDocType === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
      </select>
    </div>
    <div class="official-reference${byType ? '' : ' chosen'}" id="official-template">
      <label class="official-reference-label"><input type="radio" name="official-reference" value="template" ${byType ? '' : 'checked'}><span class="key">导入模板</span></label>
      <span class="official-template-choice">
        <button class="btn reference-control" type="button" data-import-template aria-label="${templateText ? `更换模板：${esc(templateName)}` : '选择模板文件'}" ${byType ? 'disabled' : ''}>${icon('clip')}<span class="official-template-name" title="${esc(templateName)}">${templateText ? esc(templateName) : '选择文件'}</span></button>
        <button class="text reference-remove" type="button" data-remove-template aria-label="移除模板" ${byType ? 'disabled' : ''} ${templateText ? '' : 'hidden'}>移除</button>
      </span>
    </div>
  </div>`
}

function paintOfficialReference() {
  const { referenceMode, templateName, templateText } = state.official
  const group = $('.official-references')
  if (group) {
    for (const card of $$('.official-reference', group)) {
      const active = $('input[type="radio"]', card).value === referenceMode
      card.classList.toggle('chosen', active)
      $$('select, button', card).forEach((control) => { control.disabled = !active })
    }
    const template = $('[data-import-template]', group)
    const name = $('.official-template-name', template)
    template.setAttribute('aria-label', templateText ? `更换模板：${templateName}` : '选择模板文件')
    name.textContent = templateText ? templateName : '选择文件'
    name.title = templateName
    $('[data-remove-template]', group).hidden = !templateText
  }
  const out = $('#prompt-out')
  if (out && writeGroup() === 'official') out.textContent = officialPrompt()
  syncOfficialButton()
}

function officialSettingsRow() {
  return `<div class="settings official-settings" role="group" aria-label="公文设置">
    <button type="button" data-set="length" aria-controls="write-settings" aria-expanded="${state.setOpen === 'length'}"><span class="key">篇幅</span><span class="val">约 ${officialLength()} 字</span>${icon('chev')}</button>
    <button type="button" data-tool="layout" aria-controls="write-settings" aria-expanded="${state.tool === 'layout'}"><span class="key">页眉页脚</span>${icon('chev')}</button>
    ${data.pageNumbers ? '<button type="button" data-page-number="draft" aria-label="设置页码"><span class="key">页码</span></button>' : ''}
    <button type="button" data-tool="reset"><span class="key">清空</span></button>
  </div>
  <div id="write-settings">${writeSettingsContent('official')}</div>`
}

function officialForm() {
  if (hashQuery().get('intro') === '1' && hashQuery().get('g') === 'official') {
    return `<header class="template-head"><h1 class="official-h" tabindex="-1">文种介绍</h1>
      <a class="btn" href="#/write?g=official">${icon('back')}返回起草</a></header>${officialGroups()}`
  }
  return `<div class="order">
    <header class="template-head"><h1 class="official-h">描述需求</h1><a class="btn" href="#/write?g=official&intro=1">文种介绍</a></header>
    ${freeFormFields()}
    ${officialReferences()}
    ${officialSettingsRow()}
    <div class="actions">
      <button class="act" data-start-official aria-describedby="official-template-needed" ${officialReady() ? '' : 'disabled'}>起草公文${icon('right')}</button>
      <button class="text" data-toggle-prompt>查看任务说明</button>
    </div>
    <p class="near" id="official-template-needed" ${officialNeedsTemplate() ? '' : 'hidden'}>请先选择模板。</p>
    ${state.promptOpen ? `<div class="prompt-box" id="prompt-out">${esc(officialPrompt())}</div>
      <div class="actions"><button class="btn" data-copy-prompt>复制任务说明</button></div>` : ''}
  </div>`
}

// ---------------- 视图：语气档案 ----------------
let newVoice = false
let voiceNameDraft = ''
let voiceImport = null
let voiceFeedback = null

function currentVoice() {
  const profiles = data?.voice?.profiles || []
  return newVoice ? null : profiles.find((v) => v.name === state.voice.profile) || profiles.find((v) => v.active) || profiles[0] || null
}

function voiceLearning() {
  return jobs.find((j) => j.kind === 'voice' && activeJob(j))
    || Object.values(state.submissions).find((p) => p.kind === 'voice' && starting.has(p.submissionId))
}

function paintVoiceLearning() {
  const button = $('[data-learn-voice]')
  if (!button) return
  const cur = currentVoice()
  const learning = voiceLearning()
  const profileBusy = learning && (learning.request?.profile || learning.name) === cur?.name
  button.disabled = Boolean(learning) || !cur?.samples || Boolean(voiceImport)
  button.textContent = profileBusy ? (learning.status === 'queued' ? '提炼已排队' : '正在提炼…') : cur?.chars ? '重新提炼' : '提炼档案'
  const edit = $('[data-open-voice]')
  if (edit) edit.disabled = Boolean(profileBusy)
  const remove = $('[data-del-voice]')
  if (remove) remove.disabled = Boolean(profileBusy || (voiceImport && voiceImport.name === cur?.name))
}

function viewVoice() {
  const profiles = data.voice?.profiles || []
  const cur = currentVoice()
  const sampleLabel = cur?.samples ? `${cur.samples} 篇` : ''
  const feedback = voiceFeedback?.profile === (cur?.name || '') && voiceFeedback
  const adding = voiceImport && voiceImport.name === (cur?.name || voiceNameDraft.trim())
  return `<div class="pg voice-page">
    <h1>语气档案</h1>
    ${jobSection()}
    <div class="voice">
      <aside aria-label="档案列表" ${profiles.length || data.voiceTrash?.length ? '' : 'hidden'}>
        <div class="voice-section-head">
          <h2>我的档案</h2>
          ${profiles.length ? `<button class="text voice-new" type="button" data-new-voice ${newVoice ? 'disabled' : ''}>${icon('plus')}新建</button>` : ''}
        </div>
        <div class="vlist-side">${profiles
          .map(
            (v) => `<button type="button" class="vrow${v.name === cur?.name ? ' on' : ''}" aria-pressed="${v.name === cur?.name}" data-pick-voice="${esc(v.name)}"><span>${esc(v.name)}</span>${v.active && v.chars ? '<small>默认</small>' : ''}</button>`,
          )
          .join('')}</div>
        ${(data.voiceTrash || []).length
          ? `<details class="fold voice-trash"><summary>回收区</summary>${data.voiceTrash
              .map((t) => `<div class="fold-row"><span>${esc(t.title)}</span><button class="text" data-voice-restore="${esc(t.name)}">恢复</button></div>`)
              .join('')}</details>`
          : ''}
      </aside>
      <div class="voice-detail">
        <div class="voice-detail-head">
          <h2>${cur ? esc(cur.name) : '新建档案'}</h2>
          ${cur ? `<span class="voice-meta">${cur.chars ? '可用于写作' : '待提炼'}</span>` : ''}
          ${newVoice && profiles.length ? '<button class="text" type="button" data-cancel-new-voice>取消</button>' : ''}
        </div>
        ${cur ? '' : `<div class="voice-name-field"><label for="voice-name">档案名</label>
          <input class="input" id="voice-name" maxlength="60" placeholder="例如：公众号写作" value="${esc(voiceNameDraft)}" ${adding ? 'disabled' : ''}></div>`}
        <section class="voice-samples" id="corpus-drop" aria-label="旧稿">
          <div class="voice-section-head"><h3>旧稿${sampleLabel ? `<small>${sampleLabel}</small>` : ''}</h3>
            <button class="btn${cur?.samples ? '' : ' accent'}" type="button" data-add-corpus ${voiceImport ? 'disabled' : ''}>${icon('plus')}${adding ? '正在添加…' : '添加旧稿'}</button>
          </div>
          ${cur?.sampleList?.length
            ? `<ul class="samples">${cur.sampleList
                .map((s) => `<li class="sample"><span>${esc(s.title)}</span><small>${s.chars} 字</small></li>`)
                .join('')}</ul>`
            : '<p class="voice-note">可拖入 Word（.docx）、Markdown、TXT、HTML。</p>'}
          ${feedback ? `<p class="voice-note${feedback.error ? ' voice-error' : ''}" role="${feedback.error ? 'alert' : 'status'}">${esc(feedback.message)}</p>` : ''}
        </section>
        ${cur ? `<div class="voice-controls">
            ${cur.chars ? '<button class="btn accent" type="button" data-open-voice>编辑档案</button>' : ''}
            ${cur.samples ? `<button class="btn${cur.chars ? '' : ' accent'}" type="button" data-learn-voice>提炼档案</button>` : ''}
            ${cur.chars ? `<button class="btn" type="button" data-use-voice>${cur.active ? '取消默认' : '设为写作默认'}</button>` : ''}
            <button class="text voice-delete" type="button" data-del-voice>删除档案</button>
          </div>
          ${cur.samples ? '<p class="voice-note">旧稿在本机解析，提炼时向 DSH 当前配置的模型提交摘录。</p>' : ''}` : ''}
      </div>
    </div>
  </div>`
}

// ---------------- 视图：使用说明 ----------------
// 折叠项的展开状态记在这里，不靠 <details> 自己的 DOM 状态：页面会因为任务轮询、
// 从对话切回来、主题切换而重新渲染，重建后的 <details> 默认是收起的——这就是
// 「点开一个条目，过一会儿自己收回去」的原因。渲染时按 manualOpen 恢复，toggle 时回写。
const manualOpen = new Set()

const MANUAL_GROUPS = [
  {
    id: 'modes',
    title: '写作模式',
    items: [
      ['写作台有哪几种写法？', '文章写作用于公众号等面向公众的文章；深度研究用于系统查证、比较和分析；公文起草用于按文种和版式正式行文。'],
      ['文章写作是什么样？', '把报道、访谈、公开数据等多方材料组织成有判断、易阅读的公众号文章。默认 1500 字，最少 800 字。出处写进句子，文末逐条列来源。'],
      ['深度研究是什么样？', '面向某个领域或事件做深度分析，不是快评。只采信权威信源：官方发布、统计公报、上市公司公告、论文与机构报告；关键事实要能追到两个独立来源。方法上先做横向比较（同期同类地区、公司、产品）和纵向梳理（时间线、阶段变化），再做反例核对和原文回查。默认 3000 字（最少 2000），引用可以用行内归属或编号＋参考资料。'],
      ['公文起草是什么样？', '按 GB/T 9704-2012 的固定格式产出公文，8 个文种：通告、通报、函、纪要、情况专报、讲话稿、工作总结、危机处置报告。先描述需求，再粘贴或上传材料。可选参考文种或导入一份模板，成稿使用对应结构。成稿能机检，也能导出机关版式 Word。'],
    ],
  },
  {
    id: 'parallel',
    title: '并行任务',
    items: [
      ['能同时写几篇？', '最多 2 篇同时执行。在写作台提交一篇后不用等，改掉题目或材料就能接着提交下一篇；超出的任务按提交顺序排队，任意一条结束就自动补位。文章写作、深度研究、公文起草可以混着排，互不影响。'],
      ['怎么知道哪条在跑、排到第几？', '报头显示「N 项进行中 · M 项排队」；写作台显示写作任务，语气档案页显示提炼任务。任务卡显示阶段、队列第几位及估算进度。点「收起」变成细条，点「×」隐藏卡片，后台继续执行。报头状态可找回隐藏的进行中任务。'],
      ['哪些任务不能并行？', '同一篇稿子一次只跑一个改稿任务，避免两个任务互相覆盖；不同的稿子可以各改各的。语气档案一次只提炼一份。相同内容重复提交会合并到原任务，不会起两个。'],
      ['两篇都写完了，会自己弹预览吗？', '完成后可在对应任务点「展开详情」，再打开稿件预览。已取消的任务保持取消。'],
      ['关掉页面或重启 dsh，任务会丢吗？', '不会。任务和状态存在本机，重开页面会按任务标识查回来；dsh 重启后能接回原会话继续写，保留原任务、开始时间和已完成的步骤。'],
    ],
  },
  {
    id: 'start',
    title: '开始写作',
    items: [
      ['只有题目或材料，可以起稿吗？', '可以。选好写法，填题目或加材料，再决定是否允许检索公开资料，然后点「生成初稿」。'],
      ['篇幅和引用怎么定？', '设置行里改：篇幅、读者、语气；深度研究多一项「引用格式」。字数按正文汉字计（一字算一个，西文按词；标点、链接和文末「参考资料」不算），界面上显示的就是这个数。选 3000 字，成稿会落在 2700–3300 字；超出会先删再存，不会按「可读性」放宽。'],
      ['材料放在哪里处理？', '文件在本机解析。提交写作或语气提炼时，所用内容交给 DSH 当前配置的模型。'],
    ],
  },
  {
    id: 'official',
    title: '公文',
    items: [
      ['从哪里开始？', '打开公文起草直接写「描述需求」。右上角「文种介绍」可以查看各文种用途。'],
      ['要素没填全能起草吗？', '能。写明用途和已有事实，缺的要素用占位符或「待核实」。'],
      ['模板怎么导入？', '在「导入模板」里选 Word、Markdown 或文本文件。模型采用模板的章节和条目格式，正文以本次材料为准。选择参考文种会移除导入模板。'],
      ['页眉页脚在哪里设？', '在公文起草的设置行可直接设置页眉页脚和页码，选择随这篇稿保存。'],
    ],
  },
  {
    id: 'review',
    title: '阅读与改稿',
    items: [
      ['怎么导入自己的稿件？', '打开「稿件库 → 导入稿件」，粘贴正文或选择 Word、UTF-8 Markdown 文件，再点「导入并打开」。稿件收在「我的稿件」，也能从「全部」找到。导入后可逐段编辑、让模型给修改建议、恢复版本和导出 Word。'],
      ['怎样增删或修改段落？', '把鼠标移到段落前后的空白处，点「＋」在原位新增，输入内容后点「插入段落」。点一下段落即可用右上角「×」删除，或双击进入手动编辑。'],
      ['模型改的稿会直接覆盖吗？', '不会。模型先提建议，你在审校栏看到原句和新句，采用后才写进正文。'],
      ['改坏了怎么办？', '在正文里按 Ctrl+Z 逐步撤回已保存的修改，按 Ctrl+Shift+Z 或 Ctrl+Y 重做。段落编辑框内沿用浏览器的文字撤回。预览顶部「更多 → 版本历史」可查看并恢复任一版。'],
      ['文章能导出 Word 吗？', '能。打开成稿后，预览顶栏的「导出 Word」按 A4 阅读版式导出：标题、小标题、正文、列表、表格和文末参考资料各用各的样式，页脚带页码；公文仍按文种版式导出。'],
    ],
  },
  {
    id: 'voice',
    title: '语气档案',
    items: [
      ['档案怎么建？', '新建档案，添加几篇同类旧稿，再点「提炼档案」。提炼后可以编辑；文章写作和深度研究可在语气设置里选择档案。'],
      ['删掉的档案能找回吗？', '能，删除会先进回收区，可以恢复。'],
    ],
  },
  {
    id: 'data',
    title: '数据与快捷键',
    items: [
      ['稿子存在哪？', '稿件和档案保存在本机 DSH 数据目录。提交写作或提炼时，相关内容会交给 DSH 当前配置的模型处理。'],
      ['快捷键', 'Esc 关闭弹层或退出编辑；Ctrl/Cmd+Enter 保存段落编辑。'],
    ],
  },
]

function viewAbout() {
  const groups = MANUAL_GROUPS.map((g) => {
    const items = g.items
      .map(([q, a], i) => {
        const key = `${g.id}-${i}`
        return `<details data-manual="${key}"${manualOpen.has(key) ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`
      })
      .join('')
    return `<section class="manual-group" id="manual-${g.id}"><h2>${esc(g.title)}</h2>${items}</section>`
  }).join('')
  return `<div class="pg">
    <h1>使用说明</h1>
    <div class="manual">
      <nav aria-label="使用说明目录">
        ${MANUAL_GROUPS.map((g) => `<button class="manual-nav" data-manual-jump="${g.id}">${esc(g.title)}</button>`).join('')}
      </nav>
      <div class="manual-body">
        <div class="manual-tools">
          <button class="text" data-manual-all="open">全部展开</button>
          <span class="hint">点条目展开；任务状态刷新不会把已展开的条目收回去。</span>
        </div>
        ${groups}
      </div>
    </div>
  </div>`
}

// <details> 的 toggle 不冒泡，用捕获阶段记录；程序化打开/收起也会触发。
document.addEventListener('toggle', (e) => {
  const d = e.target
  if (!(d instanceof HTMLElement) || d.tagName !== 'DETAILS' || !d.dataset.manual) return
  if (d.open) manualOpen.add(d.dataset.manual)
  else manualOpen.delete(d.dataset.manual)
}, true)

const route = () => (location.hash.replace(/^#\/?/, '') || 'write').split('?')[0]
const hashQuery = () => new URLSearchParams(location.hash.split('?')[1] || '')

const VIEWS = { write: viewWrite, works: viewWorks, voice: viewVoice, about: viewAbout }
const TITLES = { write: '写作台', works: '稿件库', voice: '语气档案', about: '使用说明' }
let viewMarkup = ''
let viewRefreshPending = false

function render({ keepFocus, background } = {}) {
  if (!data) return
  let r = route()
  // 老链接：模板起草并进了写作台，公文文稿并进了稿件库
  if (r === 'official') {
    state.write.group = 'official'
    r = 'write'
  }
  if (r === 'docs') {
    location.replace('#/works')
    return
  }
  const q = hashQuery()
  const qg = q.get('g')
  if (['analysis', 'research', 'official'].includes(qg)) applyWriteGroup(qg)
  // 恢复旧草稿进研究页：篇幅低于这一组下限时抬到默认，别让摘要和任务说明对不上
  else if (state.write.group === 'research' && (Number(state.write.length) || 0) < articleKind('research').min) {
    state.write.length = String(articleKind('research').def)
  }
  const qt = r === 'works' && q.get('t')
  if (Object.hasOwn(TYPE_LABEL, qt)) state.worksFilter = qt
  if (!Object.hasOwn(TYPE_LABEL, state.worksFilter)) state.worksFilter = 'all'
  const view = VIEWS[r] ? r : 'write'
  state.view = view
  if (view === 'write') state.write.kindId = state.write.group === 'research' ? 'research' : 'analysis'
  $$('[data-view]').forEach((a) => {
    const active = a.dataset.view === view
    a.classList.toggle('on', active)
    if (active) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
  // 记住当前聚焦的输入：刷新（例如后台任务状态变了）不该让正在填的表单丢光标
  const active = document.activeElement
  const app = $('#app')
  const markup = VIEWS[view]()
  if (background) {
    if (markup === viewMarkup) {
      viewRefreshPending = false
      paintJobPanel()
      paintMast()
      if (view === 'voice') paintVoiceLearning()
      return
    }
    if (app.contains(active) && active.matches('input, textarea, select, button, summary, a[href]')) {
      viewRefreshPending = true
      return
    }
  }
  viewRefreshPending = false
  const remember =
    keepFocus && active instanceof HTMLElement && $('#app')?.contains(active)
      ? {
          id: active.id,
          opt: active.dataset?.o || '',
          w: active.dataset?.w || '',
          selection: 'selectionStart' in active && active.selectionStart !== null
            ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null,
          scroll: active.scrollTop,
        }
      : null
  app.innerHTML = viewMarkup = markup
  paintJobPanel()
  paintMast()
  document.title = `写作助手 · ${TITLES[view]}`
  if (view === 'works') applySearchFilter()
  if (view === 'voice') paintVoiceLearning()
  if (remember) {
    const sel = remember.id
      ? `#${remember.id}`
      : remember.opt
          ? `[data-o="${remember.opt}"]`
          : remember.w
            ? `[data-w="${remember.w}"]`
            : ''
    const el = sel ? $(sel) : null
    if (el) {
      el.focus({ preventScroll: true })
      if (remember.selection) {
        try {
          el.setSelectionRange(...remember.selection)
          el.scrollTop = remember.scroll
        } catch {}
      }
    }
  }
}

// ---------------- 消息：唤起新对话 ----------------
function postStart(prompt) {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'writing-assistant:start', prompt }, location.origin)
    return true
  }
  navigator.clipboard?.writeText(prompt)
  return false
}
addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data) return
  if (e.data.type === 'writing-assistant:start-failed') toast(`没能开新对话：${e.data.message}`)
})

const copy = (text) => {
  navigator.clipboard?.writeText(text).then(
    () => toast('已复制'),
    () => toast('复制失败，手动选中复制'),
  )
}

// ---------------- 预览：纸 + 块 ----------------
const viewer = $('#viewer')
let viewerScroll = 0
function blockHtml(b) {
  const base = `class="blk type-${b.type} role-${b.role}${b.type === 'section' ? ' section-label' : ''}${['标题', '正文'].includes(b.text.replace(/^#+\s*/, '').trim()) ? ' hide-label' : ''}`
  const attrs = `${base}" data-bid="${b.id}" data-hash="${b.hash}" data-type="${b.type}" data-role="${b.role}" tabindex="0"`
  if (b.type === 'section') {
    const label = b.text.replace(/^#+\s*/, '').trim()
    // 板块名做成页边一个真的可点的小标记：块本身高度是 0，光靠伪元素点不到
    return `<div ${attrs} data-label="${esc(label)}"><span class="section-mark">${esc(label)}</span></div>`
  }
  const remove = `<button class="blk-delete" data-quick-delete="${b.id}" title="删除这一段" aria-label="删除这一段">${icon('close')}</button>`
  return `<div ${attrs}>${b.type === 'hr' ? '<hr>' : WA_MD.block(b.text)}${remove}</div>`
}

function renderPaper() {
  if (!currentWork) return ''
  const w = currentWork
  const isOfficial = w.kind === 'official'
  const meta = `<div class="paper-meta">
    <span class="tag">${esc(isOfficial ? w.docTypeName || '公文' : TYPE_LABEL[workTypeOf(w)])}</span>
    ${w.voiceProfile ? `<span class="tag">${esc(w.voiceProfile)}</span>` : ''}
    <span class="mono" style="color:var(--text-helper)">${w.chars} 字 · ${w.blocks.length} 段 · 更新 ${time(w.updatedAt)}</span>
    ${isOfficial && w.check ? `<button class="btn ghost sm" data-show-check>${icon('check')}机检${w.check.ok ? '通过' : '未通过'} · 查看</button>` : ''}
    ${!isOfficial && w.review ? `<button class="btn ghost sm" data-blk="audit">${icon('check')}审校：${w.review.stale ? '需复检' : w.review.ok ? '已通过' : '需核对'}</button>` : ''}
    <button class="btn ghost sm" data-show-sources ${w.sources ? '' : 'disabled'}>${icon('library')}来源台账</button>
  </div>`
  const gap = (position, id = '') => `<button class="blkgap" data-gap="${id}" data-position="${position}" type="button" aria-label="${position === 'before' ? '在这一块之前新增段落' : '在文末新增段落'}"><span>${icon('plus')}</span></button>`
  const body = w.blocks.map((b) => (b.type === 'section' ? '' : gap('before', b.id)) + blockHtml(b)).join('')
  const end = gap('after', w.blocks.at(-1)?.id)
  const importedTitle = workTypeOf(w) === 'imported' && !w.blocks.some((b) => b.type === 'h1')
    ? `<h1>${esc(w.title)}</h1>`
    : ''
  return `<div class="paper ${isOfficial ? 'official' : 'article'}">${meta}${importedTitle}${body || '<p class="hint">正文是空的。</p>'}${end}</div>`
}

function paintPaperCheckButton() {
  const w = currentWork
  const meta = $('#viewer-body .paper-meta')
  if (!w || !meta) return
  meta.querySelector('[data-show-check]')?.remove()
  if (w.kind === 'official' && w.check) {
    meta.insertAdjacentHTML('beforeend', `<button class="btn ghost sm" data-show-check>${icon('check')}机检${w.check.ok ? '通过' : '未通过'} · 查看</button>`)
  }
}

function paintViewerActions() {
  const w = currentWork
  const bar = $('#viewer-actions')
  if (!w) {
    bar.innerHTML = ''
    bar.hidden = true
    return
  }
  bar.hidden = false
  const exportTitle = w.kind === 'official'
    ? '导出 Word；导出后会核对包内结构（页眉页脚图片是否打进去）'
    : '导出 Word（A4 阅读版式：标题、小标题、正文、列表、表格和参考资料）'
  bar.innerHTML = [
    w.kind === 'official'
      ? `<button class="btn ghost sm" data-check-work title="文字和结构检查（章节、层级、文号日期、占位符、语体）">${icon('check')}机检</button>`
      : `<button class="btn ghost sm" data-blk="audit" title="文字和结构检查：数字、引语、待核、参考编号">${icon('check')}文章检查</button>`,
    `<button class="btn seal sm" data-export-work="${w.id}" title="${exportTitle}">${icon('seal')}导出 Word</button>`,
    `<button class="btn ghost sm" data-viewer-more aria-expanded="${state.viewerMore}" aria-label="更多预览操作">${icon('more')}更多</button>`,
    state.viewerMore ? viewerMoreMenu(w) : '',
  ].join('')
}

// 预览栏的次级菜单：复制、下载收进来，主按钮只剩机检 / 导出 Word。
// 全屏、关闭留在顶栏，不再在两处重复。
function viewerMoreMenu(w) {
  return `<div class="viewer-more">
      ${w.kind === 'official' && data.pageNumbers ? `<button class="more-row" data-page-number="work">${icon('doc')}<span>页码</span></button>` : ''}
      <button class="more-row" data-blk="versions">${icon('history')}<span>版本历史</span></button>
      <button class="more-row" data-copy-draft>${icon('copy')}<span>复制 Markdown 全文</span></button>
      <a class="more-row" href="files/works/${w.id}/draft.md" download>${icon('download')}<span>下载 Markdown</span></a>
    </div>`
}

function paintViewerJobStrip() {
  const w = currentWork
  const note = $('#viewer-note')
  if (!w || !note) return
  const job = jobs.find((j) => j.kind === 'revise' && j.workId === w.id && (j.status === 'running' || j.status === 'queued'))
  const text = job ? (job.status === 'queued' ? '改稿已排队' : `改稿中 · 约 ${clientProgress(job)}%`) : `${w.chars} 字`
  if (note.textContent !== text) note.textContent = text
}

let viewerReturnFocus = null

async function openWork(id, { keepScroll = false, quiet = false } = {}) {
  try {
    if (!keepScroll) viewerScroll = 0
    const r = await fetch(`api/works/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '读不到这篇稿子')
    currentWork = r.work
    state.viewerMore = false
    state.railMore = false
    if (r.work.kind === 'official') {
      state.official.headerImage = r.work.headerImage || ''
      state.official.footerImage = r.work.footerImage || ''
    }
    selectedBlock = null
    editingBlock = null
    $('#viewer-body').classList.remove('is-editing')
    pendingRefresh = null
    $('#viewer-title').textContent = currentWork.title
    paintViewerJobStrip()
    paintViewerActions()
    $('#viewer-body').innerHTML = renderPaper()
    $('#viewer-body').scrollTop = keepScroll ? viewerScroll : 0
    const opening = viewer.hidden
    if (opening) viewerReturnFocus = document.activeElement
    viewer.hidden = false
    syncDialogLayers()
    paintAside()
    paintBlockBar()
    if (opening && $('#modal').hidden) $('[data-viewer="back"]').focus({ preventScroll: true })
    if (!quiet) {
      document.title = `${currentWork.title} · 写作助手`
    }
  } catch (e) {
    toast(`打开失败：${e.message}`)
  }
}
function closeViewer({ toLibrary = false } = {}) {
  const edit = editingBlock
  if (edit?.saving) return toast('正在保存这一段')
  if (edit && $('#blk-editor')?.value !== (edit.block?.text || '')) {
    confirmDialog({ title: '放弃这段未保存的修改？', ok: '放弃修改', danger: true }, () => {
      endBlockEdit()
      closeViewer({ toLibrary })
    })
    modalReturnFocus = $('#blk-editor')
    return
  }
  const id = currentWork?.id
  const rail = $('#blk-bar')
  if (rail) {
    rail.hidden = true
    rail.innerHTML = ''
  }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  viewer.hidden = true
  syncDialogLayers()
  $('#viewer-body').innerHTML = ''
  $('#viewer-body').classList.remove('is-editing')
  const bar = $('#viewer-actions')
  if (bar) {
    bar.innerHTML = ''
    bar.hidden = true
  }
  const blkBar = $('#blk-bar')
  if (blkBar) {
    blkBar.hidden = true
    blkBar.innerHTML = ''
  }
  if ($('#viewer-aside')) {
    $('#viewer-aside').hidden = true
    $('#viewer-aside').innerHTML = ''
    $('#viewer-split').classList.remove('aside-on')
  }
  currentWork = null
  selectedBlock = null
  editingBlock = null
  pendingRefresh = null
  document.title = `写作助手 · ${TITLES[route()] || '写作台'}`
  if (toLibrary && route() !== 'works') {
    location.hash = '#/works'
    $('.nav [data-view="works"]')?.focus({ preventScroll: true })
  } else if (route() === 'works') {
    ($(`#wlist-wrap [data-open-work="${id}"]`) || $('#wq'))?.focus({ preventScroll: true })
  } else if (viewerReturnFocus?.isConnected) {
    viewerReturnFocus.focus({ preventScroll: true })
  }
  viewerReturnFocus = null
  refreshJobs()
}

function asideOpen() {
  const a = $('#viewer-aside')
  return a && !a.hidden
}
function openAside(force) {
  const a = $('#viewer-aside')
  const split = $('#viewer-split')
  const next = force === undefined ? a.hidden : Boolean(force)
  a.hidden = !next
  split.classList.toggle('aside-on', next)
  $('#viewer').classList.toggle('aside-on', next)
  if (next) paintAside()
  if (selectedBlock && !editingBlock) paintBlockBar()
}
function toggleAside() {
  const opening = $('#viewer-aside').hidden
  openAside(opening)
  const target = opening ? $('#viewer-aside [data-viewer="aside"]') : $('.viewer-bar [data-viewer="aside"]')
  target?.focus({ preventScroll: true })
}

function selected() {
  return selectedBlock ? currentWork?.blocks.find((b) => b.id === selectedBlock) || null : null
}

const reviseJobOf = (work) => (work ? jobs.find((j) => j.kind === 'revise' && j.workId === work.id && (j.status === 'running' || j.status === 'queued')) : null)

const VERSION_ACTION = { create: '建稿', model: '模型', revert: '撤回', undo: '撤回', redo: '重做', restore: '恢复版本' }

function reviseDraftKey() {
  const block = selected()
  return `${currentWork?.id}:${block ? `${block.id}:${block.hash}` : 'whole'}`
}

// 只刷新右侧面板里的进度那几行：整块重渲染会把用户正在敲的改稿指令和光标冲掉
function paintAsideProgress() {
  const a = $('#viewer-aside')
  if (!a || a.hidden) return
  const job = reviseJobOf(currentWork)
  const box = $('#aside-job')
  if (box) {
    setJobMarkup(box, job ? `${job.status === 'running' ? jobProgress(job) : ''}<div class="hint aside-phase"></div>` : '')
    box.hidden = !job
    if (job) {
      paintProgress(box, job)
      const phase = $('.aside-phase', box)
      const text = job.status === 'queued' ? '改稿已排队' : job.phase || '正在改稿'
      if (phase.textContent !== text) phase.textContent = text
    }
  }
  const label = $('[data-revise-label]')
  const labelText = job ? (job.status === 'queued' ? '已排队' : '改稿中') : '改这一段'
  if (label && label.textContent !== labelText) label.textContent = labelText
  const btn = $('[data-revise-block]')
  if (btn) btn.disabled = !selected() || Boolean(job) || Boolean(editingBlock)
  const all = $('[data-revise-all]')
  if (all) all.disabled = Boolean(job)
  const history = $('.history-actions', a)
  if (history) history.hidden = Boolean(editingBlock)
}

// 待采用的改稿建议：原句 / 新句 / 原因，用户自己决定
function suggestionBlock(w) {
  const list = (w.suggestions || []).filter((s) => s && s.status === 'pending')
  if (!list.length) return ''
  return `<div>
      <h4>待采用的修改 ${list.length}</h4>
      ${list
        .map(
          (s) => {
            const oldText = String(s.original || '')
            const newText = String(s.proposed || '')
            const long = oldText.length > 160 || newText.length > 160
            return `<div class="sug">
            <div class="sug-h"><span class="mono">${esc(s.blockId)}</span>${s.reason ? `<span class="hint">${esc(s.reason)}</span>` : ''}</div>
            <div class="sug-pair"><div class="sug-old"><span>原句</span>${esc(oldText.slice(0, 160))}${oldText.length > 160 ? '…' : ''}</div><div class="sug-new"><span>新句</span>${esc(newText.slice(0, 160))}${newText.length > 160 ? '…' : ''}</div></div>
            ${long ? `<details class="sug-full"><summary>展开全文</summary><div class="sug-full-body"><div><b>原句</b>${esc(oldText)}</div><div><b>新句</b>${esc(newText)}</div></div></details>` : ''}
            <div class="sug-acts"><button class="btn accent sm" data-sug-adopt="${esc(s.id)}">采用</button><button class="btn-text" data-sug-dismiss="${esc(s.id)}">忽略</button></div>
          </div>`
          },
        )
        .join('')}
    </div>`
}

function paintAside() {
  const a = $('#viewer-aside')
  if (!a || a.hidden) return
  const w = currentWork
  if (!w) return
  const b = selected()
  const job = reviseJobOf(w)
  const check = w.check
  a.innerHTML = `<div class="stack">
    <div class="aside-head">
      <h4>审校</h4>
      <button class="ibtn" data-viewer="aside" aria-label="关闭审校，回到正文" title="关闭审校（Esc）">${icon('close')}<span>返回正文</span></button>
    </div>
    ${b ? `<div>
      <h4>选中的段</h4>
      <div class="sel-preview" id="sel-preview">${esc(b.text.slice(0, 400))}</div>
    </div>` : ''}
    ${suggestionBlock(w)}
    <div>
      <label class="field"><span class="label">${b ? '这段怎么改' : '整篇怎么改'}</span>
        <textarea class="textarea" id="revise-input" style="min-height:88px" placeholder="${b ? '例如：压到三句，保留数据' : '例如：压缩篇幅，保留核心事实'}">${esc(reviseDrafts.get(reviseDraftKey()) || '')}</textarea>
      </label>
      <div class="chip-row" style="margin-top:8px">
        ${['润色，保持原意', '压缩 30%，保留数据', '扩写，补一个具体例子', '改得更正式', '去掉 AI 味', '事实核对，标出没有来源的句子'].map((t) => `<button class="chip" data-chip="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="actions" style="margin-top:10px">
        ${b ? `<button class="btn accent sm" data-revise-block>${icon('model')}<span data-revise-label>改这一段</span></button>
        <button class="btn ghost sm" data-blk="evidence">${icon('search')}查依据</button>` : ''}
        <button class="btn ${b ? 'ghost' : 'accent'} sm" data-revise-all ${job ? 'disabled' : ''}>${icon('edit')}改整篇</button>
      </div>
      <div id="aside-job" hidden></div>
    </div>
    ${
      w.kind === 'official'
        ? `<div>
            <h4>机检</h4>
            ${
              check
                ? `<div class="hint" style="margin-bottom:6px">${esc(check.docType || '')} · ${check.ok ? '通过' : '未通过'} · ${time(check.at)}${check.stale ? ' · <b class="stale">正文改过，需复检</b>' : ''}</div>
                   <div class="checklist">
                     ${(check.errors || []).map((e) => `<div class="row2 err"><span class="mk">错误</span><span>${esc(e)}</span></div>`).join('')}
                     ${(check.warnings || []).map((e) => `<div class="row2 warn"><span class="mk">警告</span><span>${esc(e)}</span></div>`).join('')}
                     ${(check.infos || []).map((e) => `<div class="row2 info"><span class="mk">提示</span><span>${esc(e)}</span></div>`).join('')}
                     ${!(check.errors || []).length && !(check.warnings || []).length ? '<div class="row2 ok"><span class="mk">通过</span><span>机检没有报出问题。正式发文前仍需人工校对。</span></div>' : ''}
                   </div>`
                : `<p class="hint">还没跑过机检。点右上角「机检」检查必备章节、结构顺序、层级、文号日期红线、结尾套语和占位符。</p>`
            }
          </div>`
        : ''
    }
    <div>
      <h4>改动记录</h4>
      ${
        (w.revisions || []).length
          ? `<div class="checklist">${w.revisions
              .map((r) => `<div class="row2 info"><span class="mk">${esc(VERSION_ACTION[r.action] || '手改')}</span><span>${time(r.at)}　${esc((r.note || (r.edits || []).map((e) => e.blockId).join('、') || '').slice(0, 60))}</span></div>`)
              .join('')}</div>`
          : `<p class="hint">还没有改动记录。手改和模型改都会记在这里。</p>`
      }
      ${w.canUndo || w.canRedo ? `<div class="actions history-actions" style="margin-top:10px">
        ${w.canUndo ? `<button class="btn ghost sm" data-revert-work aria-keyshortcuts="Control+Z Meta+Z">${icon('undo')}撤回</button>` : ''}
        ${w.canRedo ? `<button class="btn ghost sm" data-redo-work aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z">${icon('redo')}重做</button>` : ''}
      </div>` : ''}
    </div>
    ${w.sources ? `<div><h4>来源台账</h4><div class="actions"><button class="btn ghost sm" data-show-sources>${icon('library')}看来源台账</button></div></div>` : ''}
  </div>`
  paintAsideProgress()
}

function selectBlock(bid) {
  if (editingBlock) return toast('先保存或取消正在改的那一段')
  selectedBlock = bid
  state.railMore = false
  $$('#viewer-body .blk').forEach((el) => el.classList.toggle('on', el.dataset.bid === bid))
  paintBlockBar()
  if (asideOpen()) paintAside()
}

// 选中的块：工具条固定在预览底部，不压正文；正在编辑某一段时整条收起，
// 免得「让模型改」把没保存的手改冲掉。
// 「更多」：结构操作与查依据、版本历史都收在这里，主位只留三个动作
function railMoreMenu({ canMerge, canPromote, canUp, canDown, off, isSection }) {
  const item = (op, name, label, disabled, tip = label) =>
    `<button class="rail-menu-item" data-blk="${op}" title="${tip}" ${disabled ? 'disabled' : ''}>${icon(name)}<span>${label}</span></button>`
  return `<div class="rail-more" role="group" aria-label="段落操作">
    ${item('merge', 'merge', '与上段合并', !canMerge)}
    ${item('heading', 'heading', '改成小标题', !canPromote)}
    ${item('up', 'up', '上移', !canUp)}
    ${item('down', 'down', '下移', !canDown)}
    ${item('delete', 'trash', isSection ? '结构板块不能删' : '删掉这一段', off || isSection)}
    <span class="rsep"></span>
    ${item('evidence', 'search', '查依据', off)}
    ${item('versions', 'history', '版本历史', !currentWork)}
    ${item('cancel', 'close', '取消选择', off)}
    ${currentWork.canUndo ? item('revert', 'undo', '撤回', false, '撤回（Ctrl+Z）') : ''}
    ${currentWork.canRedo ? item('redo', 'redo', '重做', false, '重做（Ctrl+Shift+Z 或 Ctrl+Y）') : ''}
  </div>`
}

function paintBlockBar() {
  const bar = $('#blk-bar')
  if (!bar) return
  const viewerEl = $('#viewer')
  if (!currentWork || !viewerEl || viewerEl.hidden || editingBlock) {
    bar.hidden = true
    bar.innerHTML = ''
    return
  }
  const b = selected()
  const isSection = b ? b.type === 'section' : false
  const idx = b ? currentWork.blocks.findIndex((x) => x.id === b.id) : -1
  const prev = idx > 0 ? currentWork.blocks[idx - 1] : null
  const mergable = (x) => Boolean(x) && ['p', 'ul', 'ol', 'quote'].includes(x.type)
  const canMerge = Boolean(b) && mergable(prev) && mergable(b)
  const canPromote = Boolean(b) && b.type === 'p'
  const canUp = Boolean(b) && idx > 0 && !isSection && currentWork.blocks[idx - 1].type !== 'h1' && b.type !== 'h1'
  const canDown = Boolean(b) && idx >= 0 && idx < currentWork.blocks.length - 1 && !isSection && b.type !== 'h1'
  // 未选中段落时只显示可执行的历史操作。
  const off = !b
  if (off) {
    bar.hidden = !currentWork.canUndo && !currentWork.canRedo
    bar.innerHTML = `${currentWork.canUndo ? `<button class="rbtn" data-blk="revert" data-label="撤回（Ctrl+Z）" data-short="撤回" aria-label="撤回" aria-keyshortcuts="Control+Z Meta+Z">${icon('undo')}</button>` : ''}
      ${currentWork.canRedo ? `<button class="rbtn" data-blk="redo" data-label="重做（Ctrl+Shift+Z）" data-short="重做" aria-label="重做" aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z">${icon('redo')}</button>` : ''}`
    if (!bar.hidden) placeRail()
    return
  }
  const item = (op, name, label, disabled, tip = label, short = label) =>
    `<button class="rbtn" data-blk="${op}" data-label="${tip}" data-short="${short}" aria-label="${label}" ${disabled ? 'disabled' : ''}>${icon(name)}</button>`
  bar.hidden = false
  bar.innerHTML = `<span class="blk-bar-id">${esc(b.id)}</span>
    ${item('edit', 'edit', '手动编辑', off, '手动编辑（双击段落也行）', '编辑')}
    ${item('model', 'model', '让模型改', off, '让模型改这一段', '模型改')}
    <button class="rbtn${state.railMore ? ' on' : ''}" data-rail-more="1" data-label="更多（合并、移动、删除、版本）" data-short="更多" aria-label="更多" aria-expanded="${state.railMore}">${icon('more')}</button>
    ${state.railMore ? railMoreMenu({ canMerge, canPromote, canUp, canDown, off, isSection }) : ''}
  `
  placeRail()
}

function placeRail() {
  const bar = $('#blk-bar')
  const paper = $('#viewer-body .paper')
  if (!bar || !paper) return
  const docked = getComputedStyle(bar).position === 'relative'
  const wide = window.innerWidth > 1100 && !docked
  bar.style.left = wide ? `${Math.min(Math.round(paper.getBoundingClientRect().right + 20), innerWidth - bar.offsetWidth - 8)}px` : ''
  bar.style.right = wide ? 'auto' : ''
  const menu = $('.rail-more', bar)
  if (!menu) return
  if (docked) {
    menu.style.top = ''
    return
  }
  const trigger = $('[data-rail-more]', bar).getBoundingClientRect()
  const top = clamp(trigger.top, 8, innerHeight - menu.offsetHeight - 8)
  menu.style.top = `${top - bar.getBoundingClientRect().top - bar.clientTop}px`
}

function clearSelection() {
  state.railMore = false
  selectedBlock = null
  $$('#viewer-body .blk').forEach((el) => el.classList.remove('on'))
  paintBlockBar()
  if (asideOpen()) paintAside()
}

function startEditBlock(bid) {
  if (editingBlock) return toast('先保存或取消正在改的那一段')
  const block = currentWork?.blocks.find((x) => x.id === bid)
  const el = $(`#viewer-body .blk[data-bid="${bid}"]`)
  if (block && el) openBlockEditor({ block, el })
}

function startInsertBlock(gap) {
  if (editingBlock || !currentWork) return
  const anchor = currentWork.blocks.find((b) => b.id === gap.dataset.gap)
  const el = document.createElement('div')
  el.className = 'blk blk-new'
  gap.after(el)
  clearSelection()
  openBlockEditor({ gap, el, anchor, position: gap.dataset.position })
}

function openBlockEditor(edit) {
  const { block, el } = edit
  edit.workId = currentWork.id
  edit.version = currentWork.versions?.[0]?.n || 0
  editingBlock = edit
  $('#viewer-body').classList.add('is-editing')
  paintBlockBar()
  paintAsideProgress()
  const beforeHeight = Math.round(el.getBoundingClientRect().height)
  el.classList.add('editing')
  const raw = block?.text || ''
  const type = block?.type || 'p'
  el.innerHTML = `<textarea class="blk-editor" id="blk-editor" spellcheck="false" aria-label="${block ? '这一段原文' : '新段落正文'}"${block ? '' : ' placeholder="输入新段落…"'}></textarea>
    <div class="blk-editor-actions"><span class="hint">${block ? '块内原文（Markdown）。保存只改这一段；Esc 取消。' : '支持 Markdown。Esc 取消。'}</span><button class="btn ghost sm" data-blk-cancel>取消</button><button class="btn accent sm" data-blk-save>${block ? '保存' : '插入段落'}</button></div>`
  const ta = $('#blk-editor')
  ta.value = raw
  // 编辑沿用该段的字号、行高和缩进：进出编辑时首行位置不跳
  const sizes = { h1: currentWork?.kind === 'official' ? 26 : 31, h2: 20, h3: 16.5, h4: 15 }
  const size = sizes[type] || 17
  const ratio = type === 'h1' ? 1.4 : type === 'h2' || type === 'h3' ? 1.45 : type === 'h4' ? 1.5 : 1.85
  const lineHeight = Math.round(size * ratio * 10) / 10
  ta.style.fontSize = `${size}px`
  ta.style.lineHeight = `${lineHeight}px`
  if (currentWork.kind === 'official' && type === 'p') ta.style.textIndent = '2em'
  ta.style.height = `${Math.max(110, Math.min(440, Math.max(beforeHeight, raw.split('\n').length * lineHeight + 34)))}px`
  ta.focus()
  ta.setSelectionRange(raw.length, raw.length)
}

// 取消编辑：把这一段恢复成渲染后的样子，编辑框消失，选中状态留着
function cancelBlockEdit() {
  const edit = editingBlock
  if (!edit || edit.saving) return
  endBlockEdit()
  if (edit.block) {
    const { id } = edit.block
    edit.el.outerHTML = blockHtml(currentWork.blocks.find((block) => block.id === id) || edit.block)
    selectBlock(id)
    $(`#viewer-body .blk[data-bid="${id}"]`)?.focus({ preventScroll: true })
  } else {
    edit.el.remove()
    paintBlockBar()
    paintAsideProgress()
    edit.gap.focus({ preventScroll: true })
  }
  applyPendingRefresh()
}

function endBlockEdit() {
  editingBlock = null
  $('#viewer-body').classList.remove('is-editing')
}

async function saveBlockEdit() {
  const ta = $('#blk-editor')
  const edit = editingBlock
  if (!ta || !currentWork || !edit || edit.saving) return
  const b = edit.block
  // 正文段落里按 Enter 换行，保存后要真的分成两段（Markdown 单个换行在渲染时会并成一行）
  const raw = ta.value
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const markup = !b && lines.every((line) => /^([-*+]\s|\d+[.)]\s|#{1,6}\s|>)/.test(line))
  const content = b?.type === 'p' || !b ? lines.join(markup ? '\n' : '\n\n') : raw
  if (!content.trim()) {
    if (!b) {
      ta.focus()
      return toast('输入新段落的内容后再插入')
    }
    // 整段清空 = 想删掉这一段：问一句，确认后走删除（和底部「删」同一个动作）
    confirmDialog(
      {
        title: '这一段被清空了，删掉吗？',
        body: b.text.slice(0, 160) + (b.text.length > 160 ? '…' : ''),
        note: '删完可以用「撤回」恢复；想保留就点取消，接着写。',
        ok: '删掉这一段',
        danger: true,
      },
      async () => {
        try {
          const r = await fetch('api/works/block', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: edit.workId, blockId: b.id, action: 'delete', expect: b.hash }),
          }).then((x) => x.json())
          if (!r.ok) throw new Error(r.error || '删除失败')
          if (editingBlock !== edit) return
          endBlockEdit()
          await applyWorkUpdate(r.work)
          toast('已删除这一段，可用「撤回」恢复')
        } catch (e) {
          toast(`删除失败：${e.message}`)
        }
      },
    )
    return
  }
  if (b && content.trim() === b.text.trim()) {
    toast('内容没变')
    cancelBlockEdit()
    return
  }
  const target = b
    ? { blockId: b.id, action: 'replace', expect: b.hash }
    : { [edit.position === 'before' ? 'beforeId' : 'afterId']: edit.anchor?.id, action: 'insert', expect: edit.anchor?.hash }
  const version = b ? currentWork.versions?.[0]?.n : edit.version
  const controls = $$('button', edit.el)
  edit.saving = true
  controls.forEach((button) => (button.disabled = true))
  ta.readOnly = true
  try {
    const r = await fetch('api/works/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: edit.workId, version, ...target, content }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '保存失败')
    if (editingBlock !== edit) return
    const anchorIndex = currentWork.blocks.findIndex((block) => block.id === edit.anchor?.id)
    endBlockEdit()
    await applyWorkUpdate(r.work)
    if (b) toast('已保存这一段')
    else {
      const insertedIndex = edit.position === 'before' ? anchorIndex : anchorIndex + 1
      const inserted = r.work.blocks[insertedIndex]
      if (inserted) {
        selectBlock(inserted.id)
        $(`#viewer-body .blk[data-bid="${inserted.id}"]`)?.focus()
      }
    }
  } catch (e) {
    toast(`保存失败：${e.message}`)
  } finally {
    edit.saving = false
    controls.forEach((button) => (button.disabled = false))
    ta.readOnly = false
  }
}

// 上移 / 下移：和相邻的块换位置，换完还选中这一段
async function moveBlock(bid, dir) {
  const ws = currentWork
  const i = ws.blocks.findIndex((x) => x.id === bid)
  const other = ws.blocks[i + dir]
  if (!other) return toast(dir < 0 ? '已经是第一段了' : '已经是最后一段了')
  if (ws.blocks[i].type === 'h1' || other.type === 'h1') return toast('标题不能移动')
  if (ws.blocks[i].type === 'section' || other.type === 'section') return toast('结构板块不能移动')
  try {
    const r = await fetch('api/works/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: ws.id, blockId: bid, action: 'move', dir }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '移动失败')
    const newId = other.id
    await applyWorkUpdate(r.work)
    selectBlock(newId)
    toast(dir < 0 ? '已上移一段' : '已下移一段')
  } catch (e) {
    toast(`移动失败：${e.message}`)
  }
}

// 与上一段合并：两段拼成一段，原来的分段标记消失
async function mergeBlock(bid) {
  const b = currentWork?.blocks.find((x) => x.id === bid)
  if (!b) return
  try {
    const r = await fetch('api/works/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: currentWork.id, blockId: bid, action: 'merge', expect: b.hash }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '合并失败')
    selectedBlock = null
    await applyWorkUpdate(r.work)
    paintBlockBar()
    toast('已与上一段合并')
  } catch (e) {
    toast(`合并失败：${e.message}`)
  }
}

// 加小标题：插在当前块之后；当前块是正文段落时，也可以直接把这一段提成小标题
function addHeading(afterId) {
  const b = currentWork?.blocks.find((x) => x.id === afterId)
  if (!b) return
  const canPromote = b.type === 'p'
  openModal(
    `<div class="modal-head"><h2>加小标题</h2><span class="mono">插在 ${esc(afterId)} 之后</span></div>
     <p class="modal-sub">小标题会成为这一节的抬头：短一点，名词短语或「A：B」，不用「一、二、三」。</p>
     <div class="form-row">
       <label class="field"><span class="label">小标题</span><input class="input" id="heading-text" placeholder="例如：角色是核心资产"></label>
       <label class="field"><span class="label">层级</span>
         <select class="select" id="heading-level"><option value="2">二级（整节）</option><option value="3">三级（小节）</option></select>
       </label>
     </div>
     <div class="modal-actions">
       <button class="btn ghost left" data-close-modal>取消</button>
       ${canPromote ? `<button class="btn ghost" data-heading-promote="${esc(afterId)}">把这一段改成小标题</button>` : ''}
       <button class="btn accent" data-heading-confirm="${esc(afterId)}">插入小标题</button>
     </div>`,
    false,
  )
  setTimeout(() => $('#heading-text')?.focus(), 30)
}

async function doAddHeading(afterId) {
  const text = ($('#heading-text')?.value || '').trim().replace(/^#+\s*/, '')
  const level = Number($('#heading-level')?.value) === 3 ? 3 : 2
  if (!text) return toast('小标题还是空的')
  try {
    const r = await fetch('api/works/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: currentWork.id, afterId, action: 'insert', content: `${'#'.repeat(level)} ${text}` }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '插入失败')
    closeModal()
    await applyWorkUpdate(r.work)
    toast('已插入小标题')
  } catch (e) {
    toast(`插入失败：${e.message}`)
  }
}

// 把选中的这一段直接提成小标题（保留原文字，去掉开头可能有的 #）
async function promoteHeading(bid) {
  const b = currentWork?.blocks.find((x) => x.id === bid)
  if (!b) return
  const text = b.text.replace(/^#+\s*/, '').trim()
  const level = Number($('#heading-level')?.value) === 3 ? 3 : 2
  try {
    const r = await fetch('api/works/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: currentWork.id, blockId: bid, action: 'replace', expect: b.hash, content: `${'#'.repeat(level)} ${text}` }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '改成小标题失败')
    closeModal()
    selectedBlock = null
    await applyWorkUpdate(r.work)
    toast('这一段已改成小标题')
  } catch (e) {
    toast(`改成小标题失败：${e.message}`)
  }
}

function deleteBlock(bid) {
  if (editingBlock) return toast('先保存或取消正在改的那一段')
  const workId = currentWork?.id
  const b = currentWork?.blocks.find((x) => x.id === bid)
  if (!b) return
  if (b.type === 'section') return toast('这是结构板块（标题 / 主送单位 / 落款…），不能单独删；结构不对请整篇改')
  confirmDialog(
    {
      title: '删掉这一段？',
      body: b.text.slice(0, 160) + (b.text.length > 160 ? '…' : ''),
      note: '删完可以用「撤回」恢复上一版。',
      ok: '删掉',
      danger: true,
    },
    async () => {
      try {
        const r = await fetch('api/works/block', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: workId, blockId: bid, action: 'delete', expect: b.hash }),
        }).then((x) => x.json())
        if (!r.ok) throw new Error(r.error || '删除失败')
        if (currentWork?.id !== workId) return
        await applyWorkUpdate(r.work)
        toast('已删除，可用「撤回」恢复')
      } catch (e) {
        toast(`删除失败：${e.message}`)
      }
    },
  )
}

// 正在改一段的时候，模型改完的结果先攒着：不能直接重渲染，否则用户没保存的手改会凭空消失
function applyPendingRefresh() {
  if (!pendingRefresh) return
  const work = pendingRefresh
  pendingRefresh = null
  applyWorkUpdate(work)
  toast('预览已刷新')
}

// 模型改完只换被改的段落：正在编辑的那一段不碰，滚动位置不动
async function refreshWorkInPlace() {
  const id = currentWork?.id
  if (!id) return
  let work = null
  try {
    work = (await fetch(`api/works/${id}`, { cache: 'no-store' }).then((x) => x.json())).work
  } catch {
    return
  }
  if (!work || currentWork?.id !== id) return
  const dom = $('#viewer-body')
  const live = [...dom.querySelectorAll('.blk')]
  const byId = new Map(work.blocks.map((b) => [b.id, b]))
  const changed = live.filter((el) => {
    const b = byId.get(el.dataset.bid)
    return !b || b.hash !== el.dataset.hash
  })
  const sameCount = live.length === work.blocks.length
  // 块数变了，或者改到了正在编辑的那一段：整页刷新（编辑中会被排队，不会丢手改）
  if (!sameCount || editingBlock?.gap || changed.some((el) => el.dataset.bid === editingBlock?.block?.id)) {
    await applyWorkUpdate(work)
    return
  }
  const scroll = dom.scrollTop
  currentWork = work
  for (const el of changed) {
    const b = byId.get(el.dataset.bid)
    if (b) el.outerHTML = blockHtml(b)
  }
  $$('#viewer-body .blk').forEach((el) => el.classList.toggle('on', el.dataset.bid === selectedBlock))
  const paperMeta = $('#viewer-body .paper-meta .mono')
  if (paperMeta) paperMeta.textContent = `${work.chars} 字 · ${work.blocks.length} 段 · 更新 ${time(work.updatedAt)}`
  $('#viewer-title').textContent = work.title
  paintViewerJobStrip()
  paintViewerActions()
  if (asideOpen() && !$('#viewer-aside').contains(document.activeElement)) paintAside()
  dom.scrollTop = scroll
}

// 只刷新目录数据（标题 / 字数 / 类型），不打扰正在预览的人
async function refreshCatalog({ background } = {}) {
  return load({ quiet: true, background })
}

async function applyWorkUpdate(work) {
  if (editingBlock) {
    pendingRefresh = work
    toast('模型改完了；保存或取消你正在改的这一段后，预览会自动刷新')
    return
  }
  pendingRefresh = null
  viewerScroll = $('#viewer-body').scrollTop
  currentWork = work
  $('#viewer-title').textContent = work.title
  paintViewerJobStrip()
  paintViewerActions()
  $('#viewer-body').innerHTML = renderPaper()
  $('#viewer-body').scrollTop = viewerScroll
  paintBlockBar()
  refreshCatalog({ background: true })
  clearSelection()
  paintAside()
}

async function changeWorkHistory(direction) {
  if (!currentWork || editingBlock || historyRequest || !$('#modal').hidden) return
  const before = currentWork
  const redo = direction === 'redo'
  const label = redo ? '重做' : '撤回'
  if (!(redo ? before.canRedo : before.canUndo)) return toast(`没有可${label}的改动`)
  const index = before.blocks.findIndex((b) => b.id === selectedBlock)
  const focus = document.activeElement
  const paper = $('#viewer-body')
  const refocus = paper.contains(focus) || $('#blk-bar').contains(focus) || focus === document.body
  historyRequest = before.id
  try {
    const response = await fetch('api/works/revert', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: before.id, direction, version: before.versions[0].n }),
    })
    const result = await response.json()
    if (currentWork?.id !== before.id) return
    if (!result.ok) {
      if (response.status === 409) await refreshWorkInPlace()
      return toast(result.error || `${label}失败，请重试`)
    }
    const work = result.work
    const prior = before.blocks[index]
    const next = !prior ? null : work.blocks.find((b) => b.id === prior.id && b.hash === prior.hash)
      || work.blocks.find((b) => b.hash === prior.hash) || work.blocks[Math.min(index, work.blocks.length - 1)]
    await applyWorkUpdate(work)
    if (next && !editingBlock) selectBlock(next.id)
    if ((refocus || !focus.isConnected) && document.activeElement === document.body) {
      const target = next ? $(`#viewer-body .blk[data-bid="${next.id}"]`) : $('#blk-bar button')
      const fallback = target || $('[data-viewer="back"]')
      fallback?.focus({ preventScroll: true })
    }
    toast(`已${label}一处改动`)
  } catch (e) {
    toast(`${label}失败：${e.message}`)
  } finally {
    historyRequest = null
  }
}

function reviseInstruction() {
  return ($('#revise-input')?.value || '').trim()
}

function startReviseBlock() {
  const b = selected()
  if (!b || !currentWork) {
    toast('先在左边点一段')
    return
  }
  const instruction = reviseInstruction()
  if (!instruction) {
    toast('写一句要改什么，或点上面的快捷改法')
    $('#revise-input')?.focus()
    return
  }
  const prompt = WA_PROMPTS.reviseBlock({
    id: currentWork.id,
    title: currentWork.title,
    blockId: b.id,
    hash: b.hash,
    type: b.type,
    section: b.section,
    blockText: b.text,
    instruction,
  })
  paintJobStripAfterStart()
  startJob('revise', `${currentWork.title} · ${b.id}`, prompt, {
    workId: currentWork.id,
    request: { group: 'revise', blockId: b.id, version: currentWork.versions?.[0]?.n || 0, mode: 'block' },
  })
}

function startReviseAll() {
  if (!currentWork) return
  const instruction = reviseInstruction()
  if (!instruction) {
    openAside(true)
    $('#revise-input')?.focus()
    toast('先在右侧面板里写整篇要怎么改')
    return
  }
  const prompt = WA_PROMPTS.reviseWork({ id: currentWork.id, title: currentWork.title, chars: currentWork.chars, instruction })
  paintJobStripAfterStart()
  startJob('revise', `${currentWork.title} · 整篇`, prompt, {
    workId: currentWork.id,
    request: { group: 'revise', mode: 'whole', version: currentWork.versions?.[0]?.n || 0 },
  })
}

function paintJobStripAfterStart() {
  setTimeout(() => {
    paintViewerJobStrip()
    if (asideOpen()) paintAside()
  }, 60)
}

// ---------------- 材料 / 语料：读文件 ----------------
const readText = (f) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = () => reject(r.error); r.readAsText(f) })
const readDataUrl = (f) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = () => reject(r.error); r.readAsDataURL(f) })

async function fileText(file, { markdown = false } = {}) {
  if (/\.docx$/i.test(file.name)) {
    if (4 * Math.ceil(file.size / 3) >= 24 * 1024 * 1024 - 1024) throw new Error('Word 文件过大，请拆分后再试')
    const dataUrl = await readDataUrl(file)
    const r = await fetch('api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, dataUrl, format: markdown ? 'markdown' : 'text' }) }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '解析 docx 失败')
    return r.text
  }
  if (/\.(md|txt|markdown|html?|csv|json)$/i.test(file.name) || !file.type) return readText(file)
  throw new Error(`不支持 ${file.name}：只收 md / txt / html / docx`)
}

function pickFile(accept, handler, multiple = false) {
  const input = $('#file')
  input.value = ''
  input.accept = accept
  input.multiple = multiple
  input.onchange = () => {
    const files = [...(input.files || [])]
    if (files.length) handler(multiple ? files : files[0])
  }
  input.click()
}

// 材料上限：和提示词里的 MATERIAL_LIMIT 一致，超出部分不送模型
const MATERIAL_LIMIT = 60000
let materialReadEpoch = 0

async function addMaterials(files) {
  const epoch = materialReadEpoch
  const additions = []
  const errors = []
  for (const f of files) {
    try {
      const text = (await fileText(f)).trim()
      if (!text) throw new Error('没有可读正文')
      const digest = await materialDigest(text)
      additions.push({ name: f.name, text, digest })
    } catch (e) {
      errors.push(`${f.name}：${e.message}`)
    }
  }
  if (epoch !== materialReadEpoch) return
  if (additions.length) {
    const blocks = additions.map(({ name, text }) => `\n\n## 材料：${name}\n\n${text}\n`)
    state.write.materials += blocks.join('')
    state.write.materialFiles = [...(state.write.materialFiles || []), ...additions.map(({ name, text, digest }) => ({ name, chars: text.length, digest }))]
    state.write.materialNames = state.write.materialFiles.map(({ name }) => name)
    if (state.write.mode !== 'materials') state.write.mode = 'materials'
    persist()
    render({ keepFocus: true })
  }
  const note = [additions.length && `已收 ${additions.length} 份材料`, errors.length && `有 ${errors.length} 份未添加（${errors[0]}）`].filter(Boolean).join(' · ')
  if (note) toast(note)
}

async function addOfficialMaterials(files) {
  const stateAtStart = state.official
  const additions = []
  for (const file of files) {
    try {
      const text = (await fileText(file, { markdown: true })).trim()
      if (!text) throw new Error('没有可读正文')
      additions.push({ id: crypto.getRandomValues(new Uint32Array(2)).join('-'), name: file.name, text })
    } catch (error) {
      toast(`读不了 ${file.name}：${error.message}`)
    }
  }
  if (state.official !== stateAtStart || !additions.length) return
  const stored = state.official.materialFiles
  let remaining = 300000 - stored.reduce((sum, file) => sum + file.text.length, 0)
  const accepted = additions.filter((file) => {
    if (file.text.length > remaining) return false
    remaining -= file.text.length
    return true
  })
  if (accepted.length < additions.length) toast(`附件合计最多 30 万字，${additions.length - accepted.length} 份未添加`)
  stored.push(...accepted)
  persist()
  render({ keepFocus: true })
}

// 导入的模板最多留这么多字：够表达章节和口径，又不至于把提示词撑爆
const TEMPLATE_LIMIT = 20000
let templateLoad = 0

async function addOfficialTemplate(file) {
  if (state.official.referenceMode !== 'template') return
  const request = ++templateLoad
  try {
    const text = (await fileText(file, { markdown: true })).trim()
    if (!text) throw new Error('文件里没有可读的文字')
    if (request !== templateLoad) return
    state.official.templateName = file.name
    state.official.templateText = text.slice(0, TEMPLATE_LIMIT)
    persist()
    paintOfficialReference()
    toast(`已导入模板「${file.name}」：起草时按它的结构写`)
  } catch (e) {
    if (request === templateLoad) toast(`读不了 ${file.name}：${e.message}`)
  }
}

const VOICE_EXTENSIONS = '.docx,.md,.markdown,.txt,.html,.htm'
const VOICE_UPLOAD_LIMIT = 24 * 1024 * 1024

function voiceUploadTarget() {
  const cur = currentVoice()
  if (cur) return { name: cur.name, create: false }
  const name = voiceNameDraft.trim()
  const duplicate = data.voice?.profiles?.some((p) => p.name.toLowerCase() === name.toLowerCase())
  if (name && !duplicate) return { name, create: true }
  voiceFeedback = {
    profile: '', error: true,
    message: duplicate ? '这个档案名已存在，请换个名字。' : '请先填写档案名。',
  }
  render({ keepFocus: true })
  $('#voice-name')?.focus()
  return null
}

async function readVoiceFile(file) {
  if (!/\.(docx|md|markdown|txt|html?)$/i.test(file.name)) throw new Error('格式不支持')
  if (/\.docx$/i.test(file.name)) {
    if (4 * Math.ceil(file.size / 3) >= VOICE_UPLOAD_LIMIT) throw new Error('Word 文件过大，无法解析')
    return fileText(file)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const bom = (bytes[0] << 8) | bytes[1]
  const encodings = bom === 0xfffe ? ['utf-16le'] : bom === 0xfeff ? ['utf-16be'] : ['utf-8', 'gb18030']
  let source
  for (const encoding of encodings) {
    try {
      source = new TextDecoder(encoding, { fatal: true }).decode(bytes)
      break
    } catch {}
  }
  if (source === undefined) throw new Error('无法识别文本编码，请另存为 UTF-8')
  if (!/\.html?$/i.test(file.name)) return source
  const template = document.createElement('template')
  template.innerHTML = source
  template.content.querySelectorAll('script, style, template, noscript, title').forEach((el) => el.remove())
  template.content.querySelectorAll('p, br, li, h1, h2, h3, h4, blockquote, div').forEach((el) => el.append('\n'))
  return template.content.textContent
}

async function addCorpus(files, target) {
  if (!target || !files.length || voiceImport) return
  const { name, create } = target
  voiceImport = target
  voiceFeedback = null
  if (route() === 'voice') render({ keepFocus: true })
  const payload = []
  const errors = []
  for (const f of files) {
    try {
      const text = (await readVoiceFile(f)).trim()
      if (!text || text.includes('\0')) throw new Error('没有可用正文')
      payload.push({ title: f.name.replace(/\.[^.]+$/, ''), text })
    } catch (e) {
      errors.push(`${f.name}：${e.message}`)
    }
  }
  let saved = false
  const messages = []
  try {
    if (payload.length) {
      const body = JSON.stringify({ profile: name, files: payload, origin: 'upload' })
      if (new Blob([body]).size > VOICE_UPLOAD_LIMIT) throw new Error('旧稿总量超过 24 MB，请分批添加。')
      const r = await fetch('api/voice/sample', { method: 'POST', headers: { 'content-type': 'application/json' }, body }).then((x) => x.json())
      if (!r.ok) throw new Error(r.error || '添加失败')
      saved = r.added > 0 || r.skipped > 0
      if (r.added) messages.push(`已添加 ${r.added} 篇`)
      if (r.skipped) messages.push(`跳过 ${r.skipped} 篇重复旧稿`)
      errors.push(...(r.failures || []).map((f) => `${f.title || '旧稿'}：${f.error}`))
      if (saved && create && !currentVoice() && voiceNameDraft.trim() === name) {
        state.voice.profile = r.voice?.name || name
        newVoice = false
        voiceNameDraft = ''
        persist(true)
      }
    }
  } catch (e) {
    errors.push(e.message)
  } finally {
    voiceImport = null
    const message = [...messages, ...errors.slice(0, 2), ...(errors.length > 2 ? [`另有 ${errors.length - 2} 篇未添加`] : [])].join('。')
    voiceFeedback = { profile: create && !saved ? '' : name, message, error: errors.length > 0 }
    if (saved) await load({ quiet: true })
    else if (route() === 'voice') render({ keepFocus: true })
  }
}

// ---------------- 导出 / 机检 ----------------
// 选一张图片 → 传进图库 → 回到页面；以后可以反复选
function pickImage(handler) {
  const old = $('#img-file')
  if (old) old.remove()
  const input = document.createElement('input')
  input.type = 'file'
  input.id = 'img-file'
  input.accept = 'image/png,image/jpeg'
  input.hidden = true
  input.addEventListener('change', () => {
    const file = input.files && input.files[0]
    if (file) handler(file)
    input.remove()
  })
  document.body.appendChild(input)
  input.click()
}

async function uploadDocImage(file, slot) {
  if (!/^image\/(png|jpeg)$/.test(file.type)) return toast('只支持 png / jpg')
  if (file.size > 8 * 1024 * 1024) return toast('图片太大了，控制在 8MB 以内')
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(new Error('读不了这个文件'))
    r.readAsDataURL(file)
  })
  try {
    const name = file.name.replace(/\.[^.]+$/, '')
    const r = await fetch('api/doc-images', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, name, dataUrl }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '上传失败')
    data.docImages = r.images || []
    state.official[slot] = r.image.name
    persist()
    render()
    toast(`已保存到图库：${r.image.name}`)
  } catch (e) {
    toast(`上传失败：${e.message}`)
  }
}

// 版式块：模板和自定义提示词两种写法都显示，导出时生效
// 页眉 / 页脚图片：从图库里选，或者现传一张（存下来下次还能用）
function imageSlot(slot) {
  const images = data?.docImages || []
  const cur = state.official[slot] || ''
  const label = slot === 'headerImage' ? '页眉图片' : '页脚图片'
  const pick = images.find((it) => it.name === cur)
  return `<div class="imgslot">
      <label class="lab" for="official-image-${slot}">${label}</label>
      <div class="imgslot-body">
        <span class="imgslot-thumb">${pick ? `<img src="${esc(pick.url)}" alt="">` : '<i>无</i>'}</span>
        <select class="v-select" id="official-image-${slot}" data-o="${slot}">
          <option value="" ${cur ? '' : 'selected'}>不用</option>
          ${images.map((it) => `<option value="${esc(it.name)}" ${cur === it.name ? 'selected' : ''}>${esc(it.name)}${it.width_px ? ` · ${it.width_px}×${it.height_px}` : ''}</option>`).join('')}
        </select>
        <button class="ibtn" data-img-upload="${slot}" title="上传图片" aria-label="上传图片">${icon('upload')}</button>
      </div>
    </div>`
}

function resetDraftForm(g) {
  if (g === 'official') {
    state.official = { ...state.official, prompt: '', notes: '', materialFiles: [] }
  } else {
    materialReadEpoch++
    state.write.title = ''
    state.write.materials = ''
    state.write.materialNames = []
    state.write.materialFiles = []
  }
  persist()
  render()
  toast('已清空')
}

async function exportWork(id) {
  const btn = $(`[data-export-work="${id}"]`)
  if (btn) {
    btn.disabled = true
    btn.dataset.html = btn.innerHTML
    btn.textContent = '导出中…'
  }
  try {
    const body = { id }
    // 页眉页脚图只属于公文；文章导出不要带上上一篇公文残留的图片
    if (currentWork?.id === id && currentWork.kind === 'official') {
      if (state.official.headerImage) body.headerImage = state.official.headerImage
      if (state.official.footerImage) body.footerImage = state.official.footerImage
    }
    const r = await fetch('api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '导出失败')
    toast(r.verify && !r.verify.ok ? `导出完成，但版式核对有问题：${(r.verify.issues || []).join('；')}` : 'Word 导出好了，开始下载')
    const a = document.createElement('a')
    a.href = r.url
    a.download = r.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {
    toast(`导出失败：${e.message}`)
  } finally {
    if (btn) {
      btn.disabled = false
      // 用 innerHTML 还原：导出中只换了文字，印章图标要一起回来
      btn.innerHTML = btn.dataset.html || '导出 Word'
    }
  }
}

async function restoreVersion(n) {
  const id = currentWork?.id
  if (!id) return
  try {
    const r = await fetch(`api/works/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '恢复失败')
    closeModal()
    if (currentWork?.id !== id) return
    await applyWorkUpdate(r.work)
    toast(`已回到第 ${n} 版`)
  } catch (e) {
    toast(`恢复失败：${e.message}`)
  }
}

async function restoreFromTrash(name) {
  try {
    const r = await fetch('api/trash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '恢复失败')
    await refreshCatalog()
    render({ keepFocus: true })
    toast('已经放回稿件库')
  } catch (e) {
    toast(`恢复失败：${e.message}`)
  }
}

async function checkWork(id) {
  const workId = id || currentWork?.id
  if (!workId) return
  toast('机检中…')
  try {
    const r = await fetch('api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: workId }) }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '机检失败')
    if (currentWork && currentWork.id === workId) {
      currentWork.check = r.check
      paintPaperCheckButton()
      paintAside()
    }
    toast(r.check.ok ? '机检通过' : `机检报出 ${r.check.errors.length} 个错误`)
    if (!currentWork || currentWork.id !== workId) showCheck(r.check)
  } catch (e) {
    toast(`机检失败：${e.message}`)
  }
}

// 查依据：这一段能对上来源台账的哪几条
async function openEvidence(blockId) {
  const id = currentWork?.id
  if (!id || !blockId) return
  let data = null
  try {
    data = await fetch(`api/works/${encodeURIComponent(id)}/evidence?block=${encodeURIComponent(blockId)}`, { cache: 'no-store' }).then((r) => r.json())
    if (!data.ok) throw new Error(data.error || '取不到来源')
  } catch (e) {
    return toast(`查依据失败：${e.message}`)
  }
  const rows = (data.matches || [])
    .map(
      (m) => `<div class="ev-row"><div class="ev-text">${esc(m.plain.slice(0, 200))}</div>${m.link ? `<a class="ev-link" href="${esc(m.link)}" target="_blank" rel="noreferrer">原文链接</a>` : ''}</div>`,
    )
    .join('')
  openModal(
    `<div class="modal-head"><h2>查依据</h2><span class="mono">台账里 ${data.entries} 条</span></div>
     <p class="modal-sub">按段落的字面重合找的，只作提示：真正引用前要把原文和口径对一遍。</p>
     ${rows || '<p class="hint">这一段在来源台账里没有对得上的条目。数字和直接引语建议补台账，或改成更保守的写法。</p>'}
     <div class="modal-actions"><button class="btn ghost" data-close-modal>关闭</button></div>`,
    true,
  )
}

// 文章检查：数字、引语、待核、编号对不上台账的地方
async function openAudit() {
  const id = currentWork?.id
  if (!id) return
  let data = null
  try {
    data = await fetch(`api/works/${encodeURIComponent(id)}/audit`, { cache: 'no-store' }).then((r) => r.json())
    if (!data.ok) throw new Error(data.error || '检查失败')
  } catch (e) {
    return toast(`检查失败：${e.message}`)
  }
  const items = data.items || []
  const review = data.review || null
  if (currentWork?.id === id) {
    currentWork.review = review
    const badge = $('#viewer-body .paper-meta [data-blk="audit"]')
    if (badge && review) badge.innerHTML = `${icon('check')}审校：${review.stale ? '需复检' : review.ok ? '已通过' : '需核对'}`
  }
  const rows = items
    .map(
      (it) => `<div class="row2 ${it.level === 'error' ? 'err' : it.level === 'warn' ? 'warn' : 'info'}"><span class="mk">${it.level === 'error' ? '需修改' : it.level === 'warn' ? '建议核对' : '提示'}</span><span>${esc(it.message)}${it.advice ? `<em class="ex">改法：${esc(it.advice)}</em>` : ''}${it.excerpt ? `<em class="ex">（${esc(it.excerpt)}…）</em>` : ''}${it.blockId ? ` <button class="btn-text" data-audit-jump="${esc(it.blockId)}">看这一段</button>` : ''}</span></div>`,
    )
    .join('')
  openModal(
    `<div class="modal-head"><h2>文章检查</h2><span class="mono">${items.length} 条${review ? ` · ${esc(review.summary || '')}` : ''}</span></div>
     <p class="modal-sub">程序核对数字、直接引语、口径、算术和证据边界；语义审查另外记录。每条都给出原句和最小修法，机器只做提示，最终以人工校对为准。</p>
     <div class="checklist">${rows || '<div class="row2 ok"><span class="mk">通过</span><span>没有发现对不上的地方。</span></div>'}</div>
     <div class="modal-actions"><button class="btn ghost" data-close-modal>关闭</button></div>`,
    true,
  )
}

async function resolveSuggestion(sid, action) {
  const id = currentWork?.id
  if (!id) return
  try {
    const r = await fetch(`api/works/${encodeURIComponent(id)}/suggestions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sid, action }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '操作失败')
    if (currentWork?.id !== id) return
    if (action === 'adopt') await applyWorkUpdate(r.work)
    else {
      currentWork = r.work
      paintAside()
    }
    toast(action === 'adopt' ? '已采用，正文已更新' : '已忽略这条建议')
  } catch (e) {
    toast(`操作失败：${e.message}`)
    if (currentWork?.id === id) await refreshWorkInPlace()
  }
}

const VERSION_LABEL = { ...VERSION_ACTION, create: '初稿', model: '模型改', inline: '手改', manual: '手改', edit: '改动' }

async function openVersions(peekN = 0, focusVersion = peekN) {
  const id = currentWork?.id
  if (!id) return
  let data = null
  try {
    data = await fetch(`api/works/${encodeURIComponent(id)}/versions`, { cache: 'no-store' }).then((r) => r.json())
    if (!data.ok) throw new Error(data.error || '取不到版本')
  } catch (e) {
    return toast(`读版本失败：${e.message}`)
  }
  const list = data.versions || []
  let peek = ''
  if (peekN) {
    try {
      const r = await fetch(`api/works/${encodeURIComponent(id)}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ n: peekN, preview: true }),
      }).then((x) => x.json())
      if (!r.ok) throw new Error(r.error || '读不到这一版')
      peek = `<div class="ver-peek"><div class="side-h">第 ${peekN} 版原文</div><pre class="prompt-box" style="max-height:260px">${esc(r.text)}</pre></div>`
    } catch (e) {
      peek = `<p class="hint">看不了这一版：${esc(e.message)}</p>`
    }
  }
  if (currentWork?.id !== id) return
  const currentVersion = list[0]?.n
  const rows = list
    .map(
      (v) => `<div class="vrow version-row${peekN === v.n ? ' on' : ''}">
        <span class="mono vn">v${v.n}</span>
        <span class="vmeta"><span>${esc(VERSION_LABEL[v.action] || v.action)}${v.chars ? ` · ${v.chars} 字` : ''}</span>${v.at ? `<time class="vtime" datetime="${esc(v.at)}">${time(v.at)}</time>` : ''}</span>
        <button class="btn-text" aria-expanded="${peekN === v.n}" data-ver-peek="${v.n}" ${focusVersion === v.n ? 'data-dialog-focus' : ''}>${peekN === v.n ? '收起' : '预览'}</button>
        ${v.n === currentVersion ? '<span class="v-current">当前版本</span>' : `<button class="btn ghost sm" data-ver-restore="${v.n}" aria-label="恢复第 ${v.n} 版">恢复</button>`}
      </div>${peekN === v.n ? peek : ''}`,
    )
    .join('')
  openModal(
    `<div class="modal-head version-head"><h2>版本历史</h2><span class="mono">${list.length} 版</span><button class="ibtn" aria-label="关闭版本历史" data-close-modal>${icon('close')}</button></div>
     <p class="modal-sub">每次正文改动都保存在这里。可以预览任一版本，再决定是否恢复。</p>
     <div class="vlist">${rows || '<p class="hint">还没有版本。</p>'}</div>`,
    true,
  )
}

function showCheck(check) {
  if (!check) return
  openModal(
    `<div class="modal-head"><h2>机检结果</h2><span class="mono">${esc(check.docType || '')}</span></div>
     ${check.stale ? '<p class="modal-sub stale">这份结果对应的是旧版正文，改过之后需要重新跑一次机检。</p>' : ''}
     <p class="modal-sub">${check.ok ? '没有错误。' : `报出 ${check.errors.length} 个错误、${check.warnings.length} 个警告。`}机器只做提示，最终以人工校对为准。</p>
     <div class="checklist">
       ${(check.errors || []).map((e) => `<div class="row2 err"><span class="mk">错误</span><span>${esc(e)}</span></div>`).join('')}
       ${(check.warnings || []).map((e) => `<div class="row2 warn"><span class="mk">警告</span><span>${esc(e)}</span></div>`).join('')}
       ${(check.infos || []).map((e) => `<div class="row2 info"><span class="mk">提示</span><span>${esc(e)}</span></div>`).join('')}
     </div>
     ${check.output ? `<pre class="prompt-box" style="max-height:240px">${esc(check.output)}</pre>` : ''}
     <div class="modal-actions"><button class="btn" data-close-modal>知道了</button></div>`,
    true,
  )
}

function showSources() {
  if (!currentWork?.sources) return
  openModal(
    `<div class="modal-head"><h2>来源台账</h2><span class="mono">每条主张都能回到原文摘录和链接</span></div>
     <p class="modal-sub">每处具体数字、日期、引文都该能回到这里。没有台账的稿件，判断「有出处」时要以人工核对为准。</p>
     <div class="md" style="max-height:52vh;overflow:auto">${WA_MD.render(currentWork.sources)}</div>
     <div class="modal-actions"><button class="btn ghost left" data-copy-sources>${icon('copy')}复制</button><button class="btn" data-close-modal>关闭</button></div>`,
    true,
  )
}

// ---------------- 弹层 ----------------
let modalReturnFocus = null

function syncDialogLayers() {
  const modalOpen = !$('#modal').hidden
  $('.stage').inert = modalOpen || !viewer.hidden
  viewer.inert = modalOpen
}

// 弹层分三档宽度：短确认 400–460、常规 560–640、文档 720–840。
// 传 true 仍按旧的「文档宽」处理，避免几十处调用全改。
function openModal(html, wide) {
  const card = $('#modal-card')
  const opening = $('#modal').hidden
  if (opening) modalReturnFocus = document.activeElement
  const scroll = opening ? 0 : card.scrollTop
  const size = wide === 'short' ? ' short' : wide ? ' wide' : ''
  card.className = `modal-card${size}`
  card.innerHTML = html
  $('#toast').classList.remove('show')
  $('#modal').hidden = false
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  const title = card.querySelector('h2')
  if (title) {
    title.id = 'modal-title'
    card.setAttribute('aria-labelledby', title.id)
  } else card.removeAttribute('aria-labelledby')
  syncDialogLayers()
  card.scrollTop = scroll
  const control = card.querySelector('[data-dialog-focus]') || card.querySelector('input, textarea, select, button')
  control?.focus({ preventScroll: true })
}
function closeModal() {
  if ($('#import-work-form')?.dataset.saving === 'true') return
  $('#modal').hidden = true
  $('#modal-card').innerHTML = ''
  syncDialogLayers()
  const back = modalReturnFocus
  modalReturnFocus = null
  if (back && document.contains(back) && typeof back.focus === 'function') back.focus()
  confirmAction = null
}

const MAX_IMPORT_BYTES = 1024 * 1024

function openImportWork() {
  const importKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  openModal(`<div class="modal-head"><h2>导入稿件</h2></div>
    <form id="import-work-form" class="import-form" data-import-key="${importKey}">
      <label class="import-field">稿件标题 <span class="hint">选填</span>
        <input class="input" name="title" maxlength="120" placeholder="留空时自动取标题">
      </label>
      <div class="import-body-head">
        <label for="import-draft">正文</label>
        <button class="btn ghost" type="button" data-load-markdown>${icon('clip')}<span>选择文件</span></button>
      </div>
      <textarea class="wide-text" id="import-draft" name="draft" required aria-describedby="import-help import-error" placeholder="粘贴纯文本或 Markdown"></textarea>
      <p class="hint" id="import-help">支持 Word（.docx）及 UTF-8 Markdown。Word 将转换为 Markdown，正文最多 1 MB。</p>
      <p class="import-file hint" role="status" hidden></p>
      <p class="import-error" id="import-error" role="alert" hidden></p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-close-modal>取消</button>
        <button class="btn seal" type="submit">导入并打开</button>
      </div>
    </form>`)
}

function showImportError(form, message = '') {
  const error = $('#import-error', form)
  error.textContent = message
  error.hidden = !message
}

function paintImportFileButton(form) {
  $('[data-load-markdown] span', form).textContent = form.elements.draft.value.trim()
    ? '选择文件替换正文'
    : '选择文件'
}

function loadImportFile(form) {
  pickFile('.md,.markdown,.docx', async (file) => {
    const button = $('[data-load-markdown]', form)
    button.disabled = true
    form.elements.draft.readOnly = true
    $('button[type="submit"]', form).disabled = true
    showImportError(form)
    try {
      const isWord = /\.docx$/i.test(file.name)
      if (!isWord && !/\.(md|markdown)$/i.test(file.name)) throw new Error('请选择 .docx、.md 或 .markdown 文件')
      if (!isWord && file.size > MAX_IMPORT_BYTES) throw new Error('文件超过 1 MB，请缩小后重试')
      let text
      if (isWord) {
        text = await fileText(file, { markdown: true })
      } else {
        const buffer = await file.arrayBuffer()
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
        } catch {
          throw new Error('无法读取这份文件，请用 UTF-8 编码保存后再试')
        }
      }
      if (!text.trim() || text.includes('\0')) throw new Error('这个文件没有可导入的 Markdown 正文')
      if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error('正文超过 1 MB，请拆分后再试')
      form.elements.draft.value = text
      form.dataset.filename = file.name
      const status = $('.import-file', form)
      status.textContent = `已载入 ${file.name}`
      status.hidden = false
      paintImportFileButton(form)
    } catch (error) {
      showImportError(form, error.message)
    } finally {
      form.elements.draft.readOnly = false
      button.disabled = false
      $('button[type="submit"]', form).disabled = false
      if (form.isConnected) button.focus()
    }
  })
}

document.addEventListener('submit', async (event) => {
  const form = event.target
  if (form.id !== 'import-work-form') return
  event.preventDefault()
  const button = $('button[type="submit"]', form)
  if (button.disabled) return
  const draft = form.elements.draft.value
  if (!draft.trim() || new TextEncoder().encode(draft).length > MAX_IMPORT_BYTES) {
    showImportError(form, !draft.trim() ? '请填写正文' : '正文超过 1 MB，请缩小后重试')
    form.elements.draft.focus()
    return
  }
  const body = JSON.stringify({ importKey: form.dataset.importKey, title: form.elements.title.value, draft, filename: form.dataset.filename || '' })
  form.dataset.saving = 'true'
  const controls = $$('input, textarea, button', form)
  controls.forEach((control) => (control.disabled = true))
  button.textContent = '正在导入…'
  showImportError(form)
  try {
    const result = await fetch('api/works/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body }).then((response) => response.json())
    if (!result.ok) throw new Error(result.error || '导入失败')
    delete form.dataset.saving
    closeModal()
    state.wq = ''
    setWorksFilter('imported')
    await refreshCatalog()
    await openWork(result.id)
  } catch (error) {
    showImportError(form, error.message || '导入失败，请重试')
  } finally {
    delete form.dataset.saving
    controls.forEach((control) => (control.disabled = false))
    button.textContent = '导入并打开'
    if (form.isConnected) button.focus()
  }
})

// 自己的确认框：浏览器原生 confirm 在 iframe 里样式不可控，而且会被某些宿主拦掉
let confirmAction = null
function confirmDialog({ title, body = '', note = '', ok = '确定', danger = false }, onOk) {
  confirmAction = onOk
  openModal(
    `<div class="modal-head"><h2>${esc(title)}</h2></div>
     ${body ? `<p class="modal-sub" style="white-space:pre-wrap">${esc(body)}</p>` : ''}
     ${note ? `<p class="hint">${esc(note)}</p>` : ''}
     <div class="modal-actions"><button class="btn ghost left" data-close-modal>取消</button><button class="btn ${danger ? 'seal' : ''}" data-confirm-ok>${esc(ok)}</button></div>`,
    'short',
  )
}

async function openVoiceEditor() {
  const name = currentVoice()?.name
  if (!name) return
  try {
    const r = await fetch(`api/voice?name=${encodeURIComponent(name)}`, { cache: 'no-store' }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error || '读取失败')
    if (route() !== 'voice' || currentVoice()?.name !== name) return
    const v = r.voice
    openModal(
      `<div class="modal-head"><h2>${esc(name)}</h2></div>
       <textarea class="textarea voice-editor" id="voice-edit" aria-label="档案内容">${esc(v?.profile || '')}</textarea>
       <div class="modal-actions"><button class="btn ghost" type="button" data-close-modal>取消</button><button class="btn accent" type="button" data-save-voice="${esc(name)}">保存档案</button></div>`,
      true,
    )
  } catch (e) {
    toast(`打不开：${e.message}`)
  }
}

// ---------------- 事件 ----------------
document.addEventListener('click', async (e) => {
  const t = e.target instanceof Element ? e.target : null
  if (!t) return
  const hit = (sel) => t.closest(sel)

  // 先关闭已打开的工具菜单，原点击仍然交给命中的控件处理。
  if (state.railMore && !hit('[data-rail-more]') && (!hit('.rail-more') || hit('.rail-menu-item'))) {
    state.railMore = false
    paintBlockBar()
    if (hit('.rail-more')) $('[data-rail-more]')?.focus({ preventScroll: true })
  }
  if (state.viewerMore && !hit('[data-viewer-more]')) {
    state.viewerMore = false
    // 下载链接要留在 DOM 中，直到浏览器执行本次点击的默认动作。
    if (hit('.viewer-more a[download]')) setTimeout(paintViewerActions, 0)
    else {
      paintViewerActions()
      if (hit('.viewer-more')) $('[data-viewer-more]')?.focus({ preventScroll: true })
    }
  }

  // 文种横条展开时，点在外面先收起来（横条本身和开合按钮不算外面）


  // 使用说明：目录跳到分节、全部展开 / 收起。条目自己的开合由 toggle 事件记录，
  // 这里不再整页重渲染，避免刚点开的条目又被收起。
  let el = hit('[data-manual-jump]')
  if (el) {
    const section = $(`#manual-${el.dataset.manualJump}`)
    if (section) {
      $$('.manual-nav').forEach((b) => b.classList.toggle('on', b === el))
      section.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      section.querySelector('summary')?.focus({ preventScroll: true })
    }
    return
  }
  el = hit('[data-manual-all]')
  if (el) {
    const open = el.dataset.manualAll === 'open'
    $$('.manual details[data-manual]').forEach((d) => {
      d.open = open
      if (open) manualOpen.add(d.dataset.manual)
      else manualOpen.delete(d.dataset.manual)
    })
    el.dataset.manualAll = open ? 'close' : 'open'
    el.textContent = open ? '全部收起' : '全部展开'
    return
  }

  // 导航 / 预览层
  el = hit('[data-close-modal]')
  if (el) return closeModal()
  el = hit('[data-viewer="back"]')
  if (el) return closeViewer({ toLibrary: true })
  el = hit('[data-viewer="close"]')
  if (el) return closeViewer()
  el = hit('[data-viewer="aside"]')
  if (el) return toggleAside()
  el = hit('[data-viewer="full"]')
  if (el) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
    return
  }
  el = hit('[data-ver-peek]')
  if (el) {
    const n = Number(el.dataset.verPeek)
    return openVersions(el.getAttribute('aria-expanded') === 'true' ? 0 : n, n)
  }
  el = hit('[data-ver-restore]')
  if (el) {
    const n = Number(el.dataset.verRestore)
    return confirmDialog(
      { title: `恢复第 ${n} 版？`, body: '当前内容会保留在版本历史中。', ok: '恢复此版' },
      () => restoreVersion(n),
    )
  }
  el = hit('[data-audit-jump]')
  if (el) {
    const bid = el.dataset.auditJump
    closeModal()
    if (bid) {
      selectBlock(bid)
      const node = $(`#viewer-body .blk[data-bid="${bid}"]`)
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    return
  }
  el = hit('[data-sug-adopt]')
  if (el) return resolveSuggestion(el.dataset.sugAdopt, 'adopt')
  el = hit('[data-sug-dismiss]')
  if (el) return resolveSuggestion(el.dataset.sugDismiss, 'dismiss')
  el = hit('[data-voice-restore]')
  if (el) {
    const name = el.dataset.voiceRestore
    try {
      const r = await fetch('api/voice/trash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then((x) => x.json())
      if (!r.ok) throw new Error(r.error || '恢复失败')
      await refreshCatalog()
      render({ keepFocus: true })
      toast('档案已经恢复')
    } catch (e) {
      toast(`恢复失败：${e.message}`)
    }
    return
  }
  el = hit('[data-del-voice]')
  if (el) {
    const name = currentVoice()?.name
    if (!name) return
    return confirmDialog(
      { title: `删除档案「${name}」？`, body: '会先进回收区，可以恢复。', ok: '删除', danger: true },
      async () => {
        try {
          const r = await fetch('api/voice/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name }),
          }).then((x) => x.json())
          if (!r.ok) throw new Error(r.error || '删除失败')
          await refreshCatalog()
          render({ keepFocus: true })
          toast('档案已移入回收区')
        } catch (e) {
          toast(`删除失败：${e.message}`)
        }
      },
    )
  }
  el = hit('[data-clear-search]')
  if (el) {
    state.wq = ''
    persist()
    render()
    return $('#wq')?.focus()
  }
  if (hit('[data-retry-search]')) return applySearchFilter()
  if (hit('[data-import-work]')) return openImportWork()
  if (hit('[data-load-markdown]')) return loadImportFile($('#import-work-form'))
  el = hit('[data-trash-restore]')
  if (el) return restoreFromTrash(el.dataset.trashRestore)
  el = hit('[data-viewer-more]')
  if (el) {
    state.viewerMore = !state.viewerMore
    paintViewerActions()
    $(state.viewerMore ? '.viewer-more button' : '[data-viewer-more]')?.focus({ preventScroll: true })
    return
  }
  el = hit('[data-viewer="full"]')
  if (el) {
    const viewer = $('#viewer')
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else viewer.requestFullscreen?.().catch(() => {})
    state.viewerMore = false
    return
  }
  el = hit('[data-blk]')
  // 「撤回」「版本历史」是整篇动作：没选中段落也要能点
  if (el && ['revert', 'redo'].includes(el.dataset.blk)) return changeWorkHistory(el.dataset.blk === 'redo' ? 'redo' : 'undo')
  const moreBtn = hit('[data-rail-more]')
  if (moreBtn) {
    state.railMore = !state.railMore
    paintBlockBar()
    $(state.railMore ? '.rail-more button:enabled' : '[data-rail-more]')?.focus({ preventScroll: true })
    return
  }
  if (el && el.dataset.blk === 'versions') return openVersions()
  if (el && el.dataset.blk === 'evidence') return openEvidence(selectedBlock)
  if (el && el.dataset.blk === 'audit') return openAudit()
  if (el && selectedBlock) {
    const op = el.dataset.blk
    if (op === 'versions') return openVersions()
    if (op === 'edit') return startEditBlock(selectedBlock)
    if (op === 'delete') return deleteBlock(selectedBlock)
    if (op === 'merge') return mergeBlock(selectedBlock)
    if (op === 'up') return moveBlock(selectedBlock, -1)
    if (op === 'down') return moveBlock(selectedBlock, 1)
    if (op === 'heading') return addHeading(selectedBlock)
    if (op === 'cancel') return clearSelection()
    if (op === 'model') return openAside(true), $('#revise-input')?.focus()
  }
  el = hit('[data-blk-save]')
  if (el) return saveBlockEdit()
  el = hit('[data-blk-cancel]')
  if (el) return cancelBlockEdit()
  el = hit('[data-gap]')
  if (el) return startInsertBlock(el)
  el = hit('[data-quick-delete]')
  if (el) return deleteBlock(el.dataset.quickDelete)
  el = hit('[data-heading-confirm]')
  if (el) return doAddHeading(el.dataset.headingConfirm)
  el = hit('[data-heading-promote]')
  if (el) return promoteHeading(el.dataset.headingPromote)
  el = hit('[data-confirm-ok]')
  if (el) {
    const run = confirmAction
    confirmAction = null
    closeModal()
    return run && run()
  }
  // 选块：正在编辑时不换块，给一句提示，免得手改被静默丢掉
  el = hit('#viewer-body .blk')
  if (el && !hit('.blk-editor') && !hit('.blk-editor-actions') && !hit('.blk-bar')) {
    if (editingBlock) return toast('先保存或取消正在改的那一段')
    selectBlock(el.dataset.bid)
    return
  }

  // 后台任务
  el = hit('[data-start-article]')
  if (el) return startJob('article', state.write.title.trim() || '写作', articlePrompt(), { request: taskRequest(writeGroup()) })
  el = hit('[data-copy-article]')
  if (el) return copy(articlePrompt())
  el = hit('[data-reset-write]')
  if (el) {
    state.write = structuredClone(DEFAULT.write)
    persist()
    return render()
  }
  el = hit('[data-start-official]')
  if (el) {
    if (!officialReady()) return toast(officialNeedsTemplate() ? '请先选择模板' : '填写起草需求或添加材料')
    const request = taskRequest('official')
    return startJob('official', request.title, officialPrompt(), { request })
  }
  el = hit('[data-copy-official]')
  if (el) {
    const prompt = officialPrompt()
    return prompt ? copy(prompt) : toast('填写起草需求或添加材料')
  }
  el = hit('[data-reset-official]')
  if (el) {
    return resetDraftForm('official')
  }
  el = hit('[data-learn-voice]')
  if (el) {
    const profile = currentVoice()
    if (!profile?.samples || voiceLearning()) return
    const { name } = profile
    return startJob('voice', name, WA_PROMPTS.voiceLearn({ profile: name }), { request: { group: 'voice', profile: name } })
  }
  el = hit('[data-use-voice]')
  if (el) {
    const profile = currentVoice()
    if (!profile?.chars) return
    el.disabled = true
    try {
      const r = await fetch('api/voice/use', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: profile.active ? '' : profile.name }) }).then((x) => x.json())
      if (!r.ok) throw new Error(r.error || '设置失败')
      await load({ quiet: true })
    } catch (err) {
      toast(`设置失败：${err.message}`)
    } finally {
      el.disabled = false
    }
    return
  }
  if (hit('[data-new-voice]')) {
    newVoice = true
    voiceNameDraft = ''
    voiceFeedback = null
    render()
    $('#voice-name')?.focus()
    return
  }
  if (hit('[data-cancel-new-voice]')) {
    newVoice = false
    voiceNameDraft = ''
    voiceFeedback = null
    render()
    $('[data-new-voice]')?.focus()
    return
  }
  el = hit('[data-pick-voice]')
  if (el) {
    newVoice = false
    voiceNameDraft = ''
    state.voice.profile = el.dataset.pickVoice
    persist()
    render()
    $('.vrow.on')?.focus()
    return
  }
  el = hit('[data-open-voice]')
  if (el) return openVoiceEditor()
  el = hit('[data-save-voice]')
  if (el) {
    const name = el.dataset.saveVoice
    const text = $('#voice-edit')?.value || ''
    if (!text.trim()) return toast('请填写档案内容')
    el.disabled = true
    try {
      const r = await fetch('api/voice/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: name, text }) }).then((x) => x.json())
      if (!r.ok) throw new Error(r.error || '保存失败')
      closeModal()
      await load({ quiet: true })
      toast('档案已保存')
    } catch (err) {
      toast(`保存失败：${err.message}`)
    } finally {
      el.disabled = false
    }
    return
  }
  // 列表操作
  el = hit('[data-open-work]')
  if (el) return openWork(el.dataset.openWork)
  el = hit('[data-del-work]')
  if (el) {
    const id = el.dataset.delWork
    const target = data.works.find((w) => w.id === id)
    confirmDialog(
      { title: `删除「${target?.title || id}」？`, body: '稿件会移入回收区，可在稿件库恢复。', ok: '移入回收区', danger: true },
      async () => {
        try {
          const result = await fetch('api/works/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).then((response) => response.json())
          if (!result.ok) throw new Error(result.error || '删除失败')
          if (currentWork?.id === id) closeViewer()
          await load({ quiet: true })
          toast('稿件已移入回收区')
        } catch (err) {
          toast(`删除失败：${err.message}`)
        }
      },
    )
    return
  }
  el = hit('[data-export-work]')
  if (hit('[data-page-number]')) return editPageNumber(hit('[data-page-number]').dataset.pageNumber)
  if (el) return exportWork(el.dataset.exportWork)
  el = hit('[data-check-work]')
  if (el) return checkWork()
  el = hit('[data-revert-work]')
  if (el) return changeWorkHistory('undo')
  if (hit('[data-redo-work]')) return changeWorkHistory('redo')
  el = hit('[data-revise-block]')
  if (el) return startReviseBlock()
  el = hit('[data-revise-all]')
  if (el) return startReviseAll()
  el = hit('[data-chip]')
  if (el) {
    const ta = $('#revise-input')
    if (ta) {
      ta.value = el.dataset.chip
      reviseDrafts.set(reviseDraftKey(), ta.value)
      ta.focus()
    }
    return
  }
  el = hit('[data-show-check]')
  if (el) return showCheck(currentWork?.check)
  el = hit('[data-show-sources]')
  if (el) return showSources()
  el = hit('[data-copy-draft]')
  if (el) return copy(currentWork?.draft || '')
  el = hit('[data-copy-sources]')
  if (el) return copy(currentWork?.sources || '')
  el = hit('[data-copy-template]')
  if (el) return copy(docType(el.dataset.copyTemplate)?.template || '')
  el = hit('[data-retry-load]')
  if (el) return load()

  // 任务面板
  el = hit('[data-cancel-job]')
  if (el) {
    try {
      const r = await fetch('api/jobs/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: el.dataset.cancelJob }) }).then(res => res.json())
      toast(r.ok ? '已请求取消' : (r.error || '该任务已结束或暂时无法取消'))
    } catch { toast('连接中断，正在核对任务状态') }
    return refreshJobs()
  }
  el = hit('[data-continue-job]')
  if (hit('[data-resume-job]')) {
    const id = hit('[data-resume-job]').dataset.resumeJob
    try {
      const r = await fetch('api/jobs/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).then(res => res.json())
      if (!r.ok) throw new Error(r.error)
      const submissionId = r.job.submissionId || id
      const pending = { kind: r.job.kind, jobId: id, at: r.job.createdAt, submissionId, manualOpen: true, request: r.job.request }
      rememberJob(pending, r.job)
      state.submissions[submissionId] = pending
      persist(true)
      await refreshJobs()
      toast('正在接回原任务')
    } catch (err) { toast(err.message || '暂时无法接回任务') }
    return
  }
  if (el) {
    const kind = el.dataset.continueKind || ''
    const group = el.dataset.continueGroup || ''
    hideJob(el.dataset.continueJob)
    persist()
    if (kind === 'article' || kind === 'official') {
      const g = group === 'research' ? 'research' : group === 'official' ? 'official' : 'analysis'
      state.write.group = g
      if (location.hash !== '#/write') history.replaceState(null, '', '#/write')
      render()
      requestAnimationFrame(() => ($('[data-start-official]') || $('[data-start-article]'))?.focus())
      toast('请检查当前表单的题目、材料和设置，再提交新任务')
      return
    }
    if (kind === 'revise') {
      if (currentWork) {
        openAside(true)
        $('#revise-input')?.focus()
      } else toast('先到稿件库打开要改的那篇稿子，再继续')
      return
    }
    const job = jobs.find((entry) => entry.id === el.dataset.continueJob)
    state.voice.profile = job?.request?.profile || job?.name || state.voice.profile
    persist()
    render()
    return $('[data-learn-voice]')?.focus()
  }
  el = hit('[data-dismiss-job]')
  if (el) {
    hideJob(el.dataset.dismissJob)
    expandedJobDetails.delete(el.dataset.dismissJob)
    paintMast()
    return paintJobPanel()
  }
  el = hit('[data-job-compact]')
  if (el) {
    const id = el.dataset.jobCompact
    const job = jobs.find((j) => j.id === id)
    if (job) state.compactJobs[id] = !(state.compactJobs[id] ?? job.kind === 'voice')
    state.compactJobs = Object.fromEntries(Object.entries(state.compactJobs).slice(-40))
    persist()
    return paintJobPanel()
  }
  el = hit('[data-job-details]')
  if (el) {
    const id = el.dataset.jobDetails
    if (expandedJobDetails.has(id)) expandedJobDetails.delete(id)
    else expandedJobDetails.add(id)
    return paintJobPanel()
  }
  if (hit('[data-show-hidden-jobs]')) {
    const active = new Set(jobsForView().filter(activeJob).map((job) => job.id))
    state.hiddenJobs = state.hiddenJobs.filter((id) => !active.has(id))
    persist()
    paintMast()
    paintJobPanel()
    return $('#job-panel .job-toggle')?.focus({ preventScroll: true })
  }
  el = hit('[data-refresh]')
  if (el) {
    await refreshJobs()
    return load({ quiet: true })
  }

  // 表单开关
  el = hit('[data-w-group]')
  if (el) {
    // 点过分组就是新入口：把地址收回 #/write（老链接 #/official 和 ?g= 都不该再把分组改回去）
    if (location.hash !== '#/write') history.replaceState(null, '', '#/write')
    const g = el.dataset.wGroup
    state.setOpen = ''
    state.tool = ''
    applyWriteGroup(g)
    persist()
    return render()
  }
  el = hit('[data-wt]')
  if (el) {
    setWorksFilter(el.dataset.wt)
    render()
    return $(`[data-wt="${el.dataset.wt}"]`)?.focus({ preventScroll: true })
  }
  el = hit('[data-len]')
  if (el) {
    const n = Number(el.dataset.len)
    state.write.length = String(n)
    ;(state.write.lengths || (state.write.lengths = {}))[writeGroup()] = String(n)
    persist()
    const inp = $('[data-w="length"]')
    if (inp) inp.value = String(n)
    $$('[data-len]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.len) === n)))
    paintSettingValues()
    const out = $('#prompt-out')
    if (out) out.textContent = articlePrompt()
    return
  }
  el = hit('[data-o-len]')
  if (el) {
    const v = el.dataset.oLen
    state.official.length = v
    persist()
    const inp = $('[data-o="length"]')
    if (inp) inp.value = String(officialLength())
    $$('[data-o-len]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.oLen === v)))
    paintSettingValues()
    const out = $('#prompt-out')
    if (out) out.textContent = officialPrompt()
    return
  }
  el = hit('[data-w-cite]')
  if (el) {
    state.write.citation = el.dataset.wCite === 'numbered' ? 'numbered' : 'inline'
    persist()
    $$('[data-w-cite]').forEach((button) => button.setAttribute('aria-pressed', String(button === el)))
    paintSettingValues()
    const out = $('#prompt-out')
    if (out) out.textContent = articlePrompt()
    return
  }
  el = hit('[data-w-mode]')
  if (el) {
    state.write.mode = el.dataset.wMode
    persist()
    return render()
  }
  el = hit('[data-set]')
  if (el) {
    const id = el.dataset.set
    openWriteSetting(state.setOpen === id ? '' : id)
    return el.focus({ preventScroll: true })
  }
  if (hit('[data-set-done]')) {
    const id = state.setOpen
    openWriteSetting('')
    return $(`[data-set="${id}"]`)?.focus({ preventScroll: true })
  }
  el = hit('[data-copy-prompt]')
  if (el) {
    const box = $('#prompt-out')
    const text = box ? box.textContent : ''
    if (!text) return toast('先展开任务说明')
    try {
      await navigator.clipboard.writeText(text)
      return toast('任务说明已复制')
    } catch {
      return toast('复制失败：浏览器没给剪贴板权限')
    }
  }
  el = hit('[data-toggle-prompt]')
  if (el) {
    state.promptOpen = !state.promptOpen
    return render({ keepFocus: true })
  }
  el = hit('[data-add-file]')
  if (el) return pickFile('.md,.txt,.markdown,.html,.htm,.docx', addMaterials, true)
  el = hit('[data-remove-material]')
  if (el) return removeMaterial(Number(el.dataset.removeMaterial))
  if (hit('[data-add-official-file]')) return pickFile(VOICE_EXTENSIONS, addOfficialMaterials, true)
  el = hit('[data-remove-official-file]')
  if (el) {
    state.official.materialFiles = state.official.materialFiles.filter((file) => file.id !== el.dataset.removeOfficialFile)
    persist()
    return render()
  }
  el = hit('[data-import-template]')
  if (el) return pickFile('.md,.txt,.markdown,.html,.htm,.docx', addOfficialTemplate)
  el = hit('[data-remove-template]')
  if (el) {
    templateLoad++
    state.official.templateName = ''
    state.official.templateText = ''
    persist()
    paintOfficialReference()
    $('[data-import-template]')?.focus({ preventScroll: true })
    toast('已移除导入的模板')
    return
  }
  el = hit('[data-tool]')
  if (el) {
    const id = el.dataset.tool
    if (id === 'reset') {
      const g = writeGroup()
      return confirmDialog(
        {
          title: g === 'official' ? '清空需求和材料？' : '清空这次的题目和材料？',
          body: g === 'official' ? '格式参考、篇幅和 Word 版式设置会保留。' : '字数、读者、语气这些侧栏设置会保留。',
          ok: '清空',
          danger: true,
        },
        () => resetDraftForm(g),
      )
    }
    if (id === 'layout' && writeGroup() === 'official') return openWriteSetting(state.tool === id ? '' : id)
    state.tool = state.tool === id ? '' : id
    return render({ keepFocus: true })
  }
  el = hit('[data-img-upload]')
  if (el) {
    const slot = el.dataset.imgUpload
    return pickImage((file) => uploadDocImage(file, slot))
  }
  el = hit('[data-add-corpus]')
  if (el) {
    const target = voiceUploadTarget()
    if (target) return pickFile(VOICE_EXTENSIONS, (files) => addCorpus(files, target), true)
  }
})

// 输入：只更新状态和任务说明，不重渲染（免得丢焦点）
document.addEventListener('input', (e) => {
  const t = e.target
  if (!(t instanceof HTMLElement)) return
  if (t.dataset.w) {
    const key = t.dataset.w
    state.write[key] = t.value
    persist()
    const out = $('#prompt-out')
    if (out) out.textContent = articlePrompt()
    if (key === 'materials') {
      const c = $('#mat-count')
      if (c) {
        c.hidden = !t.value.trim()
        const files = state.write.materialNames?.length || 0
        c.textContent = `${t.value.length} 字${files ? ` · ${files} 个文件` : ''}`
      }
    }
    if (key === 'title' || key === 'materials') {
      const btn = $('[data-start-article]')
      const ready = Boolean(state.write.title.trim() || state.write.materials.trim())
      if (btn) btn.disabled = !ready
      const hint = $('[data-article-hint]')
      if (hint) hint.hidden = ready
      const clear = $('[data-tool="reset"]')
      if (clear) clear.hidden = !ready
    }
    if (key === 'length') {
      const n = articleLength(articleKind(writeGroup()), t.value)
      state.write.lengths[writeGroup()] = t.value
      $$('[data-len]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.len) === n)))
    }
    if (['length', 'audience', 'voice'].includes(key)) paintSettingValues()
    if (t.classList.contains('big-input')) {
      t.style.height = 'auto'
      t.style.height = `${t.scrollHeight}px`
    }
    return
  }
  if (t.dataset.o) {
    if (t.dataset.o === 'refDocType') return
    state.official[t.dataset.o] = t.value
    persist()
    if (t.dataset.o === 'length') paintSettingValues()
    const limit = $('#official-material-limit')
    if (limit && t.dataset.o === 'notes') limit.hidden = officialMaterials().length <= MATERIAL_LIMIT
    const out = $('#prompt-out')
    if (out) out.textContent = officialPrompt()
    syncOfficialButton()
    return
  }
  if (t.id === 'wq') {
    state.wq = t.value
    applySearchFilter()
    return
  }
  if (t.id === 'import-draft') {
    showImportError(t.form)
    return paintImportFileButton(t.form)
  }
  if (t.id === 'revise-input') {
    reviseDrafts.set(reviseDraftKey(), t.value)
    return
  }
  if (t.id === 'voice-name') {
    voiceNameDraft = t.value
    if (voiceFeedback?.profile === '') {
      voiceFeedback = null
      $('#corpus-drop [role="alert"]')?.remove()
    }
  }
})

document.addEventListener('change', (e) => {
  if (e.target.matches('#page-number-form [name=enabled]')) {
    e.target.form.querySelector('fieldset').disabled = !e.target.checked
    return
  }
  // 不在 blur 时重渲染：正在填的输入框一失焦就 render，会把「紧接着的那次点击」的
  // mousedown 目标换掉，点击就丢了。列表筛选也改成原地过滤，见 applySearchFilter。
  const t = e.target
  if (!(t instanceof HTMLElement)) return
  if (t.matches('input[name="official-reference"]')) {
    templateLoad++
    state.official.referenceMode = t.value
    persist()
    return paintOfficialReference()
  }
  if (t.dataset.o === 'refDocType') {
    state.official.refDocType = t.value
    persist()
    return paintOfficialReference()
  }
  if (t.dataset.wCheck === 'supplement') {
    state.write.supplement = Boolean(t.checked)
    persist()
    const out = $('#prompt-out')
    if (out) out.textContent = articlePrompt()
    return
  }
  if (t.dataset.o === 'headerImage' || t.dataset.o === 'footerImage') {
    state.official[t.dataset.o] = t.value
    persist()
    render({ keepFocus: true })
    return
  }
})


addEventListener('resize', () => {
  if (!viewer.hidden) placeRail()
})

// 双击段落直接进编辑：右侧「改这段」仍然保留，这条只是省一步
document.addEventListener('dblclick', (e) => {
  const t = e.target instanceof Element ? e.target : null
  if (!t) return
  if (t.closest('textarea, input, button, .blk-editor-actions, #blk-bar, #viewer-aside')) return
  const el = t.closest('#viewer-body .blk[data-bid]')
  if (!el) return
  const bid = el.dataset.bid
  const type = el.dataset.type
  if (!bid || type === 'hr' || type === 'section') return
  if (editingBlock?.block?.id === bid) return
  e.preventDefault()
  if (editingBlock) {
    // 正在改另一段：先按规则提示，别把手改的内容冲掉
    return startEditBlock(bid)
  }
  selectBlock(bid)
  startEditBlock(bid)
})

document.addEventListener('keydown', (e) => {
  const tab = e.target instanceof Element && e.target.closest('[data-w-group]')
  if (tab && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
    const tabs = $$('[data-w-group]')
    const index = tabs.indexOf(tab)
    const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs.at(-1)
      : tabs[(index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    e.preventDefault()
    next.click()
    $(`[data-w-group="${next.dataset.wGroup}"]`)?.focus({ preventScroll: true })
    return
  }
  const key = e.key.toLowerCase()
  const historyKey = !e.altKey && (e.ctrlKey || e.metaKey) && (key === 'z' || (key === 'y' && !e.shiftKey))
  const textTarget = e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches('textarea, input, select'))
  if (historyKey && !e.defaultPrevented && !e.isComposing && !textTarget && !viewer.hidden && $('#modal').hidden && !editingBlock) {
    e.preventDefault()
    if (!e.repeat) return changeWorkHistory(key === 'y' || e.shiftKey ? 'redo' : 'undo')
    return
  }
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) return closeModal()
    if (!viewer.hidden && state.railMore) {
      state.railMore = false
      paintBlockBar()
      return $('[data-rail-more]')?.focus()
    }
    if (!viewer.hidden && state.viewerMore) {
      state.viewerMore = false
      paintViewerActions()
      return $('[data-viewer-more]')?.focus()
    }
    // 正在改一段时，Esc 先退出编辑，而不是把整个预览关掉
    if (editingBlock) return cancelBlockEdit()
    // 审校栏开着时，Esc 先收它，再按一次才关预览
    if (asideOpen()) return toggleAside()
    if (!$('#viewer').hidden) return closeViewer()
    if (state.setOpen) {
      e.preventDefault()
      return $('[data-set-done]')?.click()
    }
    if (state.tool === 'layout') return $('[data-tool="layout"]')?.click()
  }
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.dataset?.bid && document.activeElement.classList.contains('blk')) {
    e.preventDefault()
    return selectBlock(document.activeElement.dataset.bid)
  }
  if (!$('#modal').hidden && e.key === 'Tab') {
    const card = $('#modal-card')
    const items = [...card.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null && !el.matches(':disabled'),
    )
    if (items.length) {
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !card.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !card.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    return
  }
  if (!$('#modal').hidden) return
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (editingBlock) {
      e.preventDefault()
      return saveBlockEdit()
    }
    if (selectedBlock && asideOpen()) {
      e.preventDefault()
      return startReviseBlock()
    }
  }
})

// 拖拽
document.addEventListener('dragover', (e) => {
  const zone = e.target instanceof Element ? e.target.closest('#mat-drop, #official-mat-drop, #corpus-drop') : null
  if (zone) {
    e.preventDefault()
    zone.classList.add('over')
  }
})
document.addEventListener('dragleave', (e) => {
  const zone = e.target instanceof Element ? e.target.closest('#mat-drop, #official-mat-drop, #corpus-drop') : null
  if (zone) zone.classList.remove('over')
})
document.addEventListener('drop', (e) => {
  const zone = e.target instanceof Element ? e.target.closest('#mat-drop, #official-mat-drop, #corpus-drop') : null
  if (!zone) return
  e.preventDefault()
  zone.classList.remove('over')
  const files = [...(e.dataTransfer?.files || [])]
  if (!files.length) return
  if (zone.id === 'mat-drop') addMaterials(files)
  else if (zone.id === 'official-mat-drop') addOfficialMaterials(files)
  else if (!voiceImport) addCorpus(files, voiceUploadTarget())
})

// ---------------- 启动 ----------------
$('#app').addEventListener('focusout', () => {
  if (viewRefreshPending) setTimeout(() => {
    if (viewRefreshPending) render({ keepFocus: true, background: true })
  }, 0)
})

addEventListener('hashchange', () => {
  if (currentWork && !viewer.hidden) closeViewer()
  render()
  // 切页时顺手拉一次稿库：模型可能刚在对话里存了一篇，列表不该还是旧的
  load({ quiet: true })
})
setInterval(() => {
  if (document.hidden) return
  if (!appliedPoll || jobs.some(j => ['queued','running'].includes(j.status)) || Object.keys(state.submissions).length) refreshJobs()
}, 2600)
// 从对话切回来时也刷新一次：后台任务可能是模型自己在对话里跑完的
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  refreshJobs()
  load({ quiet: true, background: true })
})

addEventListener('pagehide', () => { if (saveTimer) persist(true) })
load().then(refreshJobs)
