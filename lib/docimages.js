// 页眉 / 页脚图片库（与 skill 里的 docgen/image_library.py 同一套文件格式）：
// $DSH_HOME/writing-assistant/doc-images/<sha10>.<ext> + index.json（名字、原文件名、sha、尺寸、添加时间）。
// 图片按内容哈希命名，同名换图会覆盖条目；同一张图重复上传直接复用。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './store.js'

const SUFFIX = new Set(['.png', '.jpg', '.jpeg'])

// 图片跟稿件、档案一起放在 DSH 数据目录，不写进插件包：升级插件不会丢图。
export function docImageDir() {
  return process.env.OFFICIAL_DOC_IMAGE_DIR || join(dataDir(), 'doc-images')
}

const cleanName = (name) =>
  String(name || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .trim() || '未命名图片'

function loadIndex(dir) {
  const file = join(dir, 'index.json')
  if (!existsSync(file)) return []
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data.filter((it) => it && typeof it === 'object' && it.file) : []
  } catch {
    return []
  }
}

function saveIndex(dir, items) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'index.json')
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}

// PNG / JPEG 的宽高：只读文件头，不引依赖
export function imageSize(buffer) {
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) {
        i += 1
        continue
      }
      const marker = buffer[i + 1]
      const len = buffer.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }
  return { width: 0, height: 0 }
}

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')

const findByName = (items, name) => {
  const target = cleanName(name).toLowerCase()
  const byName = items.find((it) => cleanName(it.name || '').toLowerCase() === target)
  if (byName) return byName
  const stem = (s) => String(s || '').replace(/\.[^.]+$/, '').toLowerCase()
  return items.find((it) => stem(it.name) === stem(target)) || null
}

export function listDocImages(skillDir) {
  const dir = docImageDir(skillDir)
  const items = loadIndex(dir)
  const alive = items.filter((it) => existsSync(join(dir, it.file)))
  if (alive.length !== items.length) saveIndex(dir, alive)
  return alive.map((it) => ({ ...it, url: `api/doc-images/file/${encodeURIComponent(it.file)}` }))
}

export function addDocImage(skillDir, { buffer, originalName, name }) {
  if (!buffer || !buffer.length) throw new Error('图片是空的')
  const suffix = (String(originalName || '').match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase()
  if (!SUFFIX.has(suffix)) throw new Error('只支持 png / jpg / jpeg')
  const dir = docImageDir(skillDir)
  let items = listDocImages(skillDir)
  const digest = sha(buffer)
  const same = items.find((it) => it.sha256 === digest)
  if (same) return same

  const displayName = cleanName(name || String(originalName || '').replace(/\.[^.]+$/, ''))
  const existing = findByName(items, displayName)
  if (existing) {
    items = items.filter((it) => it !== existing)
    if (!items.some((it) => it.file === existing.file)) {
      try {
        unlinkSync(join(dir, existing.file))
      } catch {}
    }
  }

  mkdirSync(dir, { recursive: true })
  const file = `${digest.slice(0, 10)}${suffix}`
  writeFileSync(join(dir, file), buffer)
  const { width, height } = imageSize(buffer)
  const entry = {
    name: displayName,
    file,
    original_name: String(originalName || ''),
    sha256: digest,
    width_px: width,
    height_px: height,
    added_at: new Date().toISOString().slice(0, 19),
  }
  items.push(entry)
  saveIndex(dir, items)
  return entry
}

export function removeDocImage(skillDir, name) {
  const dir = docImageDir(skillDir)
  const items = loadIndex(dir)
  const entry = findByName(items, name)
  if (!entry) throw new Error(`没有这张图片：${name}`)
  const rest = items.filter((it) => it !== entry)
  saveIndex(dir, rest)
  if (!rest.some((it) => it.file === entry.file)) {
    try {
      unlinkSync(join(dir, entry.file))
    } catch {}
  }
  return true
}
