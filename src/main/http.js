import { randomUUID } from 'node:crypto'

// 统一的桌面端伪装 UA，避免站点针对 Node fetch 做拦截
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const DEFAULT_TIMEOUT = 12000

/* ============ 简易 cookie jar ============
 * Node 的 fetch 不自动维护会话，而 gequbao 的直链接口（common-play-url）需要
 * 先访问详情页拿到的会话 cookie 才能放行，否则会触发「请完成人机验证」。
 * 这里按域名缓存 set-cookie，并在同域后续请求里自动带上。 */
const cookieJar = new Map() // hostname -> Map<name, value>

function domainOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function storeCookies(url, res) {
  const host = domainOf(url)
  if (!host) return

  let list = []
  if (typeof res.headers.getSetCookie === 'function') {
    list = res.headers.getSetCookie()
  } else {
    const raw = res.headers.get('set-cookie')
    if (raw) list = raw.split(',').map((s) => s.trim())
  }
  if (!list.length) return

  if (!cookieJar.has(host)) cookieJar.set(host, new Map())
  const jar = cookieJar.get(host)

  for (const raw of list) {
    const head = raw.split(';')[0]
    const idx = head.indexOf('=')
    if (idx <= 0) continue
    const name = head.slice(0, idx).trim()
    const value = head.slice(idx + 1).trim()
    if (!name) continue

    // 过期 cookie 丢弃
    const exp = /expires=([^;]+)/i.exec(raw)
    if (exp && new Date(exp[1]).getTime() < Date.now()) {
      jar.delete(name)
      continue
    }
    jar.set(name, value)
  }
}

function cookieHeader(url) {
  const jar = cookieJar.get(domainOf(url))
  if (!jar || jar.size === 0) return ''
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function abortAfter(ms) {
  if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  timer.unref?.()
  return controller.signal
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 编码探测：优先响应头，其次 <meta charset>，最后 UTF-8
function pickEncoding(contentType, buf) {
  const fromHeader = /charset\s*=\s*"?([a-z0-9_-]+)"?/i.exec(contentType || '')
  const label = fromHeader ? fromHeader[1].toLowerCase() : null
  if (label) return label

  try {
    const head = Buffer.from(buf.subarray(0, 4096)).toString('latin1')
    const fromMeta = /<meta[^>]+charset\s*=\s*"?([a-z0-9_-]+)"?/i.exec(head)
    if (fromMeta) return fromMeta[1].toLowerCase()
  } catch {
    /* ignore */
  }
  return 'utf-8'
}

function canonicalEncoding(label) {
  if (!label || label === 'utf8') return 'utf-8'
  if (/^(gb2312|gbk|gb18030|gb-?18030)$/.test(label)) return 'gb18030'
  if (label.startsWith('big5')) return 'big5'
  if (label.startsWith('windows-125')) return label
  return 'utf-8'
}

export function decodeBody(buf, contentType = '') {
  const candidates = [canonicalEncoding(pickEncoding(contentType, buf)), 'utf-8']
  for (const enc of candidates) {
    try {
      return new TextDecoder(enc).decode(buf)
    } catch {
      /* 不支持的标签则回退 */
    }
  }
  return Buffer.from(buf).toString('utf8')
}

/**
 * 带超时 + 重试的文本请求。返回 { text, status, url }
 */
export async function request(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = 1,
    accept = '*/*'
  } = options

  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const cookies = cookieHeader(url)
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': UA,
          Accept: accept,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...(cookies ? { Cookie: cookies } : {}),
          ...headers
        },
        body,
        redirect: 'follow',
        signal: abortAfter(timeout)
      })

      storeCookies(url, res)

      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`)
        error.status = res.status
        throw error
      }

      const buf = new Uint8Array(await res.arrayBuffer())
      return {
        text: decodeBody(buf, res.headers?.get?.('content-type') || ''),
        status: res.status,
        url: res.url || url
      }
    } catch (err) {
      lastError = err
      // 4xx 是确定性结果（如站点用 404 表示「无结果」），重试无意义
      const isClientError = err?.status >= 400 && err?.status < 500
      if (attempt < retries && !isClientError) {
        await sleep(250 * (attempt + 1))
        continue
      }
      // 统一错误文案，渲染层只展示 message；保留 status 供上层判断
      const reason = err?.name === 'AbortError' || err?.name === 'TimeoutError' ? '请求超时' : err?.message
      const wrapped = new Error(`${reason || '网络请求失败'}`)
      wrapped.status = err?.status
      throw wrapped
    }
  }
  throw lastError
}

export async function requestJson(url, options = {}) {
  const { accept = 'application/json, text/plain, */*', ...rest } = options
  const { text } = await request(url, { ...rest, accept })
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('响应不是合法的 JSON')
  }
}

export function formBody(obj = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  return params.toString()
}

export function newReqId() {
  return randomUUID()
}
