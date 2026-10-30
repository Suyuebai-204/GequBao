import { computed, reactive } from 'vue'
import { recordRecent } from './recent.js'

/**
 * 播放器全局状态：audio 实例、播放队列、浮层显隐都放在模块作用域，
 * 与 PlayerSheet 组件的挂载/显隐解耦 —— 收起浮层不会中断播放。
 */
export const player = reactive({
  open: false,
  loading: false,
  error: '',
  song: null,
  url: '',
  source: '',
  queue: [],
  index: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  repeat: 'all', // off 顺序播放 / all 列表循环 / one 单曲循环
  // 直链下载状态：active 时按钮显示百分比，完成后短暂显示「已保存」
  download: { active: false, percent: 0, message: '' }
})

/* 来自设置页的偏好（播放新歌是否自动展开播放页） */
let autoOpenPlayer = false

let audio = null
let loadToken = 0
let retried = false

/* ============ audio 实例 ============ */

function ensureAudio() {
  if (audio) return audio

  audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = player.volume

  audio.addEventListener('timeupdate', () => {
    player.currentTime = audio.currentTime || 0
  })
  audio.addEventListener('durationchange', () => {
    player.duration = Number.isFinite(audio.duration) ? audio.duration : player.duration
  })
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) player.duration = audio.duration
  })
  audio.addEventListener('play', () => {
    player.playing = true
  })
  audio.addEventListener('pause', () => {
    player.playing = false
  })
  audio.addEventListener('ended', () => {
    if (player.repeat === 'one') {
      el.currentTime = 0
      el.play().catch(() => {})
      return
    }
    if (player.index < player.queue.length - 1) next()
    else if (player.repeat === 'all' && player.queue.length) {
      player.index = 0
      loadCurrent()
    } else player.playing = false
  })
  audio.addEventListener('error', () => {
    // 本地文件没有直链可换，直接报错
    if (player.song?.local) {
      player.error = '本地文件无法播放，可能已被移动或删除'
      player.loading = false
      player.playing = false
      return
    }
    // 直链有时效：先静默换一次新地址，仍失败才报错
    if (!retried) {
      retried = true
      refreshUrl(true)
      return
    }
    player.error = '音频加载失败，可重试或换一首'
    player.loading = false
    player.playing = false
  })

  return audio
}

/* ============ 播放控制 ============ */

function toTrack(item = {}) {
  const musicId = Number(item.musicId ?? item.id)
  return {
    musicId: Number.isFinite(musicId) ? musicId : null,
    title: String(item.title ?? item.label ?? ''),
    artist: String(item.artist ?? ''),
    cover: String(item.cover ?? '')
  }
}

/** 目标曲目就是当前这首（按 id 判断）：不重头播，恢复/继续即可 */
function isSameSong(track) {
  return Number(track?.musicId) === Number(player.song?.id) && !!player.url
}

function resumeCurrent() {
  player.open = true
  if (!player.playing) {
    const el = ensureAudio()
    el.play().catch(() => {})
  }
}

/** 以单曲打开（来自搜索建议、猜你想找等） */
export function playTrack(track) {
  const item = toTrack(track)
  if (!item.musicId) return
  if (isSameSong(item)) return resumeCurrent()
  player.queue = [item]
  player.index = 0
  return loadCurrent()
}

/** 以列表打开（来自搜索结果列表，可上一曲/下一曲） */
export function playList(list, index = 0) {
  const tracks = (Array.isArray(list) ? list : []).map(toTrack).filter((t) => t.musicId)
  if (!tracks.length) return
  const safeIndex = Math.min(Math.max(index, 0), tracks.length - 1)
  if (isSameSong(tracks[safeIndex])) return resumeCurrent()
  player.queue = tracks
  player.index = safeIndex
  return loadCurrent()
}

/* ============ 本地音乐播放 ============ */

function localSrc(filePath) {
  return `localmusic://${encodeURIComponent(filePath)}`
}

/** 本地列表播放：直接指向文件协议，不走在线详情/直链 */
export function playLocalList(list, index = 0) {
  const tracks = (Array.isArray(list) ? list : [])
    .filter((t) => t?.path)
    .map((t) => ({
      local: true,
      path: t.path,
      src: localSrc(t.path),
      title: t.title || t.name || '未知曲目',
      artist: t.artist || '',
      durationSec: t.durationSec || 0
    }))
  if (!tracks.length) return

  const safeIndex = Math.min(Math.max(index, 0), tracks.length - 1)
  const current = player.queue[player.index]
  // 同一首本地曲目：不重头播放，唤起/恢复即可
  if (current?.local && current.path === tracks[safeIndex].path && player.url) {
    return resumeCurrent()
  }

  player.queue = tracks
  player.index = safeIndex
  return loadCurrent()
}

function loadLocal(track) {
  const token = ++loadToken
  retried = false
  resetDownload()
  player.loading = false
  player.error = ''
  player.currentTime = 0
  player.duration = track.durationSec || 0
  player.song = {
    id: null,
    local: true,
    title: track.title,
    artist: track.artist,
    cover: '',
    lrc: [],
    durationSec: track.durationSec || 0,
    netdiskUrl: '',
    playId: '',
    urlA: ''
  }
  player.url = track.src
  player.source = 'local'
  if (autoOpenPlayer) player.open = true

  const el = ensureAudio()
  el.src = track.src
  el.currentTime = 0
  el.play().catch(() => {
    player.playing = false
  })
}

/** 应用启动时从设置恢复偏好（音量/循环模式/自动展开） */
export async function initPlayerSettings() {
  try {
    const res = await window.api?.settings?.get?.()
    if (!res?.ok) return
    const s = res.data || {}
    if (Number.isFinite(Number(s.volume))) setVolume(Number(s.volume) / 100)
    if (['off', 'all', 'one'].includes(s.repeatMode)) player.repeat = s.repeatMode
    autoOpenPlayer = !!s.autoOpenPlayer
  } catch {
    /* 设置不可用时使用内置默认 */
  }
}

function persistSettings(patch) {
  window.api?.settings?.set?.(patch).catch(() => {})
}

/** 切换循环模式并持久化 */
export function setRepeat(mode) {
  if (!['off', 'all', 'one'].includes(mode)) return
  player.repeat = mode
  persistSettings({ repeatMode: mode })
}

/** 设置「播放时自动展开播放页」偏好 */
export function setAutoOpenPlayer(value) {
  autoOpenPlayer = !!value
  persistSettings({ autoOpenPlayer: autoOpenPlayer })
}

async function loadCurrent() {
  const track = player.queue[player.index]
  if (!track) return
  if (track.local) return loadLocal(track)
  if (!track.musicId) return

  const token = ++loadToken
  retried = false
  resetDownload()
  player.open = true
  player.loading = true
  player.error = ''
  player.currentTime = 0
  player.duration = 0
  // 先用队列里的基础信息占位，详情回来后再补封面/歌词
  player.song = {
    id: track.musicId,
    title: track.title,
    artist: track.artist,
    cover: track.cover,
    lrc: [],
    durationSec: 0,
    netdiskUrl: '',
    playId: '',
    urlA: ''
  }

  try {
    const res = await window.api.player.song(track.musicId)
    if (token !== loadToken) return

    if (!res?.ok) {
      player.error = res?.error || '获取播放地址失败'
      return
    }

    const { detail, url, source } = res.data
    player.song = detail
    player.url = url
    player.source = source
    player.duration = detail.durationSec || 0
    // 写入最近播放（同 id 移到最前）
    recordRecent(detail)

    const el = ensureAudio()
    el.src = url
    el.currentTime = 0
    try {
      await el.play()
    } catch {
      // 自动播放被拦截时保持暂停状态，由用户点播放
      player.playing = false
    }
  } catch (error) {
    if (token === loadToken) player.error = error?.message || '获取播放地址失败'
  } finally {
    if (token === loadToken) player.loading = false
  }
}

async function refreshUrl(silent = false) {
  const song = player.song
  if (!song?.playId) {
    if (!silent) player.error = '播放地址已失效'
    return
  }

  try {
    const res = await window.api.player.refreshUrl({
      playId: song.playId,
      musicId: song.id,
      urlA: song.urlA || ''
    })
    if (!res?.ok) throw new Error(res?.error || '播放地址已失效')

    const keepTime = player.currentTime
    player.url = res.data.url
    player.source = res.data.source

    const el = ensureAudio()
    el.src = res.data.url
    el.currentTime = keepTime
    await el.play().catch(() => {})
    player.error = ''
  } catch (error) {
    player.error = error?.message || '播放地址已失效'
  }
}

export function retry() {
  retried = false
  if (player.url) {
    const el = ensureAudio()
    el.load()
    el.play().catch(() => {})
    player.error = ''
    return
  }
  loadCurrent()
}

export function toggle() {
  const el = ensureAudio()
  if (!player.song) return
  if (el.paused) el.play().catch(() => {})
  else el.pause()
}

export function seek(seconds) {
  const el = ensureAudio()
  const total = player.duration || 0
  const next = Math.min(Math.max(Number(seconds) || 0, 0), total || Infinity)
  el.currentTime = next
  player.currentTime = next
}

let volumeSaveTimer = null

export function setVolume(value) {
  const volume = Math.min(Math.max(Number(value) || 0, 0), 1)
  player.volume = volume
  player.muted = volume === 0
  const el = ensureAudio()
  el.volume = volume
  el.muted = volume === 0
  // 音量变化 400ms 后持久化，拖动滑块时避免频繁写盘
  clearTimeout(volumeSaveTimer)
  volumeSaveTimer = setTimeout(() => persistSettings({ volume: Math.round(volume * 100) }), 400)
}

export function toggleMute() {
  const el = ensureAudio()
  const target = player.volume > 0 ? 0 : 0.8
  setVolume(target)
  el.muted = target === 0
}

export function next() {
  if (player.index < player.queue.length - 1) {
    player.index += 1
    loadCurrent()
  } else if (player.repeat === 'all' && player.queue.length) {
    // 列表循环：手动切下一曲时绕回开头
    player.index = 0
    loadCurrent()
  }
}

export function prev() {
  if (player.currentTime > 3) {
    seek(0)
    return
  }
  if (player.index > 0) {
    player.index -= 1
    loadCurrent()
  } else {
    seek(0)
  }
}

/* ============ 直链下载 ============ */

let downloadProgressBound = false

function bindDownloadProgress() {
  if (downloadProgressBound || !window.api?.player?.onDownloadProgress) return
  downloadProgressBound = true
  window.api.player.onDownloadProgress(({ percent }) => {
    if (player.download.active) player.download.percent = Number(percent) || 0
  })
}

function resetDownload() {
  player.download.active = false
  player.download.percent = 0
  player.download.message = ''
}

export async function download() {
  const song = player.song
  if (!song?.id || player.download.active) return

  bindDownloadProgress()
  player.download.active = true
  player.download.percent = 0
  player.download.message = ''

  try {
    const res = await window.api.player.download({
      musicId: song.id,
      playId: song.playId,
      url: player.url,
      urlA: song.urlA,
      title: song.title,
      artist: song.artist
    })

    if (!res?.ok) throw new Error(res?.error || '下载失败')
    if (res.data?.canceled) {
      resetDownload()
      return
    }

    player.download.active = false
    player.download.percent = 100
    player.download.message = '已保存'
    setTimeout(() => {
      if (player.download.message === '已保存') resetDownload()
    }, 3000)
  } catch (error) {
    player.download.active = false
    player.download.percent = 0
    player.download.message = error?.message || '下载失败'
  }
}

export function open() {
  if (player.song) player.open = true
}

export function close() {
  // 只收起界面，不暂停音频
  player.open = false
}

/* ============ 派生状态 ============ */

export const progress = computed(() => {
  const total = player.duration || player.song?.durationSec || 0
  if (!total) return 0
  return Math.min(player.currentTime / total, 1)
})

export const activeLyricIndex = computed(() => {
  const lrc = player.song?.lrc
  if (!Array.isArray(lrc) || !lrc.length) return -1
  const t = player.currentTime + 0.15
  let index = -1
  for (let i = 0; i < lrc.length; i++) {
    if (lrc[i].time <= t) index = i
    else break
  }
  return index
})

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
