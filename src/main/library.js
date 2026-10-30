import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { parseFile } from 'music-metadata'

/* 支持的音频扩展名（wma 无元数据解析价值，不收） */
const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape'])
const MAX_DEPTH = 3 // 递归扫描层数，防止目录过深拖慢扫描

function decodeEntities(str = '') {
  return String(str)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
    .trim()
}

function clean(str = '') {
  return decodeEntities(String(str)).replace(/\s+/g, ' ').trim()
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

/** 编码描述：无损显示 位深/采样率，有损显示 码率 */
function formatCodec(info, ext) {
  const { container, codec, bitrate, sampleRate, numberOfChannels } = info.format || {}
  const lossless = /flac|ape|wav|aiff/i.test(`${container} ${codec} ${ext}`)
  if (lossless) {
    const depth = info.format.bitsPerSample || 16
    const khz = sampleRate ? Math.round(sampleRate / 1000) : 44
    const label = /flac/i.test(`${container} ${codec}`) ? 'FLAC' : /ape/i.test(`${codec}`) ? 'APE' : 'WAV'
    return `${label} ${depth}/${khz}`
  }
  const kbps = bitrate ? Math.round(bitrate / 1000) : 0
  const label = /mp3/i.test(`${container} ${codec} ${ext}`)
    ? 'MP3'
    : /aac/i.test(`${codec}`) ? 'AAC' : /ogg|opus/i.test(`${container} ${codec}`) ? 'OGG' : '音频'
  return kbps ? `${label} ${kbps} kbps` : label
}

/** 文件名兜底解析：「歌手 - 标题.ext」 */
function fromFileName(name) {
  const base = name.replace(/\.[^.]+$/, '').trim()
  const m = /^(.+?)\s*[-–—]\s*(.+)$/.exec(base)
  return m ? { artist: clean(m[1]), title: clean(m[2]) } : { artist: '', title: base }
}

async function scanDir(dir, depth, out) {
  if (depth > MAX_DEPTH || out.length >= 2000) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // 无权限/已删除的目录直接跳过
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await scanDir(full, depth + 1, out)
      continue
    }
    if (!entry.isFile() || !AUDIO_EXT.has(extname(entry.name).toLowerCase())) continue

    let size = 0
    try {
      size = (await stat(full)).size
    } catch {
      continue
    }

    const fallback = fromFileName(entry.name)
    const item = {
      path: full,
      title: fallback.title,
      artist: fallback.artist,
      album: '',
      year: 0,
      durationSec: 0,
      size,
      sizeText: formatBytes(size),
      format: ''
    }

    // 元数据解析失败不影响整表：退回文件名解析
    try {
      const meta = await parseFile(full, { duration: true })
      const { common, format } = meta
      item.title = clean(common.title) || fallback.title
      item.artist = (Array.isArray(common.artists) ? common.artists.join(' / ') : clean(common.artist)) || fallback.artist
      item.album = clean(common.album)
      item.year = Number(common.year) || 0
      item.durationSec = Math.round(format.duration || 0)
      item.format = formatCodec(meta, extname(entry.name).toLowerCase())
    } catch {
      item.format = extname(entry.name).replace('.', '').toUpperCase()
    }

    out.push(item)
  }
}

/**
 * 扫描目录下的音频文件（递归，最多 3 层），返回 { dir, list, totalSize }
 */
export async function scanLibrary(dir) {
  if (!dir || typeof dir !== 'string') throw new Error('未选择有效的文件夹')
  const list = []
  await scanDir(dir, 1, list)
  const totalSize = list.reduce((sum, item) => sum + item.size, 0)
  return { dir, list, totalSize, totalSizeText: formatBytes(totalSize) }
}
