import { request, requestJson, formBody, newReqId } from './http.js'

const BASE = 'https://www.gequbao.com'
const SUGGEST_API = `${BASE}/api/pre-s`
const GUESS_API = `${BASE}/api/guess-musics`
const HOT_API = 'https://kuwo.cn/openapi/v1/www/search/searchKey'

/* ============ 通用文本处理 ============ */

function stripTags(str = '') {
  return String(str)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
}

function decodeEntities(str = '') {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
}

function safeCodePoint(code) {
  try {
    return Number.isFinite(code) ? String.fromCodePoint(code) : ''
  } catch {
    return ''
  }
}

function normalize(str = '') {
  return String(str).replace(/\s+/g, ' ').trim()
}

function clean(str = '') {
  return normalize(decodeEntities(stripTags(str)))
}

function firstMatch(re, str = '') {
  const m = re.exec(String(str))
  return m ? m[1] : ''
}

function toInt(value) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/* ============ 一、搜索建议 ============ */

/**
 * @returns {Promise<Array<{ id: number|null, businessKey: string|null, type: 'song'|'keyword', label: string }>>}
 */
export async function suggest(keyword) {
  const kw = normalize(keyword)
  if (!kw) return []

  const { text } = await request(SUGGEST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Origin: BASE,
      Referer: `${BASE}/`
    },
    body: formBody({ keyword: kw }),
    timeout: 8000
  })

  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('建议接口返回了非 JSON 内容')
  }

  return parseSuggest(json)
}

function parseSuggest(json) {
  // 兼容三种落点：{ data: { data: {...} } } / { data: {...} } / 直接为分组对象
  let container = json?.data?.data
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    container = json?.data && typeof json.data === 'object' ? json.data : json
  }
  if (!container || typeof container !== 'object') return []

  // 分组顺序：优先数字升序（1=歌曲 放在最前），非数字键排在后面
  const keys = Object.keys(container).sort((a, b) => {
    const na = toInt(a)
    const nb = toInt(b)
    if (na === null && nb === null) return a.localeCompare(b)
    if (na === null) return 1
    if (nb === null) return -1
    return na - nb
  })

  const out = []
  const seen = new Set()

  for (const key of keys) {
    const group = container[key]
    if (!Array.isArray(group)) continue

    for (const raw of group) {
      const label =
        typeof raw === 'string' ? raw : clean(raw?.keyword ?? raw?.name ?? raw?.title ?? raw?.label ?? '')
      if (!label) continue

      const typeNum = toInt(raw?.type) ?? toInt(key)
      const id = toInt(raw?.id)
      const businessKey = raw?.business_key ?? raw?.businessKey ?? null
      const type = typeNum === 1 ? 'song' : 'keyword'

      const sig = `${type}|${id ?? ''}|${label}`
      if (seen.has(sig)) continue
      seen.add(sig)

      out.push({
        id,
        businessKey: businessKey === null ? null : String(businessKey),
        // 歌曲类建议的 business_key 与详情页 /music/<id> 同源（待详情页实现后验证）
        musicId: toInt(businessKey),
        type,
        label,
        // 建议文案是站点截断过的（结尾 "..."），且常带「歌名-出处 演唱」的长尾巴，这里给出更适合直接搜索的关键词
        searchKeyword: toSearchKeyword(label, type)
      })
    }
  }

  return out
}

function toSearchKeyword(label, type) {
  const base = stripNoise(label)
  if (type !== 'song') return base

  const head = base.split(/\s*[-—–]\s*/)[0]
  return head && head.length >= 2 ? normalize(head) : base
}

/* ============ 一·二、猜你想找 ============ */

/**
 * 搜索结果下方的「猜你想找」。
 * @returns {Promise<Array<{ id: number|null, musicId: number|null, label: string, searchKeyword: string, type: 'song' }>>}
 */
export async function guessMusics(keyword, limit = 6) {
  const kw = stripNoise(keyword)
  if (!kw) return []

  const { text } = await request(GUESS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Origin: BASE,
      Referer: `${BASE}/s/${encodeURIComponent(kw)}`
    },
    body: formBody({ keyword: kw }),
    timeout: 8000
  })

  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('猜你想找接口返回了非 JSON 内容')
  }

  return parseGuess(json, limit)
}

function parseGuess(json, limit) {
  // 兼容 data 为数组 / { data: [...] } / 直接是数组三种落点
  let raw = json?.data
  if (!Array.isArray(raw)) raw = Array.isArray(json?.data?.data) ? json.data.data : []
  if (!Array.isArray(raw)) raw = Array.isArray(json) ? json : []

  const out = []
  const seen = new Set()

  for (const item of raw) {
    const label = clean(item?.keyword ?? item?.name ?? item?.title ?? item?.label ?? '')
    if (!label) continue

    // business_key 即详情页 /music/<id> 的 id；缺失时退回 id
    const musicId = toInt(item?.business_key ?? item?.businessKey) ?? toInt(item?.id)
    const sig = `${musicId ?? ''}|${label}`
    if (seen.has(sig)) continue
    seen.add(sig)

    out.push({
      id: toInt(item?.id),
      musicId,
      type: 'song',
      label,
      searchKeyword: guessSearchKeyword(label)
    })
  }

  return out.slice(0, limit)
}

// 「歌名 歌手A&歌手B…」结构：取首个空格前的歌名，长文案直接搜是搜不到的
function guessSearchKeyword(label) {
  const base = stripNoise(label)
  const head = base.split(/\s+/)[0]
  return head && head.length >= 2 ? stripNoise(head) : base
}

// 去掉截断省略号（"..." / "…"）与零宽字符，收敛空白
function stripNoise(str) {
  return normalize(
    String(str ?? '')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/[.．]{2,}\s*$|[….]+$/g, '')
  )
}

/* ============ 二、搜索结果（HTML 解析） ============ */

/**
 * @returns {Promise<{ keyword: string, usedKeyword: string, notFound: boolean, tried: string[], total: number|null, list: Array<{ id: number|null, title: string, artist: string }> }>}
 */
export async function searchSongs(keyword) {
  const kw = stripNoise(keyword)
  if (!kw) {
    return { keyword: '', usedKeyword: '', notFound: false, tried: [], total: 0, list: [] }
  }

  const tried = []
  let emptyPage = null

  for (const candidate of keywordVariants(kw)) {
    tried.push(candidate)
    const html = await fetchSearchHtml(candidate)

    // 站点对「无结果」的关键词返回 404 页面，等价于空列表，继续尝试更宽松的关键词
    if (html === null) continue

    const page = parseSearchHtml(html, candidate)
    if (page.list.length) {
      return { ...page, keyword: kw, usedKeyword: candidate, notFound: false, tried }
    }

    // 200 但 0 条：站点确实没收录，不再继续变体
    emptyPage = page
    break
  }

  if (emptyPage) {
    return { ...emptyPage, keyword: kw, usedKeyword: emptyPage.keyword, notFound: false, tried }
  }
  return { keyword: kw, usedKeyword: kw, notFound: true, tried, total: 0, list: [] }
}

async function fetchSearchHtml(kw) {
  try {
    const { text } = await request(`${BASE}/s/${encodeURIComponent(kw)}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: `${BASE}/`
      },
      timeout: 12000
    })
    return text
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

// 通用页面抓取（热门/榜单/排行均为静态 HTML）
async function fetchPage(url) {
  try {
    const { text } = await request(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: `${BASE}/`
      },
      timeout: 12000
    })
    return text
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

export function parseSearchHtml(html, keyword = '') {
  const list = pickList(html)
  const total = pickTotal(html)
  return { keyword, total: total ?? list.length, list }
}

// 无结果时的放宽策略：原词 -> & 换空格 -> 第一个空格分段，最多 3 次请求
function keywordVariants(kw) {
  const out = [kw]
  const push = (value) => {
    const v = stripNoise(value)
    if (v.length >= 2 && !out.includes(v)) out.push(v)
  }

  if (/[&＆]/.test(kw)) push(kw.replace(/[&＆]/g, ' '))

  const segments = kw.split(/\s+/).filter(Boolean)
  if (segments.length > 1) push(segments[0])

  return out.slice(0, 3)
}

// 把 HTML 收敛到「搜索结果卡片」区域，失败则退回全文（由 parse 层保证兜底）
function sliceResultRegion(html) {
  const hrefPos = html.search(/href\s*=\s*["'][^"']*\/music\/\d+/i)
  if (hrefPos === -1) return null

  // 回溯到所属标签的起点：否则会从 <a> 中间切开，导致首条记录解析不到
  let start = hrefPos
  const tagOpen = html.lastIndexOf('<a', hrefPos)
  const nearestTagEnd = html.lastIndexOf('>', hrefPos)
  if (tagOpen !== -1 && tagOpen > nearestTagEnd) start = tagOpen

  const stopMarks = [
    /id=["']guess-section["']/i,
    /id=["']search-notfound-btn["']/i,
    /class=["']card mb-3 guess-music-section/i,
    /<script[^>]*>\s*window\.appData/i,
    /<footer/i
  ]

  let end = html.length
  for (const mark of stopMarks) {
    const m = mark.exec(html)
    if (m && m.index > start) {
      end = Math.min(end, m.index)
    }
  }

  return end > start ? html.slice(start, end) : html.slice(start)
}

function pickTotal(html) {
  const m = /共\s*(\d+)\s*首/.exec(html) || /["']count["']\s*:\s*(\d+)/.exec(html)
  return m ? toInt(m[1]) : null
}

// song-id -> /music/<id>
function pickId(tag = '') {
  const href = /href\s*=\s*["']([^"']*)["']/i.exec(tag)
  if (!href) return null
  const m = /\/music\/(\d+)/i.exec(href[1]) || /\/(\d+)(?:[?#/].*)?$/.exec(href[1])
  return m ? toInt(m[1]) : null
}

const SEPARATORS = [/\s+[-–—]\s+/, /\s*[|｜]\s*/]

function splitTitleArtist(text = '') {
  const raw = normalize(text)
  if (!raw) return ['', '']
  for (const sep of SEPARATORS) {
    const parts = raw.split(sep)
    if (parts.length >= 2) {
      const title = normalize(parts[0])
      const artist = normalize(parts.slice(1).join(' '))
      if (title) return [title, artist]
    }
  }
  return [raw, '']
}

/**
 * 多层兜底解析：区域 -> 全文，每层再走「结构化 -> title 属性 -> 链接文本 -> 松散配对」
 */
function pickList(html) {
  const region = sliceResultRegion(html)
  const candidates = region ? [region, html] : [html]

  for (const scope of candidates) {
    let list = extractByAnchors(scope)
    if (!list.length) list = extractLoose(scope)
    if (list.length) return list
  }
  return []
}

function finalizeItem(id, title, artist) {
  let name = normalize(title)
  let singer = normalize(artist)

  if (!name && singer) {
    const [t, a] = splitTitleArtist(singer)
    name = t
    singer = a
  } else if (name && !singer) {
    const [t, a] = splitTitleArtist(name)
    name = t
    singer = a
  }

  // 标题里粘连了「歌名 - 歌手」而被整体塞进一个字段时再拆一次
  if (name && singer && name.includes(' - ')) {
    const [t, a] = splitTitleArtist(name)
    if (a) {
      singer = `${normalize(a)} ${singer}`.trim()
      name = t
    }
  }

  if (!name) return null
  if (name === singer) singer = ''
  if (!id && !name) return null

  return { id: id ?? null, title: name, artist: singer }
}

function extractByAnchors(scope) {
  const anchors = []
  const anchorRe = /<a\b[^>]*>/gi
  let m
  while ((m = anchorRe.exec(scope)) !== null) {
    const id = pickId(m[0])
    if (id !== null) anchors.push({ index: m.index, tag: m[0], id })
  }
  if (!anchors.length) return []

  const items = []
  const seenId = new Set()

  for (let i = 0; i < anchors.length; i++) {
    const { index, tag, id } = anchors[i]
    const start = index
    const end = i + 1 < anchors.length ? anchors[i + 1].index : Math.min(scope.length, start + 3000)
    const block = scope.slice(start, end)

    if (seenId.has(id)) continue

    // L1：站点当前的强势特征（标题 span / 歌手 small）
    let title = clean(firstMatch(/<span class="text-primary[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block))
    let artist = clean(firstMatch(/<small class="text-jade[^"]*"[^>]*>([\s\S]*?)<\/small>/i, block))

    // L2：anchor 自身的 title 属性
    if (!title) {
      const attr = firstMatch(/\btitle\s*=\s*["']([^"']*)["']/i, tag)
      if (attr) [title, artist] = splitTitleArtist(clean(attr))
    }

    // L3：结构化标签降级（任意 span / small）
    if (!title) title = clean(firstMatch(/<span\b[^>]*>([\s\S]*?)<\/span>/i, block))
    if (!artist) artist = clean(firstMatch(/<small\b[^>]*>([\s\S]*?)<\/small>/i, block))

    // L4：<a> 内部纯文本
    if (!title && !artist) {
      const inner = firstMatch(
        /<a\b[^>]*href\s*=\s*["'][^"']*\/music\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        block
      )
      if (inner) [title, artist] = splitTitleArtist(clean(inner))
    }

    const item = finalizeItem(id, title, artist)
    if (!item) continue

    seenId.add(id)
    items.push(item)
  }

  return items
}

function extractLoose(scope) {
  // 完全拿不到 <a href="/music/id"> 时的最后手段：分别收集标题/歌手再按序配对
  const titles = collect(/<span class="text-primary[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, scope)
  const artists = collect(/<small class="text-jade[^"]*"[^>]*>([\s\S]*?)<\/small>/gi, scope)

  const items = []
  const len = Math.max(titles.length, artists.length)
  for (let i = 0; i < len; i++) {
    const item = finalizeItem(null, titles[i] || '', artists[i] || '')
    if (item) items.push(item)
  }
  return dedupe(items)
}

function collect(re, scope) {
  const out = []
  for (const m of String(scope).matchAll(re)) {
    const value = clean(m[1])
    if (value) out.push(value)
  }
  return out
}

function dedupe(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const sig = `${item.title}::${item.artist}`
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(item)
  }
  return out
}

/* ============ 二·二、热门推荐 / 排行榜（静态 HTML） ============ */

// 分页信息：当前/总页写在 <b>2</b> / 5 里；下一页存在 rel="next" 的 <a> 时表示还有下一页
function parsePager(html) {
  const m = /<b>\s*(\d+)\s*<\/b>\s*\/\s*(\d+)/.exec(html)
  const current = m ? Number(m[1]) : 1
  const total = m ? Number(m[2]) : 1
  const hasNext = current < total
  return { current, total, hasNext }
}

/**
 * 热门推荐：/hot-music?page=N，歌曲列表（同搜索结果结构）
 * @returns {Promise<{ list, current, total, hasNext }>}
 */
export async function hotMusic(page = 1) {
  const html = await fetchPage(`${BASE}/hot-music?page=${page}`)
  if (html === null) return { list: [], current: page, total: page, hasNext: false }
  const info = parsePager(html)
  const parsed = parseSearchHtml(html, '')
  return { ...info, list: parsed.list.map((i) => ({ ...i, musicId: i.id ?? null })) }
}

/**
 * 排行榜：周搜索榜 / 周下载榜，支持 ?page=N
 * - week-download：歌曲列表（点击播放）
 * - week-search：搜索词排行（点击跳转到搜索）
 * @param {'week-search'|'week-download'} type
 */
export async function topMusic(type, page = 1) {
  const html = await fetchPage(`${BASE}/top/${type}?page=${page}`)
  if (html === null) return { type, list: [], current: page, total: page, hasNext: false }

  const info = parsePager(html)
  if (type === 'week-search') {
    return { type, ...info, list: parseSearchRank(html) }
  }

  const parsed = parseSearchHtml(html, '')
  return { type, ...info, list: parsed.list.map((i) => ({ ...i, musicId: i.id ?? null })) }
}

// 周搜索榜：每行是一个搜索关键词（/s/<kw>），前面带排名徽标（badge-square 内的数字）
function parseSearchRank(html) {
  const re = /<a\b[^>]*href=["']\/s\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const out = []
  const seen = new Set()
  let m

  while ((m = re.exec(html)) !== null) {
    const kw = decodeURIComponent(m[1].replace(/\+/g, ' '))
    const text = clean(m[2])
    const keyword = text || kw
    if (!keyword) continue

    // 取锚点前最近的一个排名徽标
    const before = html.slice(Math.max(0, m.index - 700), m.index)
    const badges = [...before.matchAll(/badge-square[^>]*>([\s\S]*?)<\/span>/g)]
    const rank = badges.length ? Number(badges[badges.length - 1][1].replace(/\D/g, '')) || null : null

    if (seen.has(keyword)) continue
    seen.add(keyword)
    out.push({ rank, keyword })
  }

  // 兜底：解析不到排名时用顺序号
  return out.map((it, i) => ({ ...it, rank: it.rank ?? i + 1 }))
}

/* ============ 三、搜索热词 ============ */

export async function hotWords(limit = 20) {
  const url = `${HOT_API}?key=&httpsStatus=1&reqId=${newReqId()}&plat=web_www&from=`

  const json = await requestJson(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://kuwo.cn/'
    },
    timeout: 8000
  })

  const raw = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
  return raw
    .map((item) => (typeof item === 'string' ? item : item?.key ?? item?.keyword ?? item?.word ?? ''))
    .map((v) => normalize(v))
    .filter(Boolean)
    .slice(0, limit)
}
