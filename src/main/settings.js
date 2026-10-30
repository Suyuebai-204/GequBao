import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 设置默认值：只在 settings.json 缺失/损坏时使用 */
export const DEFAULT_SETTINGS = {
  volume: 80, // 默认音量（0-100）
  repeatMode: 'all', // 播放循环：off 顺序 / all 列表循环 / one 单曲循环
  autoOpenPlayer: false, // 播放新歌时自动展开播放页
  autoStart: false, // 开机自动运行
  libraryDir: '', // 本地音乐扫描目录
  downloadDir: '' // 下载默认目录（空 = 系统「音乐」目录）
}

let dir = ''
let cache = null

export function initSettings(userDataDir) {
  dir = userDataDir
  cache = null
}

function settingsFile() {
  return join(dir || '.', 'settings.json')
}

async function read() {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(settingsFile(), 'utf8'))
    cache = { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export async function getSettings() {
  return read()
}

/** 合并写入：仅接受已知字段，未提供的保持原值 */
export async function updateSettings(patch = {}) {
  const current = await read()
  const next = { ...current }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in patch && patch[key] !== undefined) next[key] = patch[key]
  }
  cache = next
  await mkdir(dir || '.', { recursive: true })
  const target = settingsFile()
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
  await rename(tmp, target)
  return next
}
