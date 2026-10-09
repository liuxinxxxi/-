/**
 * AI 产品经理知识一览 - 爬虫代理路由
 *  POST /api/articles/crawl  触发一次爬取，返回标准化文章数组
 *
 * 数据来源（4 站点 × 5 条 = 目标 20 条，单站点失败不影响其余）：
 * - 掘金：公开 JSON 搜索 API（最稳定）
 * - 人人都是产品经理：HTML 抓取首页/热门
 * - InfoQ：HTML 抓取 AI 频道
 * - CSDN：HTML 抓取 AI/产品分类页
 *
 * 反爬策略：浏览器 UA 伪装、请求间 200-500ms 限速、超时 12s、单站点 try/catch 隔离。
 * 选择器随站点改版可能失效，stats 字段会标注每站点实际命中数与错误信息。
 */
import { Router } from 'express'
import * as cheerio from 'cheerio'

const router = Router()

/** AI 产品经理相关性关键词（宽匹配，标题或摘要命中其一即可） */
const PM_KEYWORDS = [
  'AI', '人工智能', '大模型', 'LLM', 'AIGC', 'ChatGPT', 'GPT', 'Agent', 'RAG',
  '提示词', 'prompt', '智能体', '多模态', '向量', 'embedding',
  '产品经理', '产品设计', '用户增长', '增长', '商业化', 'SaaS', 'toB', 'B端',
  '数据分析', '用户研究', 'A/B', '留存', '转化', '获客',
  '创业', '融资', 'MVP', 'PMF', 'OKR',
]

/** 浏览器 UA（伪装，避免被简单 UA 过滤拦截） */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 单站点目标条数 */
const PER_SOURCE_LIMIT = 5

/** 通用 HTML 抓取：返回文本或抛错 */
async function fetchHtml(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.text()
  } finally {
    clearTimeout(timer)
  }
}

/** 简单限速（毫秒） */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 关键词相关性过滤：标题或摘要命中任一关键词即保留 */
function isRelevant(title: string, summary: string): boolean {
  const text = `${title} ${summary}`.toLowerCase()
  return PM_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()))
}

/** 阅读量解析：支持 "1.2万"、"1234 阅读"、"1.2k" 等格式 */
function parseViewCount(raw: string | undefined): number {
  if (!raw) return 0
  const s = raw.replace(/[,，\s]/g, '').trim()
  if (!s) return 0
  const wan = s.match(/([\d.]+)\s*万/i)
  if (wan) return Math.round(parseFloat(wan[1]) * 10000)
  const k = s.match(/([\d.]+)\s*k/i)
  if (k) return Math.round(parseFloat(k[1]) * 1000)
  const n = parseInt(s.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

/** 截断摘要到指定长度 */
function truncate(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

interface RawArticle {
  title: string
  summary: string
  sourceUrl: string
  publishedAt: string
  viewCount: number
}

/* ---------------- 掘金：JSON 搜索 API ---------------- */

interface JuejinArticleInfo {
  article_id?: string
  title?: string
  brief?: string
  view_count?: number
  digg_count?: number
  link_url?: string
  publish_time?: number
}

interface JuejinSearchItem {
  article_id?: string
  article_info?: JuejinArticleInfo
}

async function crawlJuejin(): Promise<RawArticle[]> {
  // 掘金搜索 API（公开、无需鉴权）
  const keywords = ['AI产品经理', '大模型应用', 'AIGC产品', 'LLM Agent']
  const all: RawArticle[] = []

  for (const kw of keywords) {
    if (all.length >= PER_SOURCE_LIMIT * 4) break
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)
      try {
        const resp = await fetch('https://api.juejin.cn/content_api/v1/content/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': BROWSER_UA,
            Origin: 'https://juejin.cn',
            Referer: 'https://juejin.cn/',
          },
          body: JSON.stringify({
            keyword: kw,
            sort_type: 0, // 0=综合排序
            cursor: '0',
            limit: 20,
            version: 1,
          }),
          signal: controller.signal,
        })
        if (!resp.ok) continue
        const data = (await resp.json()) as { data?: JuejinSearchItem[] }
        const items = data.data ?? []
        for (const item of items) {
          const info = item.article_info
          if (!info?.title || !info.article_id) continue
          const title = info.title.trim()
          const summary = info.brief?.trim() ?? ''
          if (!isRelevant(title, summary)) continue
          const url = info.link_url
            ? info.link_url.startsWith('http')
              ? info.link_url
              : `https://juejin.cn${info.link_url}`
            : `https://juejin.cn/post/${info.article_id}`
          const publishedAt = info.publish_time
            ? new Date(info.publish_time * 1000).toISOString().slice(0, 10)
            : ''
          all.push({
            title,
            summary: truncate(summary, 120),
            sourceUrl: url,
            publishedAt,
            viewCount: info.view_count ?? 0,
          })
        }
      } finally {
        clearTimeout(timer)
      }
      await sleep(300)
    } catch {
      // 单个关键词失败，继续下一个
    }
  }

  // 去重 + 按阅读量倒序取前 N
  const dedup = new Map<string, RawArticle>()
  for (const a of all) {
    if (!dedup.has(a.sourceUrl)) dedup.set(a.sourceUrl, a)
  }
  return Array.from(dedup.values())
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, PER_SOURCE_LIMIT)
}

/* ---------------- 人人都是产品经理：HTML 抓取 ---------------- */

async function crawlWoshipm(): Promise<RawArticle[]> {
  const html = await fetchHtml('https://www.woshipm.com/')
  const $ = cheerio.load(html)
  const all: RawArticle[] = []

  // 文章列表项：尝试多种选择器以应对改版
  $('article, .post-item, .article-item, .list-item').each((_i, el) => {
    if (all.length >= PER_SOURCE_LIMIT * 2) return false
    const $el = $(el)
    // 标题与链接
    const $link = $el.find('a').filter((_j, a) => {
      const href = $(a).attr('href') ?? ''
      return /woshipm\.com\/[^/]+\/\d+/.test(href) || /\/\d{5,}/.test(href)
    }).first()
    const title = $link.text().trim() || $el.find('h2, h3, .title').first().text().trim()
    const href = $link.attr('href') ?? ''
    if (!title || !href) return
    const url = href.startsWith('http') ? href : `https://www.woshipm.com${href}`
    // 摘要
    const summary = $el.find('.excerpt, .desc, .summary, p').first().text().trim()
    // 阅读量
    const viewText = $el.find('.views, .view-count, .meta').text().trim()
    const viewCount = parseViewCount(viewText)
    if (!isRelevant(title, summary)) return
    all.push({
      title: truncate(title, 80),
      summary: truncate(summary, 120),
      sourceUrl: url,
      publishedAt: '',
      viewCount,
    })
  })

  // 兜底：如果上面选择器没命中，尝试抓取所有指向文章的链接
  if (all.length === 0) {
    $('a').each((_i, el) => {
      if (all.length >= PER_SOURCE_LIMIT * 2) return false
      const href = $(el).attr('href') ?? ''
      if (!/woshipm\.com\/[^/]+\/\d{6,}/.test(href)) return
      const title = $(el).text().trim()
      if (!title || title.length < 8 || !isRelevant(title, '')) return
      const url = href.startsWith('http') ? href : `https://www.woshipm.com${href}`
      all.push({ title: truncate(title, 80), summary: '', sourceUrl: url, publishedAt: '', viewCount: 0 })
    })
  }

  return all.sort((a, b) => b.viewCount - a.viewCount).slice(0, PER_SOURCE_LIMIT)
}

/* ---------------- InfoQ：HTML 抓取 AI 频道 ---------------- */

async function crawlInfoq(): Promise<RawArticle[]> {
  const html = await fetchHtml('https://www.infoq.cn/')
  const $ = cheerio.load(html)
  const all: RawArticle[] = []

  // InfoQ 首页有文章卡片；尝试多种选择器
  $('.article-item, .list-item, article, .card').each((_i, el) => {
    if (all.length >= PER_SOURCE_LIMIT * 2) return false
    const $el = $(el)
    const $link = $el.find('a').first()
    const title = $el.find('.title, h2, h3, a').first().text().trim()
    const href = $link.attr('href') ?? ''
    if (!title || !href) return
    const url = href.startsWith('http') ? href : `https://www.infoq.cn${href}`
    const summary = $el.find('.desc, .summary, .brief, p').first().text().trim()
    if (!isRelevant(title, summary)) return
    all.push({
      title: truncate(title, 80),
      summary: truncate(summary, 120),
      sourceUrl: url,
      publishedAt: '',
      viewCount: 0,
    })
  })

  // 兜底：抓取所有指向文章的链接
  if (all.length === 0) {
    $('a').each((_i, el) => {
      if (all.length >= PER_SOURCE_LIMIT * 2) return false
      const href = $(el).attr('href') ?? ''
      if (!/infoq\.cn\/article\//.test(href) && !/\/article\//.test(href)) return
      const title = $(el).text().trim()
      if (!title || title.length < 8 || !isRelevant(title, '')) return
      const url = href.startsWith('http') ? href : `https://www.infoq.cn${href}`
      all.push({ title: truncate(title, 80), summary: '', sourceUrl: url, publishedAt: '', viewCount: 0 })
    })
  }

  return all.slice(0, PER_SOURCE_LIMIT)
}

/* ---------------- CSDN：HTML 抓取 AI/产品分类 ---------------- */

async function crawlCsdn(): Promise<RawArticle[]> {
  // CSDN 导航页有热门文章列表
  const html = await fetchHtml('https://blog.csdn.net/nav/ai')
  const $ = cheerio.load(html)
  const all: RawArticle[] = []

  $('.blog-list-box, .list-item, article, .item').each((_i, el) => {
    if (all.length >= PER_SOURCE_LIMIT * 2) return false
    const $el = $(el)
    const $link = $el.find('a').first()
    const title = $el.find('.title, .blog-title, h4, a').first().text().trim()
    const href = $link.attr('href') ?? $el.find('a[href*="blog.csdn.net"]').first().attr('href') ?? ''
    if (!title || !href) return
    const url = href.startsWith('http') ? href : `https://blog.csdn.net${href}`
    const summary = $el.find('.desc, .summary, .blog-desc, p').first().text().trim()
    const viewText = $el.find('.view, .read-num, .data-nums, .blog-view').first().text().trim()
    const viewCount = parseViewCount(viewText)
    if (!isRelevant(title, summary)) return
    all.push({
      title: truncate(title, 80),
      summary: truncate(summary, 120),
      sourceUrl: url,
      publishedAt: '',
      viewCount,
    })
  })

  // 兜底
  if (all.length === 0) {
    $('a[href*="blog.csdn.net"]').each((_i, el) => {
      if (all.length >= PER_SOURCE_LIMIT * 2) return false
      const href = $(el).attr('href') ?? ''
      const title = $(el).text().trim()
      if (!title || title.length < 8 || !isRelevant(title, '')) return
      all.push({ title: truncate(title, 80), summary: '', sourceUrl: href, publishedAt: '', viewCount: 0 })
    })
  }

  return all.sort((a, b) => b.viewCount - a.viewCount).slice(0, PER_SOURCE_LIMIT)
}

/* ---------------- 路由：POST /api/articles/crawl ---------------- */

type SourceKey = 'juejin' | 'woshipm' | 'infoq' | 'csdn'

const SOURCE_NAMES: Record<SourceKey, string> = {
  juejin: '掘金',
  woshipm: '人人都是产品经理',
  infoq: 'InfoQ',
  csdn: 'CSDN',
}

/* ---------------- 按关键词搜索（竞品跟踪用） ---------------- */

/** 关键词匹配：标题或摘要包含关键词即命中 */
function matchKeyword(title: string, summary: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return false
  const text = `${title} ${summary}`.toLowerCase()
  return text.includes(kw)
}

/** 掘金：热门推荐流 API 拉一批，本地按关键词过滤 */
async function searchJuejin(keyword: string, limit: number): Promise<RawArticle[]> {
  const all: RawArticle[] = []
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const resp = await fetch('https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': BROWSER_UA,
          Origin: 'https://juejin.cn',
          Referer: 'https://juejin.cn/',
        },
        body: JSON.stringify({
          id_type: 2,
          client_type: 2608,
          sort_type: 200, // 热门
          cursor: '0',
          limit: 50, // 多拉一些再过滤
        }),
        signal: controller.signal,
      })
      if (!resp.ok) return []
      const data = (await resp.json()) as {
        data?: Array<{
          item_info?: {
            article_info?: {
              article_id?: string
              title?: string
              brief?: string
              view_count?: number
              publish_time?: number
            }
            tags?: Array<{ tag_name?: string }>
          }
        }>
      }
      for (const item of data.data ?? []) {
        const info = item.item_info?.article_info
        if (!info?.title || !info.article_id) continue
        const title = info.title.trim()
        const summary = info.brief?.trim() ?? ''
        const tags = item.item_info?.tags?.map((t) => t.tag_name ?? '').join(' ') ?? ''
        // 标题、摘要、标签任一命中关键词即保留
        if (!matchKeyword(title, summary + ' ' + tags, keyword)) continue
        all.push({
          title,
          summary: truncate(summary, 120),
          sourceUrl: `https://juejin.cn/post/${info.article_id}`,
          publishedAt: info.publish_time
            ? new Date(info.publish_time * 1000).toISOString().slice(0, 10)
            : '',
          viewCount: info.view_count ?? 0,
        })
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    // 失败返回空
  }
  return all.sort((a, b) => b.viewCount - a.viewCount).slice(0, limit)
}

/** 人人都是产品经理：首页文章列表 HTML 抓取，本地按关键词过滤 */
async function searchWoshipm(keyword: string, limit: number): Promise<RawArticle[]> {
  try {
    const html = await fetchHtml('https://www.woshipm.com/')
    const $ = cheerio.load(html)
    const all: RawArticle[] = []
    // 首页文章链接格式：https://www.woshipm.com/{频道}/{id}.html
    $('a[href*=".html"]').each((_i, el) => {
      if (all.length >= limit * 3) return false
      const href = $(el).attr('href') ?? ''
      if (!/woshipm\.com\/[^/]+\/\d+\.html/.test(href)) return
      const title = $(el).text().trim()
      if (!title || title.length < 8) return
      if (!matchKeyword(title, '', keyword)) return
      all.push({
        title: truncate(title, 80),
        summary: '',
        sourceUrl: href,
        publishedAt: '',
        viewCount: 0,
      })
    })
    return all.slice(0, limit)
  } catch {
    return []
  }
}

/** InfoQ：首页文章列表 HTML 抓取，本地按关键词过滤 */
async function searchInfoq(keyword: string, limit: number): Promise<RawArticle[]> {
  try {
    const html = await fetchHtml('https://www.infoq.cn/')
    const $ = cheerio.load(html)
    const all: RawArticle[] = []
    $('a[href*="/article/"]').each((_i, el) => {
      if (all.length >= limit * 3) return false
      const href = $(el).attr('href') ?? ''
      if (!href) return
      const title = $(el).text().trim()
      if (!title || title.length < 8) return
      if (!matchKeyword(title, '', keyword)) return
      const url = href.startsWith('http') ? href : `https://www.infoq.cn${href}`
      all.push({
        title: truncate(title, 80),
        summary: '',
        sourceUrl: url,
        publishedAt: '',
        viewCount: 0,
      })
    })
    return all.slice(0, limit)
  } catch {
    return []
  }
}

/** CSDN：热门榜单 API，本地按关键词过滤 */
async function searchCsdn(keyword: string, limit: number): Promise<RawArticle[]> {
  try {
    const resp = await fetch('https://blog.csdn.net/phoenix/web/blog/hot-rank?page=0&pageSize=50&child_channel=', {
      headers: { 'User-Agent': BROWSER_UA },
    })
    if (!resp.ok) return []
    const data = (await resp.json()) as {
      data?: Array<{
        articleTitle?: string
        articleDetailUrl?: string
        nickName?: string
        hotRankScore?: number
      }>
    }
    const all: RawArticle[] = []
    for (const item of data.data ?? []) {
      if (!item.articleTitle || !item.articleDetailUrl) continue
      if (!matchKeyword(item.articleTitle, '', keyword)) continue
      all.push({
        title: truncate(item.articleTitle, 80),
        summary: '',
        sourceUrl: item.articleDetailUrl,
        publishedAt: '',
        viewCount: 0, // hot-rank 接口没有阅读量，hotRankScore 是热度分
      })
    }
    return all.slice(0, limit)
  } catch {
    return []
  }
}

/** POST /api/articles/search  按关键词搜索 4 站点相关文章 */
router.post('/search', async (req, res) => {
  const keyword = typeof req.body?.keyword === 'string' ? req.body.keyword.trim() : ''
  if (!keyword) {
    res.status(400).json({ error: 'keyword 不能为空' })
    return
  }
  const limit = typeof req.body?.limit === 'number' && req.body.limit > 0 ? Math.min(req.body.limit, 10) : 5

  const searchers: Array<{ source: SourceKey; fn: () => Promise<RawArticle[]> }> = [
    { source: 'juejin', fn: () => searchJuejin(keyword, limit) },
    { source: 'woshipm', fn: () => searchWoshipm(keyword, limit) },
    { source: 'infoq', fn: () => searchInfoq(keyword, limit) },
    { source: 'csdn', fn: () => searchCsdn(keyword, limit) },
  ]

  const results = await Promise.allSettled(searchers.map(async (s) => {
    const items = await s.fn()
    return { source: s.source, items }
  }))

  const articles: Array<{
    source: SourceKey
    sourceName: string
    sourceUrl: string
    title: string
    summary: string
    publishedAt: string
    viewCount: number
  }> = []
  const stats: Array<{ source: SourceKey; count: number; error?: string }> = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const s = searchers[i]
    if (r.status === 'fulfilled') {
      for (const item of r.value.items) {
        articles.push({
          source: r.value.source,
          sourceName: SOURCE_NAMES[r.value.source],
          ...item,
        })
      }
      stats.push({ source: r.value.source, count: r.value.items.length })
    } else {
      const err = r.reason instanceof Error ? r.reason.message : String(r.reason)
      stats.push({ source: s.source, count: 0, error: err })
    }
  }

  // 4 站点命中率太低时，自动追加 Bing 全网搜索结果兜底
  if (articles.length < 5) {
    try {
      const bingResults = await searchBing(keyword, 10 - articles.length)
      for (const item of bingResults) {
        articles.push({
          source: 'bing' as SourceKey,
          sourceName: 'Bing 搜索',
          ...item,
        })
      }
      stats.push({ source: 'bing' as SourceKey, count: bingResults.length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stats.push({ source: 'bing' as SourceKey, count: 0, error: msg })
    }
  }

  res.json({
    keyword,
    articles: articles.sort((a, b) => b.viewCount - a.viewCount),
    stats,
    crawledAt: Date.now(),
  })
})

/** Bing 全网搜索兜底：当 4 站点命中率太低时补充 */
async function searchBing(keyword: string, limit: number): Promise<RawArticle[]> {
  // 加 AI 后缀提高与科技/产品相关的搜索质量
  const query = `${keyword} AI`
  const resp = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}&setlang=zh-CN`,
    {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    },
  )
  if (!resp.ok) return []
  const html = await resp.text()
  const $ = cheerio.load(html)
  const all: RawArticle[] = []
  const kw = keyword.toLowerCase()
  $('li.b_algo').each((_i, el) => {
    if (all.length >= limit) return false
    const title = $(el).find('h2 a').text().trim()
    const href = $(el).find('h2 a').attr('href') ?? ''
    if (!title || !href) return
    // 过滤掉 Bing 自家链接
    if (/bing\.com|microsoft\.com/.test(href)) return
    const summary = $(el).find('.b_caption p, .b_snippet').first().text().trim()
    // 标题或摘要包含关键词即保留（允许 Bing 分词后匹配到部分内容）
    const text = `${title} ${summary}`.toLowerCase()
    if (!text.includes(kw)) return
    all.push({
      title: truncate(title, 80),
      summary: truncate(summary, 120),
      sourceUrl: href,
      publishedAt: '',
      viewCount: 0,
    })
  })
  return all
}

router.post('/crawl', async (_req, res) => {
  const crawlers: Array<{ source: SourceKey; fn: () => Promise<RawArticle[]> }> = [
    { source: 'juejin', fn: crawlJuejin },
    { source: 'woshipm', fn: crawlWoshipm },
    { source: 'infoq', fn: crawlInfoq },
    { source: 'csdn', fn: crawlCsdn },
  ]

  const results = await Promise.allSettled(crawlers.map(async (c) => {
    const items = await c.fn()
    return { source: c.source, items }
  }))

  const articles: Array<{
    source: SourceKey
    sourceName: string
    sourceUrl: string
    title: string
    summary: string
    publishedAt: string
    viewCount: number
  }> = []
  const stats: Array<{ source: SourceKey; count: number; error?: string }> = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const c = crawlers[i]
    if (r.status === 'fulfilled') {
      for (const item of r.value.items) {
        articles.push({
          source: r.value.source,
          sourceName: SOURCE_NAMES[r.value.source],
          ...item,
        })
      }
      stats.push({ source: r.value.source, count: r.value.items.length })
    } else {
      const err = r.reason instanceof Error ? r.reason.message : String(r.reason)
      stats.push({ source: c.source, count: 0, error: err })
    }
  }

  res.json({
    articles,
    stats,
    crawledAt: Date.now(),
  })
})

export default router
