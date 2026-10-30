const BASE = 'https://www.gequbao.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const kws = [
  '月声尽，心灯明 鸣潮先约电台&jixwang',
  '月声尽，心灯明 鸣潮先约电台',
  '鸣潮先约电台&jixwang',
  '晴天&周杰伦',
  '晴天 周杰伦',
  'a&b',
  '月声尽，心灯明 jixwang',
  '月声尽，心灯明&鸣潮'
]

for (const kw of kws) {
  const url = `${BASE}/s/${encodeURIComponent(kw)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    })
    const text = await res.text()
    const count = /共\s*(\d+)\s*首/.exec(text)
    console.log(String(res.status).padEnd(4), '共' + (count?.[1] ?? '-').padEnd(3), kw)
  } catch (e) {
    console.log('ERR ', kw, e.message)
  }
}
