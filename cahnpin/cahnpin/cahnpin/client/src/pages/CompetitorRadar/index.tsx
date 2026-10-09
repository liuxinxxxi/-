/**
 * 竞品商业洞察跟踪（阶段 6）
 * 左侧竞品列表；右侧事件时间线。
 * 事件两个来源：①联网自动追踪（GLM web_search 检索近一月动态，AI 生成事件+三段洞察）
 * ②手动录入（用户填事件描述，AI 生成商业/AI/应对三段洞察）。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Radar,
  Plus,
  RefreshCw,
  Loader2,
  Trash2,
  ExternalLink,
  ShieldAlert,
  TrendingUp,
  Cpu,
  Compass,
  PencilLine,
  X,
  Globe,
  Search,
  CheckSquare,
  Square,
  CheckCheck,
} from 'lucide-react'
import { chatCompletion } from '../../lib/llm'
import { buildEventInsightMessages, parseEventInsight } from '../../lib/prompts'
import { request } from '../../lib/api'
import {
  deleteCompetitorCascade,
  deleteCompetitorEvent,
  getAllCompetitors,
  getCompetitorEvents,
  putCompetitor,
  putCompetitorEvent,
  putCompetitorEvents,
} from '../../lib/db'
import { searchVerifyUrl, uid } from '../../lib/format'
import { toast } from '../../stores/uiStore'
import type { Competitor, CompetitorEvent, CompetitorEventCategory, CrawledArticle } from '../../types'

const EVENT_CATEGORIES: CompetitorEventCategory[] = ['融资', '产品更新', '战略合作', '政策合规', '人事组织', '其他']

const CATEGORY_STYLE: Record<CompetitorEventCategory, string> = {
  融资: 'bg-amber-50 text-amber-600',
  产品更新: 'bg-primary-50 text-primary-600',
  战略合作: 'bg-emerald-50 text-emerald-600',
  政策合规: 'bg-rose-50 text-rose-500',
  人事组织: 'bg-violet-50 text-violet-600',
  其他: 'bg-slate-100 text-slate-500',
}

export default function CompetitorRadar() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [events, setEvents] = useState<CompetitorEvent[]>([])
  const [tracking, setTracking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  /** 批量选择模式 */
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const active = competitors.find((c) => c.id === activeId) ?? null

  useEffect(() => {
    void getAllCompetitors()
      .then((list) => {
        setCompetitors(list)
        if (list.length > 0) setActiveId(list[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!activeId) {
      setEvents([])
      return
    }
    void getCompetitorEvents(activeId)
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [activeId])

  /** 添加竞品 */
  const handleAdd = useCallback(async (name: string, description: string) => {
    const now = Date.now()
    const competitor: Competitor = { id: uid('cp_'), name, description, createdAt: now, updatedAt: now }
    try {
      await putCompetitor(competitor)
      setCompetitors((prev) => [competitor, ...prev])
      setActiveId(competitor.id)
      setAdding(false)
      toast.success(`已开始跟踪「${name}」，点击"追踪动态"检索近期事件`)
    } catch (err) {
      toast.error(err instanceof Error ? `添加失败：${err.message}` : '添加失败')
    }
  }, [])

  /** 删除竞品（级联删事件） */
  const handleDeleteCompetitor = useCallback(
    async (competitor: Competitor) => {
      if (!window.confirm(`确认删除竞品「${competitor.name}」？其全部事件将一并删除。`)) return
      try {
        await deleteCompetitorCascade(competitor.id)
        setCompetitors((prev) => {
          const next = prev.filter((c) => c.id !== competitor.id)
          if (activeId === competitor.id) setActiveId(next[0]?.id ?? null)
          return next
        })
        toast.success('已删除')
      } catch {
        toast.error('删除失败')
      }
    },
    [activeId],
  )

  /** 爬虫追踪：按竞品名搜索 4 站点相关真实文章 */
  const handleTrack = useCallback(async () => {
    if (!active || tracking) return
    setTracking(true)
    try {
      const resp = await request<{ articles: CrawledArticle[]; stats: Array<{ source: string; count: number; error?: string }> }>(
        '/api/articles/search',
        { method: 'POST', body: JSON.stringify({ keyword: active.name, limit: 5 }) },
      )
      if (resp.articles.length === 0) {
        const failed = resp.stats.filter((s) => s.count === 0).map((s) => s.source).join('、')
        toast.error(
          `全网未搜到「${active.name}」相关文章（${failed || '全部站点'}均无结果），该竞品知名度可能较低，建议手动录入事件`,
        )
        return
      }
      const now = Date.now()
      // 每篇文章存为一条事件，标题用文章标题，摘要用文章摘要，来源用真实链接
      const newEvents: CompetitorEvent[] = resp.articles.map((a) => ({
        id: uid('ev_'),
        competitorId: active.id,
        title: a.title,
        date: a.publishedAt || '',
        category: '其他' as CompetitorEventCategory,
        summary: a.summary,
        businessInsight: '',
        aiInsight: '',
        suggestion: '',
        sourceTitle: a.sourceName,
        sourceUrl: a.sourceUrl,
        origin: 'auto' as const,
        createdAt: now,
        crawlerArticles: resp.articles,
        keyword: active.name,
      }))
      await putCompetitorEvents(newEvents)
      await putCompetitor({ ...active, updatedAt: now })
      setEvents(await getCompetitorEvents(active.id))
      const failed = resp.stats.filter((s) => s.count === 0).map((s) => s.source).join('、')
      toast.success(
        failed
          ? `追踪完成：爬取 ${resp.articles.length} 篇文章（${failed} 暂未命中）`
          : `追踪完成：爬取 ${resp.articles.length} 篇文章`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '追踪失败，请重试')
    } finally {
      setTracking(false)
    }
  }, [active, tracking])

  /** 手动录入事件（AI 生成三段洞察后入库） */
  const handleManualAdd = useCallback(
    async (input: { title: string; date: string; category: CompetitorEventCategory; detail: string }) => {
      if (!active) return
      const insight = parseEventInsight(
        await chatCompletion(
          buildEventInsightMessages({
            competitorName: active.name,
            title: input.title,
            date: input.date,
            category: input.category,
            detail: input.detail,
          }),
        ),
      )
      const event: CompetitorEvent = {
        id: uid('ev_'),
        competitorId: active.id,
        title: input.title,
        date: input.date,
        category: input.category,
        summary: input.detail,
        ...insight,
        origin: 'manual',
        createdAt: Date.now(),
      }
      await putCompetitorEvent(event)
      setEvents(await getCompetitorEvents(active.id))
      setEditing(false)
      toast.success('事件已录入，AI 洞察已生成')
    },
    [active],
  )

  const handleDeleteEvent = useCallback(
    async (event: CompetitorEvent) => {
      if (!window.confirm(`确认删除事件「${event.title}」？`)) return
      await deleteCompetitorEvent(event.id)
      setEvents((prev) => prev.filter((e) => e.id !== event.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(event.id)
        return next
      })
      toast.success('已删除')
    },
    [],
  )

  /** 批量删除 */
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`确认删除选中的 ${selectedIds.size} 条事件？`)) return
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      await deleteCompetitorEvent(id)
    }
    setEvents((prev) => prev.filter((e) => !selectedIds.has(e.id)))
    setSelectedIds(new Set())
    setSelectMode(false)
    toast.success(`已删除 ${ids.length} 条事件`)
  }, [selectedIds])

  /** 切换选择模式 */
  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => {
      if (v) setSelectedIds(new Set()) // 关闭时清空
      return !v
    })
  }, [])

  /** 全选/取消全选 */
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === events.length) return new Set()
      return new Set(events.map((e) => e.id))
    })
  }, [events])

  return (
    <div className="flex h-full">
      {/* 左侧：竞品列表 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/60">
        <div className="border-b border-slate-100 p-3">
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-3 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
          >
            <Plus size={15} />
            添加竞品
          </button>
        </div>

        {adding && <AddCompetitorForm onSubmit={handleAdd} onCancel={() => setAdding(false)} />}

        <div className="flex-1 overflow-y-auto p-2">
          {competitors.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-14 text-center">
              <Radar size={22} className="text-slate-200" />
              <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
                还没有跟踪任何竞品
                <br />
                添加后开始联网追踪
              </p>
            </div>
          ) : (
            competitors.map((c) => (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`group mb-1 cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
                  c.id === activeId ? 'bg-primary-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate text-[13px] ${c.id === activeId ? 'font-medium text-primary-700' : 'text-slate-600'}`}
                    title={c.name}
                  >
                    {c.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDeleteCompetitor(c)
                    }}
                    className="ml-auto hidden shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-500 group-hover:block"
                    title="删除竞品"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-300">{c.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右侧：事件时间线 */}
      {active ? (
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="page-container">
            {/* 头部 */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-slate-800">{active.name}</h1>
                {active.description && (
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">{active.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] text-slate-600 transition-colors hover:border-primary-200 hover:text-primary-600"
                >
                  <PencilLine size={14} />
                  录入事件
                </button>
                <button
                  onClick={handleTrack}
                  disabled={tracking}
                  className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-60"
                >
                  {tracking ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      正在联网追踪（约 30 秒）…
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      追踪动态
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 免责条 */}
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-[12.5px] leading-relaxed text-amber-700">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              <span>
                自动追踪的事件由 AI 联网检索生成，三段洞察为分析师判断；蓝色为原文链接，灰色「搜索核验」为按标题跳转搜索引擎。<strong>事实与数据请人工核验后使用</strong>。
              </span>
            </div>

            {/* 手动录入表单 */}
            {editing && (
              <ManualEventForm
                onSubmit={handleManualAdd}
                onCancel={() => setEditing(false)}
              />
            )}

            {/* 事件流 */}
            {events.length === 0 ? (
              <div className="mt-8 flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center">
                <Radar size={24} className="text-slate-200" />
                <p className="mt-4 text-sm font-medium text-slate-600">暂无事件</p>
                <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">
                  点击「追踪动态」联网检索该竞品近一月重要事件，或「录入事件」手动补充
                </p>
              </div>
            ) : (
              <>
                {/* 批量操作栏 */}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={toggleSelectMode}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] transition-colors ${
                      selectMode
                        ? 'bg-primary-50 text-primary-600 border border-primary-200'
                        : 'border border-slate-200 bg-white text-slate-500 hover:border-primary-200 hover:text-primary-600'
                    }`}
                  >
                    {selectMode ? <CheckCheck size={14} /> : <CheckSquare size={14} />}
                    {selectMode ? `已选 ${selectedIds.size} 条` : '批量选择'}
                  </button>
                  {selectMode && (
                    <>
                      <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] text-slate-500 transition-colors hover:border-primary-200 hover:text-primary-600"
                      >
                        <Square size={13} />
                        {selectedIds.size === events.length ? '取消全选' : '全选'}
                      </button>
                      <button
                        onClick={handleBatchDelete}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                        删除选中 ({selectedIds.size})
                      </button>
                    </>
                  )}
                </div>

                <div className="mt-3 space-y-4">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onDelete={() => void handleDeleteEvent(event)}
                      selectable={selectMode}
                      selected={selectedIds.has(event.id)}
                      onToggleSelect={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(event.id)) next.delete(event.id)
                          else next.add(event.id)
                          return next
                        })
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
            <Radar size={26} />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">竞品商业洞察跟踪</p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">
            围绕竞品事件，从商业与 AI 双视角洞察
            <br />
            点击左上角「添加竞品」开始
          </p>
        </div>
      )}
    </div>
  )
}

/** 添加竞品内联表单 */
function AddCompetitorForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const valid = name.trim().length >= 2

  return (
    <div className="border-b border-slate-100 p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="竞品名称，如：Cursor"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="简介（可选）：赛道与产品定位，帮助检索聚焦"
        className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => valid && onSubmit(name.trim(), description.trim())}
          disabled={!valid}
          className="flex-1 rounded-lg bg-primary-500 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
        >
          开始跟踪
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] text-slate-500 transition-colors hover:bg-slate-50"
        >
          取消
        </button>
      </div>
    </div>
  )
}

/** 手动录入事件表单 */
function ManualEventForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { title: string; date: string; category: CompetitorEventCategory; detail: string }) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<CompetitorEventCategory>('产品更新')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const valid = title.trim().length >= 4 && detail.trim().length >= 10

  const submit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({ title: title.trim(), date, category, detail: detail.trim() })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-primary-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-slate-700">录入事件</h3>
        <button onClick={onCancel} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_130px]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="事件标题，如：发布 Composer 2.0"
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-600 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CompetitorEventCategory)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-600 outline-none focus:border-primary-400"
        >
          {EVENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={3}
        placeholder="事件描述（≥10 字）：发生了什么、关键数据或细节。AI 将基于此生成商业/AI/应对三段洞察。"
        className="mt-3 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => void submit()}
          disabled={!valid || submitting}
          className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
        >
          {submitting && <Loader2 size={13} className="animate-spin" />}
          {submitting ? 'AI 洞察生成中…' : '保存并生成洞察'}
        </button>
      </div>
    </div>
  )
}

/** 事件卡片：爬虫文章列表（纯爬虫数据，无 AI 编造）或手动录入（含 AI 洞察） */
function EventCard({
  event,
  onDelete,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  event: CompetitorEvent
  onDelete: () => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const isCrawler = event.origin === 'auto' && event.crawlerArticles && event.crawlerArticles.length > 0

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-card transition-colors ${
        selected ? 'border-primary-300 bg-primary-50/30' : 'border-slate-200/70'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {selectable && (
          <button
            onClick={onToggleSelect}
            className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 transition-colors hover:border-primary-400"
          >
            {selected && <CheckSquare size={14} className="text-primary-500" />}
          </button>
        )}
        {event.date && <span className="text-[12px] tabular-nums text-slate-400">{event.date}</span>}
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_STYLE[event.category]}`}>
          {event.category}
        </span>
        <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10.5px] text-slate-400">
          {isCrawler ? '爬虫追踪' : event.origin === 'auto' ? '自动追踪' : '手动录入'}
        </span>
        {isCrawler && event.keyword && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] text-blue-500">
            关键词：{event.keyword}
          </span>
        )}
        {!selectable && (
          <button
            onClick={onDelete}
            className="ml-auto rounded-md p-1 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
            title="删除事件"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {isCrawler ? (
        /* 爬虫模式：展示真实文章列表 */
        <div className="mt-3 space-y-2.5">
          <p className="text-[12px] text-slate-400">
            共爬取 {event.crawlerArticles!.length} 篇相关文章（按阅读量排序）
          </p>
          {event.crawlerArticles!.map((a, i) => (
            <a
              key={i}
              href={a.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 transition-all hover:border-primary-200 hover:bg-primary-50/30"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[10px] font-medium text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-slate-700 group-hover:text-primary-600">
                  {a.title}
                </p>
                {a.summary && (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-400">{a.summary}</p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-300">
                  <span>{a.sourceName}</span>
                  {a.publishedAt && <span className="tabular-nums">{a.publishedAt}</span>}
                  {a.viewCount > 0 && <span className="tabular-nums">阅读 {a.viewCount.toLocaleString()}</span>}
                </div>
              </div>
              <ExternalLink size={13} className="mt-1 shrink-0 text-slate-300 group-hover:text-primary-400" />
            </a>
          ))}
        </div>
      ) : (
        /* 手动录入：原有的事件 + AI 洞察 */
        <>
          <h3 className="mt-2 text-[15px] font-semibold leading-snug text-slate-800">{event.title}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{event.summary}</p>
          <div className="mt-3 space-y-2">
            {event.businessInsight && (
              <InsightBlock icon={<TrendingUp size={14} />} label="商业视角" text={event.businessInsight} tone="emerald" />
            )}
            {event.aiInsight && (
              <InsightBlock icon={<Cpu size={14} />} label="AI 视角" text={event.aiInsight} tone="violet" />
            )}
            {event.suggestion && (
              <InsightBlock icon={<Compass size={14} />} label="应对建议" text={event.suggestion} tone="primary" />
            )}
          </div>
          <SourceSection event={event} />
        </>
      )}
    </article>
  )
}

/** 事件来源区：直接来源链接 + 本次检索命中清单 + 无来源强警示 */
function SourceSection({ event }: { event: CompetitorEvent }) {
  const refs = event.searchRefs ?? []

  // 手动录入事件：内容由用户提供，无需联网来源
  if (event.origin === 'manual') {
    return event.sourceUrl ? (
      <div className="mt-3 border-t border-slate-100 pt-3 text-[11.5px]">
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-primary-500 transition-colors hover:text-primary-600"
        >
          <ExternalLink size={11} />
          {event.sourceTitle ?? '查看来源'}
        </a>
      </div>
    ) : null
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {/* 直接来源（模型标注或按检索结果补链） */}
      {event.sourceUrl ? (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-[12px] text-primary-500 transition-colors hover:text-primary-600"
        >
          <ExternalLink size={11} className="shrink-0" />
          <span className="min-w-0 truncate">{event.sourceTitle ?? '查看来源'}</span>
        </a>
      ) : event.sourceTitle ? (
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-slate-400">
          <span className="min-w-0 truncate">来源：{event.sourceTitle}</span>
          <a
            href={searchVerifyUrl(event.sourceTitle)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 transition-colors hover:bg-primary-50 hover:text-primary-600"
            title="上游未提供原文链接，点击按标题在搜索引擎中检索核验"
          >
            <Search size={10} />
            搜索核验
          </a>
        </span>
      ) : (
        <a
          href={searchVerifyUrl(event.title)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-[11.5px] text-slate-400 transition-colors hover:text-primary-600"
          title="未标注来源，点击按事件标题在搜索引擎中检索核验"
        >
          <Search size={10} />
          按标题搜索核验
        </a>
      )}

      {/* 本次联网实际命中的网页清单：可逐条点开核验 */}
      {refs.length > 0 ? (
        <details className="group rounded-lg bg-slate-50/70 px-2.5 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11.5px] text-slate-400">
            <Globe size={11} className="shrink-0" />
            本次联网检索命中 {refs.length} 个网页（点击展开逐条核验）
          </summary>
          <ul className="mt-2 space-y-1">
            {refs.map((ref, i) => (
              <li key={i} className="flex min-w-0 items-baseline gap-1.5 text-[11.5px] leading-relaxed">
                <span className="shrink-0 tabular-nums text-slate-300">{i + 1}.</span>
                {ref.media && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-400">
                    {ref.media}
                  </span>
                )}
                {ref.url ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-primary-500 transition-colors hover:text-primary-600 hover:underline"
                    title={ref.url}
                  >
                    {ref.title}
                  </a>
                ) : (
                  <a
                    href={searchVerifyUrl(ref.title)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1 text-slate-500 transition-colors hover:text-primary-600"
                    title="上游未返回原文链接，点击按标题在搜索引擎中检索核验"
                  >
                    <span className="min-w-0 truncate">{ref.title}</span>
                    <span className="flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1 py-px text-[10px]">
                      <Search size={9} />
                      核验
                    </span>
                  </a>
                )}
                {ref.publishDate && (
                  <span className="ml-auto shrink-0 tabular-nums text-slate-300">{ref.publishDate}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        !event.sourceUrl && (
          <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-rose-500">
            <ShieldAlert size={12} className="mt-0.5 shrink-0" />
            <span>未获取到任何检索来源，本事件可能为模型凭记忆生成，<strong>请勿直接采信</strong>，建议重新追踪。</span>
          </div>
        )
      )}
    </div>
  )
}

function InsightBlock({
  icon,
  label,
  text,
  tone,
}: {
  icon: React.ReactNode
  label: string
  text: string
  tone: 'emerald' | 'violet' | 'primary'
}) {
  const styles = {
    emerald: 'bg-emerald-50/70 text-emerald-700',
    violet: 'bg-violet-50/70 text-violet-700',
    primary: 'bg-primary-50/70 text-primary-700',
  }[tone]
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>
        <span className="font-medium">{label}：</span>
        {text}
      </p>
    </div>
  )
}
