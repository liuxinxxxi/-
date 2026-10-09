/**
 * 成长数据看板（阶段 7）
 * 本地数据聚合可视化：学习天数/连续天数、拆解、复盘、提问训练次数，
 * 近 14 天活动柱状图与模块分布（纯 CSS 绘制，不引入图表库）。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Flame,
  CalendarCheck2,
  Puzzle,
  NotebookPen,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
  FolderOpen,
  Telescope,
  Database,
  ChartColumn,
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

/** 本地日期 key（YYYY-MM-DD） */
function dayKey(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const DAY_MS = 86_400_000

/** 每天的活动计数（按模块细分） */
interface DayActivity {
  key: string
  label: string // M/D
  teardown: number
  review: number
  chat: number // 用户提问数
  other: number // 素材 / 资讯 / 竞品事件
}

interface Stats {
  teardownCount: number
  reviewCount: number
  reviewDoneCount: number
  conversationCount: number
  messageCount: number
  userAskCount: number
  insightItemCount: number
  materialCount: number
  chunkCount: number
  competitorCount: number
  eventCount: number
  activeDays: number
  streak: number
  days14: DayActivity[]
}

/** 连续学习天数：今天无活动则从昨天起算（今天仍可挽回） */
function computeStreak(days: Set<string>): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let cursor = today.getTime()
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor -= DAY_MS
  }
  return streak
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    void (async () => {
      const [teardowns, reviews, conversations, insights, materials, competitors, chunks] =
        await Promise.all([
          getAllTeardowns(),
          getAllReviews(),
          getAllConversations(),
          getAllInsights(),
          getAllMaterials(),
          getAllCompetitors(),
          countChunks(),
        ])

      // 逐会话/逐竞品取明细（个人级数据量，串行取足够快）
      const allMessages = [] as Awaited<ReturnType<typeof getTrainerMessages>>
      for (const conv of conversations) {
        allMessages.push(...(await getTrainerMessages(conv.id).catch(() => [])))
      }
      let eventCount = 0
      const eventTimes: number[] = []
      for (const c of competitors) {
        const events = await getCompetitorEvents(c.id).catch(() => [])
        eventCount += events.length
        for (const e of events) eventTimes.push(e.createdAt)
      }

      // 汇总全部活跃日期
      const days = new Set<string>()
      const mark = (ts: number) => days.add(dayKey(ts))
      teardowns.forEach((t) => mark(t.createdAt))
      reviews.forEach((r) => mark(r.createdAt))
      allMessages.forEach((m) => mark(m.createdAt))
      insights.forEach((i) => mark(i.createdAt))
      materials.forEach((m) => mark(m.createdAt))
      eventTimes.forEach(mark)

      // 近 14 天活动
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const days14: DayActivity[] = []
      for (let i = 13; i >= 0; i -= 1) {
        const ts = today.getTime() - i * DAY_MS
        const d = new Date(ts)
        days14.push({
          key: dayKey(ts),
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          teardown: 0,
          review: 0,
          chat: 0,
          other: 0,
        })
      }
      const bucket = new Map(days14.map((d) => [d.key, d]))
      const bump = (ts: number, field: 'teardown' | 'review' | 'chat' | 'other') => {
        const b = bucket.get(dayKey(ts))
        if (b) b[field] += 1
      }
      teardowns.forEach((t) => bump(t.createdAt, 'teardown'))
      reviews.forEach((r) => bump(r.createdAt, 'review'))
      allMessages.filter((m) => m.role === 'user').forEach((m) => bump(m.createdAt, 'chat'))
      materials.forEach((m) => bump(m.createdAt, 'other'))
      insights.forEach((i) => bump(i.createdAt, 'other'))
      eventTimes.forEach((ts) => bump(ts, 'other'))

      setStats({
        teardownCount: teardowns.length,
        reviewCount: reviews.length,
        reviewDoneCount: reviews.filter((r) => r.status === 'done').length,
        conversationCount: conversations.length,
        messageCount: allMessages.length,
        userAskCount: allMessages.filter((m) => m.role === 'user').length,
        insightItemCount: insights.reduce((sum, i) => sum + i.items.length, 0),
        materialCount: materials.length,
        chunkCount: chunks,
        competitorCount: competitors.length,
        eventCount,
        activeDays: days.size,
        streak: computeStreak(days),
        days14,
      })
    })()
  }, [])

  const maxDayTotal = useMemo(
    () => Math.max(1, ...(stats?.days14.map((d) => d.teardown + d.review + d.chat + d.other) ?? [1])),
    [stats],
  )

  if (!stats) {
    return (
      <div className="page-container">
        <h1 className="text-xl font-semibold text-slate-800">成长数据看板</h1>
        <p className="mt-16 text-center text-[13px] text-slate-300">正在汇总成长数据…</p>
      </div>
    )
  }

  const topCards = [
    {
      icon: CalendarCheck2,
      label: '累计学习天数',
      value: stats.activeDays,
      suffix: '天',
      sub: stats.streak > 0 ? `已连续 ${stats.streak} 天` : '今天还没开始，来一轮学习吧',
      color: 'bg-primary-50 text-primary-600',
    },
    {
      icon: Flame,
      label: '连续学习',
      value: stats.streak,
      suffix: '天',
      sub: stats.streak >= 3 ? '节奏不错，继续保持' : '每天一点点，积累看得见',
      color: 'bg-amber-50 text-amber-500',
    },
    {
      icon: Puzzle,
      label: '拆解报告',
      value: stats.teardownCount,
      suffix: '份',
      sub: '全维度产品拆解器产出',
      color: 'bg-primary-50 text-primary-600',
    },
    {
      icon: NotebookPen,
      label: '复盘沉淀',
      value: stats.reviewCount,
      suffix: '篇',
      sub: `其中 ${stats.reviewDoneCount} 篇已生成报告`,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      icon: MessageCircleQuestion,
      label: '提问训练',
      value: stats.userAskCount,
      suffix: '次',
      sub: `共 ${stats.conversationCount} 场陪练会话`,
      color: 'bg-violet-50 text-violet-600',
    },
  ]

  const distribution = [
    { label: '拆解报告', value: stats.teardownCount, color: 'bg-primary-400' },
    { label: '复盘沉淀', value: stats.reviewCount, color: 'bg-emerald-400' },
    { label: '陪练消息', value: stats.messageCount, color: 'bg-violet-400' },
    { label: '行业资讯', value: stats.insightItemCount, color: 'bg-amber-300' },
    { label: '竞品事件', value: stats.eventCount, color: 'bg-rose-300' },
    { label: '素材文档', value: stats.materialCount, color: 'bg-slate-300' },
  ]
  const maxDist = Math.max(1, ...distribution.map((d) => d.value))

  const secondary = [
    { icon: MessagesSquare, label: '陪练消息', value: stats.messageCount },
    { icon: Newspaper, label: '行业资讯', value: stats.insightItemCount },
    { icon: FolderOpen, label: '素材文档', value: stats.materialCount },
    { icon: Database, label: 'RAG 切片', value: stats.chunkCount },
    { icon: Telescope, label: '跟踪竞品', value: stats.competitorCount },
    { icon: ChartColumn, label: '竞品事件', value: stats.eventCount },
  ]

  return (
    <div className="page-container">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">成长数据看板</h1>
        <p className="mt-1.5 text-sm text-slate-400">拆解数量、学习天数、复盘数量、提问训练次数可视化</p>
      </div>

      {/* 顶部核心指标 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {topCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card"
            >
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${card.color}`}>
                  <Icon size={15} />
                </span>
                <span className="text-[12px] text-slate-400">{card.label}</span>
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-800">
                {card.value}
                <span className="ml-1 text-[12px] font-normal text-slate-300">{card.suffix}</span>
              </p>
              <p className="mt-1 truncate text-[11.5px] text-slate-300">{card.sub}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        {/* 近 14 天活动柱状图 */}
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-medium text-slate-700">近 14 天活动</h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-primary-400" />拆解</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-emerald-400" />复盘</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-violet-400" />提问</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-slate-200" />其他</span>
            </div>
          </div>
          <div className="mt-5 flex h-36 items-end gap-[6px]">
            {stats.days14.map((d) => {
              const total = d.teardown + d.review + d.chat + d.other
              const h = (n: number) => `${Math.round((n / maxDayTotal) * 100)}%`
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="flex w-full max-w-7 flex-col-reverse justify-start overflow-hidden rounded-md"
                    style={{ height: '104px' }}
                    title={`${d.key}\n拆解 ${d.teardown} · 复盘 ${d.review} · 提问 ${d.chat} · 其他 ${d.other}`}
                  >
                    {total === 0 ? (
                      <div className="w-full rounded-sm bg-slate-100" style={{ height: '3px' }} />
                    ) : (
                      <>
                        {d.other > 0 && <div className="w-full bg-slate-200" style={{ height: h(d.other) }} />}
                        {d.chat > 0 && <div className="w-full bg-violet-300" style={{ height: h(d.chat) }} />}
                        {d.review > 0 && <div className="w-full bg-emerald-400" style={{ height: h(d.review) }} />}
                        {d.teardown > 0 && <div className="w-full bg-primary-400" style={{ height: h(d.teardown) }} />}
                      </>
                    )}
                  </div>
                  <span className="text-[10px] tabular-nums text-slate-300">{d.label}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* 模块分布 */}
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card lg:col-span-2">
          <h2 className="text-[14px] font-medium text-slate-700">内容沉淀分布</h2>
          <div className="mt-5 space-y-3.5">
            {distribution.map((d) => (
              <div key={d.label}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="text-slate-500">{d.label}</span>
                  <span className="tabular-nums text-slate-400">{d.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${d.color} transition-all duration-500`}
                    style={{ width: `${Math.max(d.value > 0 ? 4 : 0, Math.round((d.value / maxDist) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 次级指标 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {secondary.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3.5"
            >
              <Icon size={15} className="shrink-0 text-slate-300" />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold tabular-nums leading-tight text-slate-700">{item.value}</p>
                <p className="text-[11px] text-slate-300">{item.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-[12.5px] text-slate-300">
        数据全部来自本地浏览器存储，仅统计你自己的工作台内容
      </p>
    </div>
  )
}
