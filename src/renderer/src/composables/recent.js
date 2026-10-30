import { reactive } from 'vue'

/** 最近播放：由播放器写入，DiscoverView 展示 */
export const recent = reactive({
  list: [],
  loaded: false,
  loading: false,
  error: ''
})

function unwrap(res, fallback) {
  if (!res?.ok) throw new Error(res?.error || '读取播放历史失败')
  return Array.isArray(res.data) ? res.data : fallback
}

export async function loadRecent() {
  // preload 未更新（应用没有完全重启）时给出明确提示，而不是永远停在「加载中」
  if (!window.api?.history) {
    recent.loaded = true
    recent.loading = false
    recent.error = '播放历史模块未加载，请完全退出应用后重新启动'
    return
  }
  recent.loading = true
  recent.error = ''
  try {
    recent.list = unwrap(await window.api.history.list(), [])
    recent.loaded = true
  } catch (error) {
    recent.error = error?.message || '读取播放历史失败'
  } finally {
    recent.loading = false
  }
}

/** 播放器成功加载歌曲后调用：同 id 会提到最前 */
export async function recordRecent(song) {
  if (!window.api?.history || !song?.id) return
  try {
    recent.list = unwrap(
      await window.api.history.add({
        id: song.id,
        title: song.title,
        artist: song.artist,
        cover: song.cover,
        duration: song.duration,
        durationSec: song.durationSec,
        playId: song.playId,
        urlA: song.urlA,
        netdiskUrl: song.netdiskUrl,
        playedAt: Date.now()
      }),
      recent.list
    )
  } catch {
    /* 历史写入失败不影响播放 */
  }
}

export async function removeRecent(id) {
  if (!window.api?.history) return
  try {
    recent.list = unwrap(await window.api.history.remove(id), recent.list)
  } catch {
    /* ignore */
  }
}

export async function clearRecent() {
  if (!window.api?.history) return
  try {
    recent.list = unwrap(await window.api.history.clear(), [])
  } catch {
    /* ignore */
  }
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / MM-DD */
export function formatPlayedAt(timestamp) {
  const ts = Number(timestamp) || 0
  if (!ts) return '-'

  const now = new Date()
  const then = new Date(ts)
  const diff = now.getTime() - ts

  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`

  const sameDay = now.toDateString() === then.toDateString()
  const pad = (n) => String(n).padStart(2, '0')
  const clock = `${pad(then.getHours())}:${pad(then.getMinutes())}`

  if (sameDay) return `今天 ${clock}`
  if (diff < 48 * 60 * 60 * 1000 && now.getDate() - then.getDate() === 1) return `昨天 ${clock}`

  return `${pad(then.getMonth() + 1)}-${pad(then.getDate())} ${clock}`
}
