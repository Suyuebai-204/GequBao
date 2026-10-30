import { createWriteStream, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { request, formBody } from './http.js'

const BASE = 'https://www.gequbao.com'

/* ============ 文本工具 ============ */

function stripTags(str = '') {
  return String(str)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
}

function decodeEntities(str = '') {
  return String(str)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
}

function normalize(str = '') {
  return String(str).replace(/\s+/g, ' ').trim()
}

// JS 字符串字面量反转义（\u0022 / \\u6708 / \/ 等），不执行页面代码
function jsUnescape(str = '') {
  return String(str).replace(
    /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g,
    (all, seq) => {
      const head = seq[0]
      if (head === 'u' || head === 'x') {
        const hex = head === 'u' && seq[1] === '{' ? seq.slice(2, -1) : seq.slice(1)
        const code = Number.parseInt(hex, 16)
        try {
          return Number.isFinite(code) ? String.fromCodePoint(code) : ''
        } catch {
          return ''
        }
      }
      switch (seq) {
        case 'n':
          return '\n'
        case 'r':
          return '\r'
        case 't':
          return '\t'
        case 'b':
          return '\b'
        case 'f':
          return '\f'
        case 'v':
          return '\v'
        case '0':
          return '\0'
        default:
          return seq
      }
    }
  )
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/* ============ 一、详情页解析 ============ */

/**
 * @param {number|string} musicId /music/<id> 的 id
 * @returns {Promise<object>} 详情（含歌词与播放凭证）
 */
export async function getSongDetail(musicId) {
  const id = Number.parseInt(String(musicId).replace(/\D/g, ''), 10)
  if (!Number.isFinite(id)) throw new Error('歌曲 id 无效')

  let html
  try {
    const res = await request(`${BASE}/music/${id}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: `${BASE}/`
      },
      timeout: 15000
    })
    html = res.text
  } catch (error) {
    if (error?.status === 404) throw new Error('歌曲不存在或已下架')
    throw error
  }

  const app = parseAppData(html) || {}
  const lrc = parseLrc(extractLrcText(html, app))

  const title = normalize(app.mp3_title || firstText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '')
  const artist = normalize(app.mp3_author || firstText(html, /class="song-author[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || '')
  const cover = pickUrl(app.mp3_cover) || firstText(html, /class="player-cover-img"[^>]*src="([^"]+)"/i)

  const netdisk = pickNetdisk(app)

  return {
    id: Number(app.mp3_id) || id,
    title: title || `歌曲 ${id}`,
    artist,
    cover: cover ? decodeEntities(cover) : '',
    duration: normalize(app.mp3_duration || ''),
    durationSec: parseDuration(app.mp3_duration),
    playId: typeof app.play_id === 'string' ? app.play_id : '',
    // 直链 API 失效时的兜底直链（并非所有歌曲都有）
    urlA: pickUrlA(app),
    netdiskUrl: netdisk,
    lrcEmpty: !!app.lrc_is_empty,
    lrc
  }
}

function firstText(html, re) {
  const m = re.exec(String(html))
  return m ? normalize(decodeEntities(stripTags(m[1]))) : ''
}

function pickUrl(value) {
  if (typeof value !== 'string') return ''
  const url = value.replace(/\\\//g, '/').trim()
  return /^https?:\/\//i.test(url) ? url : ''
}

function parseDuration(value) {
  const m = /^(\d{1,3}):(\d{1,2})$/.exec(String(value || '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

// appData 是 JSON.parse('...') 的字符串字面量，按「提取 -> 反转义 -> 解析」处理，多层兜底
function parseAppData(html) {
  const source = String(html)
  const re = /window\.appData\s*=\s*JSON\.parse\(\s*(['"])([\s\S]*?)\1\s*\)/i
  const m = re.exec(source)
  if (m) {
    const literal = m[2]
    const parsed = safeJson(jsUnescape(literal)) || safeJson(literal) || safeJson(decodeEntities(literal))
    if (parsed && typeof parsed === 'object') return parsed
  }

  // 兜底：直接从页面里抠字段
  const pick = (key) => {
    const r = new RegExp(`${key}[\\\\"']*\\s*:\\s*(?:\\\\?"([^"\\\\]*)\\\\?"|(\\d+))`, 'i')
    const hit = r.exec(source)
    return hit ? hit[1] ?? hit[2] : ''
  }
  const fallback = {
    mp3_id: pick('mp3_id'),
    play_id: pick('play_id'),
    mp3_title: pick('mp3_title'),
    mp3_author: pick('mp3_author'),
    mp3_cover: pick('mp3_cover'),
    mp3_duration: pick('mp3_duration')
  }
  return Object.values(fallback).some(Boolean) ? fallback : null
}

function pickUrlA(app) {
  return (
    pickUrl(app.mp3_url_a) ||
    pickUrl(app.mp3_url) ||
    pickUrl(app.url_a) ||
    pickUrl(app.mp3_play_url) ||
    ''
  )
}

// extra_recommend_wap_url / mp3_extra_urls[].share_link 是 base64 的网盘地址
function pickNetdisk(app) {
  const candidates = [app.extra_recommend_wap_url]
  for (const item of Array.isArray(app.mp3_extra_urls) ? app.mp3_extra_urls : []) {
    candidates.push(item?.share_link)
  }

  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw) continue
    const decoded = pickUrl(base64Decode(raw))
    if (decoded) return decoded
  }
  return ''
}

function base64Decode(value) {
  try {
    const text = Buffer.from(String(value), 'base64').toString('utf8')
    return /^https?:\/\//i.test(text.trim()) ? text.trim() : ''
  } catch {
    return ''
  }
}

function extractLrcText(html, app) {
  const m =
    /<div[^>]*id=["']content-lrc["'][^>]*>([\s\S]*?)<\/div>/i.exec(html) ||
    /<div[^>]*class=["'][^"']*content-lrc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)
  if (m) return decodeEntities(stripTags(m[1]))

  if (typeof app?.lrc === 'string') return app.lrc
  return ''
}

/**
 * 解析 LRC 为 [{ time: 秒, text }]，一行多时间戳会被展开，按时间升序
 */
export function parseLrc(text) {
  const rows = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    const content = normalize(line.replace(/\[[^\]]*\]/g, ''))

    if (!stamps.length) {
      // 无时间轴的行（元信息或纯歌词）丢弃元信息，保留纯文本作为朗读行
      if (content && !/^(ti|ar|al|by|offset)\s*:/i.test(content)) {
        rows.push({ time: rows.length ? rows[rows.length - 1].time : 0, text: content })
      }
      continue
    }

    for (const s of stamps) {
      const min = Number(s[1]) || 0
      const sec = Number(s[2]) || 0
      const fracRaw = s[3] ?? '0'
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length)
      rows.push({ time: Math.max(0, min * 60 + sec + frac), text: content })
    }
  }

  rows.sort((a, b) => a.time - b.time)
  return dedupeLrc(rows)
}

function dedupeLrc(rows) {
  const out = []
  for (const row of rows) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.time - row.time) < 0.01) {
      if (!prev.text && row.text) prev.text = row.text
      continue
    }
    out.push({ ...row })
  }
  return out
}

/* ============ 二、播放直链 ============ */

/* ---- 数字验证码自动识别（tesseract.js，仅 0-9 白名单） ---- */
let ocrWorkerPromise = null

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      // 缓存到系统临时目录，避免污染安装/工作目录；首跑会下载 eng 训练数据
      const worker = await createWorker('eng', 1, {
        cachePath: path.join(os.tmpdir(), 'gequbao-tessdata')
      })
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '7' // 视为单行文本
      })
      return worker
    })().catch((error) => {
      ocrWorkerPromise = null // 失败后允许下次重试
      throw error
    })
  }
  return ocrWorkerPromise
}

async function ocrDigits(buffer) {
  try {
    const worker = await getOcrWorker()
    const { data } = await worker.recognize(buffer)
    const digits = String(data?.text || '').replace(/\D/g, '')
    return digits ? digits.slice(0, 10) : ''
  } catch {
    return ''
  }
}

/** 取一张验证码并识别出数字：{ captchaCode, key } | null */
async function fetchCaptcha() {
  const { text } = await request(`${BASE}/api/captcha?${Math.random()}`, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: `${BASE}/`,
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 10000
  })
  const json = safeJson(text)
  const key = json?.data?.key
  const img = json?.data?.img
  if (json?.code !== 1 || !key || typeof img !== 'string') return null

  const base64 = img.replace(/^data:image\/\w+;base64,/, '')
  const captchaCode = await ocrDigits(Buffer.from(base64, 'base64'))
  if (!captchaCode) return null
  return { captchaCode, key }
}

async function requestPlayUrl(playId, musicId = '', captcha = null) {
  const body = { id: playId, purpose: 'play' }
  if (captcha) {
    body.captchaCode = captcha.captchaCode
    body.key = captcha.key
  }

  const { text } = await request(`${BASE}/member/common-play-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: BASE,
      Referer: musicId ? `${BASE}/music/${musicId}` : `${BASE}/`
    },
    body: formBody(body),
    timeout: 12000
  })

  const json = safeJson(text)
  const url = pickUrl(json?.data?.url)
  if (url) return { url, isWhiteUrl: !!json?.data?.is_white_url, ut: !!json?.data?.ut }

  // 站点启用了人机验证（图片验证码）：接口返回 { code:2, msg:'请完成人机验证...' }
  const msg = normalize(json?.msg) || ''
  if (json?.code === 2 || /人机验证|验证码|验证后继续|verify/i.test(msg)) {
    const err = new Error('站点要求完成人机验证')
    err.code = 'CAPTCHA'
    throw err
  }
  throw new Error(msg || '未获取到播放地址')
}

/**
 * 获取播放直链；被要求人机验证时自动取图识别并重试（识别错了换一张，最多 4 次）
 * @param {string} playId 详情页下发的加密凭证
 * @param {number|string} musicId 仅用于拼 Referer
 */
export async function getPlayUrl(playId, musicId = '') {
  if (!playId) throw new Error('缺少播放凭证')

  try {
    return await requestPlayUrl(playId, musicId)
  } catch (error) {
    if (error?.code !== 'CAPTCHA') throw error

    let lastError = error
    for (let attempt = 0; attempt < 4; attempt++) {
      const captcha = await fetchCaptcha().catch(() => null)
      if (!captcha) break
      try {
        return await requestPlayUrl(playId, musicId, captcha)
      } catch (e) {
        lastError = e
        if (e?.code !== 'CAPTCHA') throw e
      }
    }

    const err = new Error('人机验证自动识别失败，请稍后重试或在浏览器中打开播放')
    err.code = 'CAPTCHA'
    err.cause = lastError
    throw err
  }
}

// 轻量探活：能拿到 2xx/206 且非 HTML 即认为可用
async function isPlayable(url) {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1023' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return false
    const type = (res.headers.get('content-type') || '').toLowerCase()
    return !type.includes('html')
  } catch {
    return false
  }
}

/**
 * 打开一首歌：详情 + 直链（接口失败/直链失效时退回页面内的 urlA）
 */
export async function openSong(musicId) {
  const detail = await getSongDetail(musicId)

  let url = ''
  let source = 'api'
  try {
    const resolved = await getPlayUrl(detail.playId, detail.id)
    url = resolved.url
  } catch (e) {
    if (e?.code === 'CAPTCHA') throw e // 直接抛出，让上层提示用户去浏览器验证
    /* 其它情况交给下面兜底 */
  }

  if (url && detail.urlA) {
    // 只有存在备用直链时才值得多花一次探活
    if (!(await isPlayable(url))) {
      url = detail.urlA
      source = 'fallback'
    }
  } else if (!url && detail.urlA) {
    url = detail.urlA
    source = 'fallback'
  }

  if (!url) throw new Error('未获取到可用的播放地址')

  return { detail, url, source }
}

/* ============ 三、直链下载 ============ */

export function safeFileName(input, fallback = 'music') {
  const name = String(input ?? '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return name || fallback
}

/**
 * 流式把直链写入磁盘，边下边回报进度（0-99），失败会删掉半成品文件
 */
export async function downloadToFile(url, filePath, onProgress) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: '*/*'
    },
    redirect: 'follow'
  })

  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`)
  const type = (res.headers.get('content-type') || '').toLowerCase()
  if (type.includes('html')) throw new Error('直链已失效，请重新播放后再试')

  const total = Number(res.headers.get('content-length')) || 0
  const file = createWriteStream(filePath)
  const reader = res.body?.getReader()
  if (!reader) throw new Error('响应不支持流式读取')

  let received = 0
  let lastTick = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (!file.write(Buffer.from(value))) {
        await new Promise((resolve) => file.once('drain', resolve))
      }
      const now = Date.now()
      if (onProgress && now - lastTick > 120) {
        lastTick = now
        onProgress(total ? Math.min(99, Math.round((received / total) * 100)) : 0)
      }
    }

    await new Promise((resolve, reject) => {
      file.end((err) => (err ? reject(err) : resolve()))
    })

    if (!received) throw new Error('下载内容为空')
    return { bytes: received, total }
  } catch (error) {
    file.destroy()
    await fs.unlink(filePath).catch(() => {})
    throw error
  }
}

/**
 * 播放出错时重新取一次直链
 */
export async function refreshPlayUrl(playId, musicId = '', urlA = '') {
  try {
    const { url } = await getPlayUrl(playId, musicId)
    if (url) return { url, source: 'api' }
  } catch {
    /* ignore */
  }
  if (urlA) return { url: urlA, source: 'fallback' }
  throw new Error('播放地址已失效')
}
