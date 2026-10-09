/**
 * 个人知识库总览（阶段 7）
 * 跨模块统一检索：拆解报告、复盘、行业资讯、陪练对话、竞品与事件、素材库。
 * 本地 IndexedDB 全量扫描 + 关键词匹配（数据量为个人级，无需引入搜索引擎），
 * 结果按模块分组展示，点击跳转对应页面。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Library,
  Puzzle,
  NotebookPen,
  Newspaper,
  MessagesSquare,
  Telescope,
  FolderOpen,
  CornerDownRight,
  type LucideIcon,
} from 'lucide-react'
import {
  getAllConversations,
  getAllInsights,
  getAllMaterials,
  getAllReviews,
  getAllTeardowns,
  getTrainerMessages,
  getAllCompetitors,
  getCompetitorEvents,
  countChunks,
} from '../lib/db'
import { formatDate } from '../lib/format'

/** 一条可检索文档（统一抽象） */
interface SearchDoc {
  module: string
  path: string
  title: string
  /** 参与匹配的全文 */
  body: string
  updatedAt: number
}

interface Hit extends SearchDoc {
  /** 命中片段（含关键词上下文） */
  snippet: string
}

const MODULE_META: Record<string, { label: string; icon: LucideIcon; color: string; path: string }> = {
  teardown: { label: '产品拆解', icon: Puzzle, color: 'bg-primary-50 text-primary-600', path: '/teardown' },
  review: { label: '复盘沉淀', icon: NotebookPen, color: 'bg-emerald-50 text-emerald-600', path: '/reviews' },
  insight: { label: '行业资讯', icon: Newspaper, color: 'bg-amber-50 text-amber-600', path: '/insights' },
  chat: { label: '陪练对话', icon: MessagesSquare, color: 'bg-violet-50 text-violet-600', path: '/chat' },
  competitor: { label: '竞品跟踪', icon: Telescope, color: 'bg-rose-50 text-rose-500', path: '/competitors' },
  material: { label: '素材库', icon: FolderOpen, color: 'bg-slate-100 text-slate-500', path: '/materials' },
}

/** 提取关键词上下文片段（命中处前后各 40 字） */
function makeSnippet(body: string, keyword: string): string {
  const idx = body.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx < 0) return body.slice(0, 80)
  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + keyword.length + 40)
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
}

export default function Knowledge({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const [docs, setDocs] = useState<SearchDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({})
  const [chunkCount, setChunkCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 汇总各模块内容为统一文档集
  useEffect(() => {
    void (async () => {
      setLoading(true)
      const all: SearchDoc[] = []
      const counts: Record<string, number> = {}
      const push = (module: string, items: SearchDoc[]) => {
        counts[module] = items.length
        all.push(...items)
      }

      try {
        const [teardowns, reviews, insights, conversations, competitors, materials, chunks] =
          await Promise.all([
            getAllTeardowns(),
            getAllReviews(),
            getAllInsights(),
            getAllConversations(),
            getAllCompetitors(),
            getAllMaterials(),
            countChunks(),
          ])
        setChunkCount(chunks)

        push(
          'teardown',
          teardowns.map((t) => ({
            module: 'teardown',
            path: '/teardown',
            title: `${t.productName} · 全维度拆解报告`,
            body: `${t.productName}\n${t.brief}\n${t.content}`,
            updatedAt: t.updatedAt,
          })),
        )

        push(
          'review',
          reviews.map((r) => ({
            module: 'review',
            path: '/reviews',
            title: `${r.title} · ${r.type === 'case' ? '案例复盘' : '实战复盘'}`,
            body: `${r.title}\n${r.subject}\n${r.report}\n${r.messages.map((m) => m.content).join('\n')}`,
            updatedAt: r.updatedAt,
          })),
        )

        push(
          'insight',
          insights.map((i) => ({
            module: 'insight',
            path: '/insights',
            title: `${i.date} · 每日 AI 行业一推（${i.items.length} 条）`,
            body: i.items
              .map((it) => `${it.title}\n${it.summary}\n${it.whyItMatters}\n${it.pmInsight}`)
              .join('\n'),
            updatedAt: i.createdAt,
          })),
        )

        // 陪练：逐会话聚合消息（个人级数据量，逐会话取足够快）
        const chatDocs: SearchDoc[] = []
        for (const conv of conversations) {
          const messages = await getTrainerMessages(conv.id).catch(() => [])
          chatDocs.push({
            module: 'chat',
            path: '/chat',
            title: `${conv.title} · 陪练对话`,
            body: `${conv.title}\n${messages.map((m) => m.content).join('\n')}`,
            updatedAt: conv.updatedAt,
          })
        }
        push('chat', chatDocs)

        // 竞品：竞品本身 + 事件聚合
        const compDocs: SearchDoc[] = []
        for (const c of competitors) {
          const events = await getCompetitorEvents(c.id).catch(() => [])
          compDocs.push({
            module: 'competitor',
            path: '/competitors',
            title: `${c.name} · 竞品跟踪（${events.length} 事件）`,
            body: `${c.name}\n${c.description}\n${events
              .map((e) => `${e.title}\n${e.summary}\n${e.businessInsight}\n${e.aiInsight}\n${e.suggestion}`)
              .join('\n')}`,
            updatedAt: c.updatedAt,
          })
        }
        push('competitor', compDocs)

        push(
          'material',
          materials.map((m) => ({
            module: 'material',
            path: '/materials',
            title: m.name,
            body: m.name,
            updatedAt: m.createdAt,
          })),
        )
      } catch {
        /* DB 暂不可用时保持空 */
      }

      setDocs(all)
      setModuleCounts(counts)
      setLoading(false)
    })()
  }, [])

  // 输入防抖 300ms
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(keyword.trim()), 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [keyword])

  const hits = useMemo<Hit[]>(() => {
    if (debounced.length < 2) return []
    const kw = debounced.toLowerCase()
    return docs
      .filter((d) => d.body.toLowerCase().includes(kw))
      .map((d) => ({ ...d, snippet: makeSnippet(d.body.replace(/\s+/g, ' '), debounced) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50)
  }, [docs, debounced])

  const groupedHits = useMemo(() => {
    const groups = new Map<string, Hit[]>()
    for (const hit of hits) {
      const list = groups.get(hit.module) ?? []
      list.push(hit)
      groups.set(hit.module, list)
    }
    return groups
  }, [hits])

  const goModule = useCallback(
    (path: string) => {
      navigate(path)
    },
    [navigate],
  )

  return (
    <div className={embedded ? 'mt-6' : 'page-container'}>
      <div className={embedded ? 'sr-only' : ''}>
        <h1 className="text-xl font-semibold text-slate-800">个人知识库总览</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          统一检索你的工作台：拆解报告、复盘、行业资讯、陪练对话、竞品跟踪与素材库
        </p>
      </div>

      {/* 搜索框 */}
      <div className="relative mt-6">
        <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入关键词检索全部内容（至少 2 个字），如：留存、定价、Cursor"
          className="w-full rounded-2xl border border-slate-200/80 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-700 shadow-card outline-none transition-colors placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {/* 模块统计卡（未搜索时） */}
      {debounced.length < 2 ? (
        loading ? (
          <p className="mt-16 text-center text-[13px] text-slate-300">正在汇总各模块内容…</p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(MODULE_META).map(([key, meta]) => {
                const Icon = meta.icon
                const count = moduleCounts[key] ?? 0
                return (
                  <button
                    key={key}
                    onClick={() => goModule(meta.path)}
                    className="rounded-2xl border border-slate-200/70 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover"
                  >
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${meta.color}`}>
                      <Icon size={15} />
                    </span>
                    <p className="mt-2.5 text-lg font-semibold tabular-nums text-slate-800">{count}</p>
                    <p className="mt-0.5 text-[12px] text-slate-400">{meta.label}</p>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-4 text-[13px] text-slate-500">
              <Library size={15} className="text-primary-400" />
              RAG 语义切片共 <strong className="tabular-nums text-slate-700">{chunkCount}</strong> 个（来自素材库，供拆解器与陪练检索增强使用）
            </div>
            <p className="mt-6 text-center text-[12.5px] text-slate-300">
              在上方输入关键词，即可跨模块检索全部已沉淀内容
            </p>
          </>
        )
      ) : (
        /* 搜索结果 */
        <div className="mt-5">
          <p className="text-[13px] text-slate-400">
            「{debounced}」命中 <strong className="text-slate-700">{hits.length}</strong> 条
            {hits.length >= 50 && '（仅显示最近 50 条）'}
          </p>

          {hits.length === 0 ? (
            <div className="mt-10 flex flex-col items-center text-center">
              <Search size={22} className="text-slate-200" />
              <p className="mt-3 text-[13px] text-slate-400">没有找到相关内容，换个关键词试试</p>
            </div>
          ) : (
            Array.from(groupedHits.entries()).map(([module, list]) => {
              const meta = MODULE_META[module]
              const Icon = meta.icon
              return (
                <section key={module} className="mt-5">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${meta.color}`}>
                      <Icon size={13} />
                    </span>
                    <h2 className="text-[13px] font-medium text-slate-600">
                      {meta.label}（{list.length}）
                    </h2>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {list.map((hit, i) => (
                      <button
                        key={`${hit.title}_${i}`}
                        onClick={() => goModule(hit.path)}
                        className="group flex w-full items-start gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-cardHover"
                      >
                        <CornerDownRight size={14} className="mt-1 shrink-0 text-slate-200 transition-colors group-hover:text-primary-400" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-medium text-slate-700">{hit.title}</span>
                            <span className="text-[11px] text-slate-300">{formatDate(hit.updatedAt)}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-400">
                            {highlight(hit.snippet, debounced)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

/** 关键词高亮渲染 */
function highlight(text: string, keyword: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-100 px-0.5 text-amber-800">{text.slice(idx, idx + keyword.length)}</mark>
      {text.slice(idx + keyword.length)}
    </>
  )
}
