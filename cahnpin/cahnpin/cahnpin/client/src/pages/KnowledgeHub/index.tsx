/**
 * AI 产品经理知识一览（阶段 8）
 * 手动触发爬取：服务端从掘金 / 人人都是产品经理 / InfoQ / CSDN 抓取 20 篇高阅读量文章，
 * 本地 IndexedDB 持久化；支持按分类筛选、标记已读/收藏、自定义分类管理。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  RefreshCw,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Star,
  StarOff,
  Tag,
  Settings2,
  X,
  Plus,
  Trash2,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import {
  deleteArticlesByDate,
  deleteArticle,
  getAllArticles,
  getAllCategories,
  getArticlesByDate,
  putArticle,
  putArticles,
  putCategory,
  deleteCategory,
} from '../../lib/db'
import { request } from '../../lib/api'
import { uid } from '../../lib/format'
import { toast } from '../../stores/uiStore'
import type { Article, ArticleCategory, ArticleSource, CrawlResponse } from '../../types'

/** 本地日期 YYYY-MM-DD */
function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 来源徽章颜色 */
const SOURCE_BADGE: Record<ArticleSource, string> = {
  juejin: 'bg-blue-50 text-blue-600',
  woshipm: 'bg-amber-50 text-amber-600',
  infoq: 'bg-emerald-50 text-emerald-600',
  csdn: 'bg-rose-50 text-rose-500',
}

const CATEGORY_COLORS = [
  'bg-violet-50 text-violet-600',
  'bg-primary-50 text-primary-600',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-600',
  'bg-rose-50 text-rose-500',
  'bg-cyan-50 text-cyan-600',
  'bg-slate-100 text-slate-600',
  'bg-pink-50 text-pink-600',
]

export default function KnowledgeHub() {
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<ArticleCategory[]>([])
  const [activeDate, setActiveDate] = useState<string>(todayStr())
  const [crawlDates, setCrawlDates] = useState<string[]>([])
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([])
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [crawlStats, setCrawlStats] = useState<CrawlResponse['stats'] | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = todayStr()

  // 初始加载：分类 + 文章列表
  useEffect(() => {
    void (async () => {
      const cats = await getAllCategories()
      setCategories(cats)
      const all = await getAllArticles()
      const dates = Array.from(new Set(all.map((a) => a.crawlDate))).sort().reverse()
      setCrawlDates(dates)
      if (dates.length > 0 && !dates.includes(activeDate)) {
        setActiveDate(dates[0])
      }
    })()
  }, [activeDate])

  // 加载当前批次文章
  useEffect(() => {
    void getArticlesByDate(activeDate)
      .then(setArticles)
      .catch(() => {})
  }, [activeDate])

  /** 触发今日爬取 */
  const handleCrawl = useCallback(async () => {
    setCrawling(true)
    setError(null)
    try {
      const resp = await request<CrawlResponse>('/api/articles/crawl', {
        method: 'POST',
      })
      // 同一天重爬：先清空该批次旧数据
      await deleteArticlesByDate(today)
      // 组装 Article 入库
      const now = Date.now()
      const newArticles: Article[] = resp.articles.map((a, i) => ({
        id: uid('art-'),
        source: a.source,
        sourceName: a.sourceName,
        sourceUrl: a.sourceUrl,
        title: a.title,
        summary: a.summary,
        publishedAt: a.publishedAt,
        viewCount: a.viewCount,
        categoryIds: [],
        crawlDate: today,
        crawledAt: now + i,
        read: false,
        favorite: false,
      }))
      await putArticles(newArticles)

      // 刷新列表
      const list = await getArticlesByDate(today)
      setArticles(list)
      setActiveDate(today)
      const all = await getAllArticles()
      const dates = Array.from(new Set(all.map((a) => a.crawlDate))).sort().reverse()
      setCrawlDates(dates)
      setCrawlStats(resp.stats)

      const total = resp.articles.length
      const failedSources = resp.stats.filter((s) => s.count === 0)
      if (total === 0) {
        toast.error('全部站点爬取失败，请稍后重试')
      } else if (failedSources.length > 0) {
        const names = failedSources.map((s) => s.source).join('、')
        toast.success(`已爬取 ${total} 篇（${names} 暂未命中，可能站点改版）`)
      } else {
        toast.success(`已爬取 ${total} 篇文章`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '爬取失败，请重试'
      setError(msg)
      toast.error(msg)
    } finally {
      setCrawling(false)
    }
  }, [today])

  /** 切换文章已读 */
  const toggleRead = useCallback(async (article: Article) => {
    const updated = { ...article, read: !article.read }
    await putArticle(updated)
    setArticles((prev) => prev.map((a) => (a.id === article.id ? updated : a)))
  }, [])

  /** 切换文章收藏 */
  const toggleFavorite = useCallback(async (article: Article) => {
    const updated = { ...article, favorite: !article.favorite }
    await putArticle(updated)
    setArticles((prev) => prev.map((a) => (a.id === article.id ? updated : a)))
  }, [])

  /** 切换文章分类（点击分类 chip 时，把当前文章归入该分类） */
  const assignCategory = useCallback(
    async (article: Article, catId: string) => {
      const ids = new Set(article.categoryIds)
      if (ids.has(catId)) ids.delete(catId)
      else ids.add(catId)
      const updated = { ...article, categoryIds: Array.from(ids) }
      await putArticle(updated)
      setArticles((prev) => prev.map((a) => (a.id === article.id ? updated : a)))
    },
    [],
  )

  /** 删除单篇文章 */
  const handleDeleteArticle = useCallback(async (article: Article) => {
    if (!window.confirm(`确认从列表删除「${article.title.slice(0, 30)}」？`)) return
    await deleteArticle(article.id)
    setArticles((prev) => prev.filter((a) => a.id !== article.id))
    toast.success('已删除')
  }, [])

  /** 切换筛选 chip */
  const toggleFilter = useCallback((catId: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    )
  }, [])

  /** 保存分类变更 */
  const handleSaveCategory = useCallback(async (cat: ArticleCategory) => {
    await putCategory(cat)
    const cats = await getAllCategories()
    setCategories(cats)
  }, [])

  /** 新增分类 */
  const handleAddCategory = useCallback(async () => {
    const maxSort = categories.length > 0 ? Math.max(...categories.map((c) => c.sortOrder)) : 0
    const cat: ArticleCategory = {
      id: uid('cat-'),
      name: '新分类',
      color: CATEGORY_COLORS[(maxSort + 1) % CATEGORY_COLORS.length],
      sortOrder: maxSort + 1,
      createdAt: Date.now(),
      builtIn: false,
    }
    await putCategory(cat)
    const cats = await getAllCategories()
    setCategories(cats)
    toast.success('已新增分类')
  }, [categories])

  /** 删除分类 */
  const handleDeleteCategory = useCallback(
    async (cat: ArticleCategory) => {
      if (cat.builtIn) {
        toast.error('系统默认分类不可删除，可改名改色')
        return
      }
      if (!window.confirm(`确认删除分类「${cat.name}」？文章不会被删除。`)) return
      await deleteCategory(cat.id)
      const cats = await getAllCategories()
      setCategories(cats)
      // 从筛选中移除
      setSelectedCatIds((prev) => prev.filter((id) => id !== cat.id))
      toast.success('已删除分类')
    },
    [],
  )

  // 筛选后的文章
  const filteredArticles = useMemo(() => {
    let list = articles
    if (selectedCatIds.length > 0) {
      list = list.filter((a) => a.categoryIds.some((id) => selectedCatIds.includes(id)))
    }
    if (showFavOnly) {
      list = list.filter((a) => a.favorite)
    }
    return list
  }, [articles, selectedCatIds, showFavOnly])

  const active = articles.length > 0
  const unreadCount = articles.filter((a) => !a.read).length

  return (
    <div className="page-container">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">AI 产品经理知识一览</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            每日爬取掘金 / 人人都是产品经理 / InfoQ / CSDN 高阅读量文章，按分类整理学习
          </p>
        </div>
        <button
          onClick={handleCrawl}
          disabled={crawling}
          className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-60"
        >
          {crawling ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              正在爬取（约 10-20 秒）…
            </>
          ) : crawlDates.includes(today) ? (
            <>
              <RefreshCw size={15} />
              重新爬取今日
            </>
          ) : (
            <>
              <BookOpen size={15} />
              今日爬取
            </>
          )}
        </button>
      </div>

      {/* 批次切换 */}
      {crawlDates.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <CalendarDays size={15} className="text-slate-300" />
          {crawlDates.map((d) => (
            <button
              key={d}
              onClick={() => setActiveDate(d)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
                activeDate === d
                  ? 'bg-primary-500 font-medium text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-primary-200 hover:text-primary-600'
              }`}
            >
              {d}
              {d === today && ' · 今天'}
            </button>
          ))}
        </div>
      )}

      {/* 爬取统计 */}
      {crawlStats && crawlStats.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-slate-400">来源覆盖：</span>
          {crawlStats.map((s) => (
            <span
              key={s.source}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                s.count > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
              }`}
              title={s.error ?? ''}
            >
              {s.count > 0 ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
              {s.source} {s.count}
              {s.error ? `（${s.error.slice(0, 40)}）` : ''}
            </span>
          ))}
        </div>
      )}

      {/* 分类筛选 + 操作 */}
      {active && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Tag size={14} className="text-slate-300" />
          {categories.map((cat) => {
            const active = selectedCatIds.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => toggleFilter(cat.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] transition-all ${
                  active
                    ? `${cat.color} font-medium ring-2 ring-offset-1 ring-current`
                    : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {cat.name}
              </button>
            )
          })}
          {selectedCatIds.length > 0 && (
            <button
              onClick={() => setSelectedCatIds([])}
              className="text-[12px] text-slate-400 hover:text-slate-600"
            >
              清除筛选
            </button>
          )}
          <span className="mx-1 text-slate-200">|</span>
          <button
            onClick={() => setShowFavOnly((v) => !v)}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] transition-colors ${
              showFavOnly
                ? 'bg-amber-50 text-amber-600'
                : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            }`}
          >
            {showFavOnly ? <Star size={12} /> : <StarOff size={12} />}
            仅看收藏
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-500 transition-colors hover:border-primary-200 hover:text-primary-600"
          >
            <Settings2 size={12} />
            管理类型
          </button>
        </div>
      )}

      {/* 免责条 */}
      {active && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-[12.5px] leading-relaxed text-amber-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            文章由爬虫从公开网页抓取，<strong>选择器随站点改版可能失效</strong>，部分来源命中数为 0 属正常现象。阅读量与发布时间以原站为准，缺失时显示为 0。
          </span>
        </div>
      )}

      {/* 主区域 */}
      {crawling && !active ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <Loader2 size={26} className="animate-spin text-primary-400" />
          <p className="mt-4 text-sm text-slate-500">正在从 4 个站点抓取高阅读量文章…</p>
          <p className="mt-1 text-[12px] text-slate-300">掘金 / 人人都是产品经理 / InfoQ / CSDN 并行抓取，约 10-20 秒</p>
        </div>
      ) : error && !active ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-sm text-rose-500">{error}</p>
          <button
            onClick={handleCrawl}
            className="mt-4 rounded-xl border border-primary-200 px-4 py-2 text-[13px] text-primary-600 transition-colors hover:bg-primary-50"
          >
            重新爬取
          </button>
        </div>
      ) : active ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[13px] text-slate-400">
              {activeDate} · 共 {articles.length} 篇 · 未读 {unreadCount} ·
              {selectedCatIds.length > 0 || showFavOnly ? ` 筛选后 ${filteredArticles.length} 篇` : ''}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                categories={categories}
                onToggleRead={toggleRead}
                onToggleFavorite={toggleFavorite}
                onAssignCategory={assignCategory}
                onDelete={handleDeleteArticle}
              />
            ))}
          </div>
          {filteredArticles.length === 0 && (
            <div className="mt-10 text-center text-sm text-slate-400">
              当前筛选条件下无文章，试试清除筛选或重新爬取
            </div>
          )}
        </>
      ) : (
        <button
          onClick={handleCrawl}
          disabled={crawling}
          className="mt-8 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-20 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/30"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
            <BookOpen size={26} />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">爬取今日 AI 产品经理文章</p>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            从掘金、人人都是产品经理、InfoQ、CSDN 抓取 20 篇高阅读量文章，按分类整理学习
          </p>
        </button>
      )}

      {/* 分类管理弹窗 */}
      {showCategoryModal && (
        <CategoryModal
          categories={categories}
          onClose={() => setShowCategoryModal(false)}
          onSave={handleSaveCategory}
          onAdd={handleAddCategory}
          onDelete={handleDeleteCategory}
        />
      )}
    </div>
  )
}

/* ---------------- 文章卡片 ---------------- */

interface ArticleCardProps {
  article: Article
  categories: ArticleCategory[]
  onToggleRead: (a: Article) => void
  onToggleFavorite: (a: Article) => void
  onAssignCategory: (a: Article, catId: string) => void
  onDelete: (a: Article) => void
}

function ArticleCard({
  article,
  categories,
  onToggleRead,
  onToggleFavorite,
  onAssignCategory,
  onDelete,
}: ArticleCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover">
      <div className="flex items-start justify-between gap-3">
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-slate-800 transition-colors hover:text-primary-600"
        >
          {article.title}
        </a>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${SOURCE_BADGE[article.source]}`}>
          {article.sourceName}
        </span>
      </div>

      {article.summary && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-slate-600 line-clamp-3">{article.summary}</p>
      )}

      {/* 文章已分类标签 */}
      {article.categoryIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {article.categoryIds.map((id) => {
            const cat = categories.find((c) => c.id === id)
            if (!cat) return null
            return (
              <span
                key={id}
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${cat.color}`}
              >
                {cat.name}
              </span>
            )
          })}
        </div>
      )}

      {/* 快捷归类 */}
      <details className="mt-3 group">
        <summary className="cursor-pointer list-none text-[11.5px] text-slate-400 hover:text-slate-600">
          点击归类到分类…
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const active = article.categoryIds.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => onAssignCategory(article, cat.id)}
                className={`rounded-full px-2.5 py-1 text-[10.5px] transition-all ${
                  active ? `${cat.color} font-medium` : 'border border-slate-200 text-slate-400 hover:border-slate-300'
                }`}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </details>

      <div className="mt-auto flex items-center justify-between pt-4">
        <div className="flex items-center gap-3 text-[11.5px] text-slate-400">
          {article.publishedAt && <span className="tabular-nums">{article.publishedAt}</span>}
          {article.viewCount > 0 && (
            <span className="tabular-nums">阅读 {article.viewCount.toLocaleString()}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleRead(article)}
            className={`rounded-lg p-1.5 transition-colors ${
              article.read ? 'text-primary-500 hover:bg-primary-50' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-500'
            }`}
            title={article.read ? '标记未读' : '标记已读'}
          >
            {article.read ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            onClick={() => onToggleFavorite(article)}
            className={`rounded-lg p-1.5 transition-colors ${
              article.favorite ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-500'
            }`}
            title={article.favorite ? '取消收藏' : '收藏'}
          >
            {article.favorite ? <Star size={14} /> : <StarOff size={14} />}
          </button>
          <button
            onClick={() => onDelete(article)}
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 flex items-center gap-1 rounded-lg p-1.5 text-primary-500 transition-colors hover:bg-primary-50"
            title="打开原文"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </article>
  )
}

/* ---------------- 分类管理弹窗 ---------------- */

interface CategoryModalProps {
  categories: ArticleCategory[]
  onClose: () => void
  onSave: (cat: ArticleCategory) => void
  onAdd: () => void
  onDelete: (cat: ArticleCategory) => void
}

function CategoryModal({ categories, onClose, onSave, onAdd, onDelete }: CategoryModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">管理文章分类</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1.5 text-[12.5px] text-slate-400">
          系统默认分类不可删除，可改名改色；自定义分类可自由增删。新增分类后可在文章卡片上点选归类。
        </p>

        <div className="mt-4 space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <select
                value={cat.color}
                onChange={(e) => onSave({ ...cat, color: e.target.value })}
                className={`h-7 w-7 cursor-pointer rounded-full border border-slate-200 ${cat.color}`}
                title="选择颜色"
              >
                {CATEGORY_COLORS.map((c) => (
                  <option key={c} value={c} className={c}>
                    ●
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={cat.name}
                onChange={(e) => onSave({ ...cat, name: e.target.value })}
                className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-slate-700 hover:border-slate-200 focus:border-primary-300 focus:outline-none"
                placeholder="分类名"
              />
              <span className="text-[11px] text-slate-300">#{cat.sortOrder}</span>
              {cat.builtIn ? (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">默认</span>
              ) : (
                <button
                  onClick={() => onDelete(cat)}
                  className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  title="删除分类"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onAdd}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-[13px] text-slate-500 transition-colors hover:border-primary-300 hover:bg-primary-50/30 hover:text-primary-600"
        >
          <Plus size={15} />
          新增分类
        </button>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-primary-500 px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-primary-600"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
