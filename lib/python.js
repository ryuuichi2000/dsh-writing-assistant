// 调 Python 的三件事：抽 .docx 正文（上传材料要用）、导出公文 Word、机检成稿。
// 用 dsh 自带的 Python 运行时（$DSH_HOME/dsh-runtimes/*/dependencies/python），
// 找不到再退回 PATH 上的 python。导出器与校验器只依赖标准库，抽 docx 需要 python-docx。
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataDir } from './store.js'

export function findPython() {
  const candidates = []
  if (process.env.DSH_WRITING_PYTHON) candidates.push(process.env.DSH_WRITING_PYTHON)
  if (process.env.DSH_PYTHON) candidates.push(process.env.DSH_PYTHON)
  const homes = [process.env.DSH_HOME, join(homedir(), '.dsh')].filter(Boolean)
  for (const home of homes) {
    try {
      for (const d of readdirSync(join(home, 'dsh-runtimes'))) {
        candidates.push(join(home, 'dsh-runtimes', d, 'dependencies', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3'))
      }
    } catch {}
  }
  for (const p of candidates) if (p && existsSync(p)) return p
  return process.platform === 'win32' ? 'python' : 'python3'
}

export function runPython(args, { timeoutMs = 60_000, cwd } = {}) {
  const py = findPython()
  return new Promise((resolve, reject) => {
    const child = spawn(py, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        OFFICIAL_DOC_IMAGE_DIR: process.env.OFFICIAL_DOC_IMAGE_DIR || join(dataDir(), 'doc-images'),
      },
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Python 执行超时'))
    }, timeoutMs)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: out, stderr: err, python: py })
    })
  })
}

const EXTRACT_SCRIPT = fileURLToPath(new URL('../skills/research-writing/scripts/writing.py', import.meta.url))

export async function extractDocx(buffer, { markdown = false } = {}) {
  const dir = join(tmpdir(), 'writing-assistant')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.docx`)
  writeFileSync(file, buffer)
  try {
    const args = [EXTRACT_SCRIPT, 'extract', file, ...(markdown ? ['--markdown'] : [])]
    const { code, stdout, stderr } = await runPython(args, { timeoutMs: 30_000 })
    if (code !== 0) throw new Error(stderr.trim().split('\n').at(-1) || 'Word 文档解析失败')
    return String(stdout || '').replace(/\r\n/g, '\n').trim()
  } finally {
    rmSync(file, { force: true })
  }
}

// 导出公文 Word：generate_docx.py 只写字体名、不嵌字体，导出的 .docx 是排版初稿。
export async function generateDocx({ skillDir, draftFile, outFile, docType, extraArgs = [] }) {
  const script = join(skillDir, 'scripts', 'generate_docx.py')
  if (!existsSync(script)) throw new Error(`找不到导出器：${script}`)
  const args = [script, draftFile, '-o', outFile]
  if (docType) args.push('--doc-type', docType)
  args.push(...extraArgs)
  const { code, stdout, stderr } = await runPython(args, { timeoutMs: 120_000 })
  const output = `${stdout}\n${stderr}`.trim()
  if (code !== 0 || !existsSync(outFile)) {
    throw new Error(output.split('\n').filter(Boolean).slice(-3).join(' ') || `导出失败（退出码 ${code}）`)
  }
  return { outFile, output }
}

// 导出研究型写作 / 深度研究 Word：文章版式（A4、标题、小标题、正文、列表、表格、参考资料）。
// 与公文导出共用同一个 Python 运行时、同一个 exports 目录和同一套包结构核对。
export async function exportArticle({ root, draftFile, outFile, title = '' }) {
  const script = join(root, 'skills', 'research-writing', 'scripts', 'export_article.py')
  if (!existsSync(script)) throw new Error(`找不到导出器：${script}`)
  const args = [script, draftFile, '-o', outFile]
  if (title) args.push(`--fallback-title=${title}`)
  const { code, stdout, stderr } = await runPython(args, { timeoutMs: 120_000 })
  const output = `${stdout}\n${stderr}`.trim()
  if (code !== 0 || !existsSync(outFile)) {
    const detail = output.split('\n').filter(Boolean).slice(-3).join(' ')
    throw new Error(detail || `导出失败（退出码 ${code}）`)
  }
  return { outFile, output }
}


// 导出后核对包内结构：document.xml / [Content_Types].xml 在不在，页眉页脚图片有没有真的打进去
const DOCX_VERIFY = [
  'import sys, zipfile',
  'z = zipfile.ZipFile(sys.argv[1])',
  'names = set(z.namelist())',
  'issues = []',
  'for need in ("[Content_Types].xml", "word/document.xml"):',
  '    if need not in names:',
  '        issues.append("缺少 " + need)',
  'for name in sorted(n for n in names if n.startswith("word/header") and n.endswith(".xml")):',
  '    body = z.read(name).decode("utf-8", "ignore")',
  '    if "w:drawing" in body:',
  '        refs = [n for n in names if n.startswith("word/media/")]',
  '        if not refs:',
  '            issues.append(name + " 里引用了图片，但包里没有 media")',
  'print("\\n".join(issues))',
].join('\n')

export async function verifyDocx(outFile) {
  try {
    const { code, stdout } = await runPython(['-c', DOCX_VERIFY, outFile], { timeoutMs: 20_000 })
    if (code !== 0) return { ok: false, issues: ['核对脚本没有跑通'] }
    const issues = String(stdout || '').split('\n').map((l) => l.trim()).filter(Boolean)
    return { ok: issues.length === 0, issues }
  } catch (e) {
    return { ok: false, issues: [String(e.message || e)] }
  }
}

// 机检成稿：章节、顺序、层级、格式红线、结尾、占位符。机器只做提示，最终以人工校对为准。
export async function checkDraft({ skillDir, draftFile, docType }) {
  const script = join(skillDir, 'scripts', 'check_draft.py')
  if (!existsSync(script)) throw new Error(`找不到校验器：${script}`)
  const { code, stdout, stderr } = await runPython([script, docType, draftFile, '--facts'], { timeoutMs: 90_000 })
  const output = `${stdout}\n${stderr}`.replace(/\r\n/g, '\n').trim()
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean)
  // 校验器把明细写成 “- …”，分别挂在 [ERROR]/[WARN]/[INFO]/[AUDIT] 标题下面。
  // 旧解析只收以 [TAG] 开头的行，会把真正的错误和警告全丢掉。
  const errors = []
  const warnings = []
  const infos = []
  const items = []
  let bucket = null
  for (const line of lines) {
    if (line.startsWith('[ERROR]')) {
      bucket = 'errors'
      continue
    }
    if (line.startsWith('[WARN]')) {
      bucket = 'warnings'
      continue
    }
    if (line.startsWith('[INFO]')) {
      bucket = 'infos'
      continue
    }
    if (line.startsWith('[AUDIT]')) {
      bucket = 'items'
      continue
    }
    if (line.startsWith('[OK]')) {
      bucket = null
      continue
    }
    if (line.startsWith('-')) {
      const text = line.replace(/^-\s*/, '').trim()
      if (!text) continue
      items.push(text)
      if (bucket === 'errors') errors.push(text)
      else if (bucket === 'warnings') warnings.push(text)
      else if (bucket === 'infos') infos.push(text)
    }
  }
  return {
    ok: code === 0,
    code,
    errors,
    warnings,
    infos,
    items,
    output,
  }
}
