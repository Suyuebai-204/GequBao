import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_HISTORY = 100

let cacheDir = ''
let cache = null // 内存缓存，避免每次都读盘

export function initStore(userDataDir) {
  cacheDir = userDataDir
  cache = null
}

function historyFile() {
  return join(cacheDir || '.', 'play-history.json')
}

async function readAll() {
  if (cache) return cache
  try {
    const text = await readFile(historyFile(), 'utf8')
    const parsed = JSON.parse(text)
    cache = Array.isArray(parsed) ? parsed : []
  } catch {
    // 文件不存在或内容损坏都当作空历史
    cache = []
  }
  return cache
}

async function writeAll(list) {
  cache = list
  await mkdir(cacheDir || '.', { recursive: true })
  const target = historyFile()
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify(list), 'utf8')
  await rename(tmp, target)
}

function toEntry(raw = {}) {
  const id = Number(raw.id ?? raw.musicId)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    id,
    title: String(raw.title || '未知歌曲').slice(0, 200),
    artist: String(raw.artist || '').slice(0, 200),
    cover: String(raw.cover || ''),
    duration: String(raw.duration || ''),
    durationSec: Number(raw.durationSec) || 0,
    playId: String(raw.playId || ''),
    urlA: String(raw.urlA || ''),
    netdiskUrl: String(raw.netdiskUrl || ''),
    playedAt: Number(raw.playedAt) || Date.now()
  }
}

/** 最近播放列表（新的在前） */
export async function getHistory(limit = MAX_HISTORY) {
  const list = await readAll()
  return list.slice(0, limit)
}

/** 写入一条记录：同 id 会被提到最前并更新时间 */
export async function pushHistory(raw) {
  const entry = toEntry(raw)
  if (!entry) return getHistory()

  const list = await readAll()
  const next = [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY)
  await writeAll(next)
  return next
}

export async function removeHistory(id) {
  const target = Number(id)
  const list = await readAll()
  const next = list.filter((item) => Number(item.id) !== target)
  await writeAll(next)
  return next
}

export async function clearHistory() {
  await writeAll([])
  return []
}
