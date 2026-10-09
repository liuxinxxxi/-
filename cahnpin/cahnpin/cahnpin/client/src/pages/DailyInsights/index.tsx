/**
 * 每日 AI 行业一推（阶段 5）
 * 联网检索（GLM web_search 工具）最近一周行业动态，AI 编辑为六条卡片：
 * 标题 / 分类 / 概述 / 为什么重要 / 对 PM 的启发 / 来源。
 * 每日一条记录（id=日期），历史自动入库可按日期翻看。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Newspaper,
  RefreshCw,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Lightbulb,
  TrendingUp,
  Trash2,
  CalendarDays,
  ChevronRight,
  Globe,
  Search,
} from 'lucide-react'
import { chatWithSearch } from '../../lib/llm'
import { buildInsightMessages, parseInsightItems } from '../../lib/prompts'
import { deleteInsight, getAllInsights, putInsight } from '../../lib/db'
import { api } from '../../lib/api'
import { formatDate, searchVerifyUrl } from '../../lib/format'
import { toast } from '../../stores/uiStore'
import type { Insight, InsightCategory, InsightItem, InsightSourceRef } from '../../types'

/** 本地日期 YYYY-MM-DD */
function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const CATEGORY_STYLE: Record<InsightCategory, string> = {
  模型发布: 'bg-violet-50 text-violet-600',
  新产品: 'bg-primary-50 text-primary-600',
  赛道趋势: 'bg-emerald-50 text-emerald-600',
  落地方法论: 'bg-amber-50 text-amber-600',
  政策法规: 'bg-rose-50 text-rose-500',
}

export default function DailyInsights() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [activeDate, setActiveDate] = useState<string>(todayStr())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = todayStr()
  const active = insights.find((i) => i.date === activeDate) ?? null

  useEffect(() => {
    void getAllInsights()
      .then(setInsights)
      .catch(() => {})
  }, [])

  /** 生成（或重新生成）某日推送；当日已存在时覆盖 */
  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const { content, searchRefs } = await chatWithSearch(buildInsightMessages(today))
      const items = parseInsightItems(content, searchRefs)

      let model = '当前配置模型'
      try {
        model = (await api.getConfig()).chatModel
      } catch {
        /* 展示用，失败忽略 */
      }

      const insight: Insight = {
        id: today,
        date: today,
        items,
        searchRefs: searchRefs
          .slice(0, 10)
          .map((r) => ({ title: r.title, url: r.url, media: r.media, publishDate: r.publishDate })),
        model,
        createdAt: Date.now(),
      }
      await putInsight(insight)
      const list = await getAllInsights()
      setInsights(list)
      setActiveDate(today)
      toast.success(`今日推送已生成：${items.length} 条`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败，请重试'
      setError(msg)
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }, [today])

  const handleDelete = useCallback(
    async (insight: Insight) => {
      if (!window.confirm(`确认删除 ${insight.date} 的推送？`)) return
      await deleteInsight(insight.id)
      setInsights((prev) => prev.filter((i) => i.id !== insight.id))
      if (activeDate === insight.date) setActiveDate(today)
      toast.success('已删除')
    },
    [activeDate, today],
  )

  const todayExists = insights.some((i) => i.date === today)

  return (
    <div className="page-container">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">每日 AI 行业一推</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            联网检索最近一周动态：模型新版本 · AI 新产品 · 赛道趋势 · 落地方法论 · 政策法规
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-60"
        >
          {generating ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              正在联网检索生成（约 30 秒）…
            </>
          ) : todayExists ? (
            <>
              <RefreshCw size={15} />
              重新生成今日推送
            </>
          ) : (
            <>
              <Newspaper size={15} />
              生成今日推送
            </>
          )}
        </button>
      </div>

      {/* 日期切换（有历史时显示） */}
      {insights.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <CalendarDays size={15} className="text-slate-300" />
          {insights.map((i) => (
            <button
              key={i.id}
              onClick={() => setActiveDate(i.date)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
                activeDate === i.date
                  ? 'bg-primary-500 font-medium text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-primary-200 hover:text-primary-600'
              }`}
            >
              {i.date}
              {i.date === today && ' · 今天'}
            </button>
          ))}
        </div>
      )}

      {/* 免责条 */}
      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-[12.5px] leading-relaxed text-amber-700">
        <ShieldAlert size={15} className="mt-0.5 shrink-0" />
        <span>
          内容由 AI 联网检索并编辑生成：<strong>蓝色链接为检索返回的原文，灰色「搜索核验」为按标题跳转搜索引擎</strong>（上游未给原文链接时）。事实可能失准，重要信息请人工核验。
        </span>
      </div>

      {/* 主区域 */}
      {generating && !active ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <Loader2 size={26} className="animate-spin text-primary-400" />
          <p className="mt-4 text-sm text-slate-500">正在联网检索最近一周 AI 行业动态…</p>
          <p className="mt-1 text-[12px] text-slate-300">检索 + 编辑约需 20-40 秒，请稍候</p>
        </div>
      ) : error && !active ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-sm text-rose-500">{error}</p>
          <button
            onClick={handleGenerate}
            className="mt-4 rounded-xl border border-primary-200 px-4 py-2 text-[13px] text-primary-600 transition-colors hover:bg-primary-50"
          >
            重新生成
          </button>
        </div>
      ) : active ? (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-[13px] text-slate-400">
              {active.date} · {active.items.length} 条 · 模型 {active.model} · 生成于{' '}
              {formatDate(active.createdAt)}
            </p>
            <button
              onClick={() => handleDelete(active)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 size={13} />
              删除本期
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {active.items.map((item, idx) => (
              <InsightCard key={idx} item={item} />
            ))}
          </div>

          {/* 检索参考来源（可点击跳转核验；兼容旧版仅存标题的历史数据） */}
          {active.searchRefs.length > 0 && (
            <details className="mt-6 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-slate-500">
                <Globe size={13} />
                本期检索命中的 {active.searchRefs.length} 个网页（点击展开核验来源；蓝色为原文链接，灰色为搜索核验）
              </summary>
              <ul className="mt-2 space-y-1.5">
                {active.searchRefs.map((ref, i) => {
                  // 历史数据兼容：旧版本 searchRefs 仅存标题字符串
                  const r: InsightSourceRef =
                    typeof ref === 'string' ? { title: ref } : ref
                  return (
                    <li key={i} className="flex min-w-0 items-baseline gap-2 text-[12px] leading-relaxed">
                      <span className="shrink-0 tabular-nums text-slate-300">{i + 1}.</span>
                      {r.media && (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10.5px] text-slate-400">
                          {r.media}
                        </span>
                      )}
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 items-center gap-1 text-primary-500 transition-colors hover:text-primary-600 hover:underline"
                          title={r.url}
                        >
                          <span className="min-w-0 truncate">{r.title}</span>
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                      ) : (
                        <a
                          href={searchVerifyUrl(r.title)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 items-center gap-1 text-slate-500 transition-colors hover:text-primary-600"
                          title="上游未返回该网页的原文链接，点击按标题在搜索引擎中检索核验"
                        >
                          <span className="min-w-0 truncate">{r.title}</span>
                          <span className="flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1 py-px text-[10px]">
                            <Search size={9} />
                            核验
                          </span>
                        </a>
                      )}
                      {r.publishDate && (
                        <span className="ml-auto shrink-0 tabular-nums text-slate-300">{r.publishDate}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </details>
          )}
        </>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mt-8 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-20 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/30"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
            <Newspaper size={26} />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">生成今日 AI 行业推送</p>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            联网检索最近一周动态，AI 编辑为 6 条卡片：概述、为什么重要、对 PM 的启发与来源
          </p>
        </button>
      )}
    </div>
  )
}

/** 单条资讯卡片 */
function InsightCard({ item }: { item: InsightItem }) {
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-snug text-slate-800">{item.title}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_STYLE[item.category]}`}
        >
          {item.category}
        </span>
      </div>

      <p className="mt-2.5 text-[13px] leading-relaxed text-slate-600">{item.summary}</p>

      {item.whyItMatters && (
        <div className="mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-slate-500">
          <TrendingUp size={14} className="mt-0.5 shrink-0 text-emerald-500" />
          <p>
            <span className="font-medium text-slate-600">为什么重要：</span>
            {item.whyItMatters}
          </p>
        </div>
      )}

      {item.pmInsight && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-primary-50/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-primary-700">
          <Lightbulb size={14} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-medium">PM 启发：</span>
            {item.pmInsight}
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-4">
        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1 text-[12px] text-primary-500 transition-colors hover:text-primary-600"
            title={item.sourceTitle ?? item.sourceUrl}
          >
            <ExternalLink size={12} className="shrink-0" />
            <span className="truncate">{item.sourceTitle ?? '查看来源'}</span>
          </a>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-slate-400">
            <span className="min-w-0 truncate">
              {item.sourceTitle ? `来源：${item.sourceTitle}` : '原文链接缺失【待核验】'}
            </span>
            <a
              href={searchVerifyUrl(item.sourceTitle ?? item.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 transition-colors hover:bg-primary-50 hover:text-primary-600"
              title="上游未提供原文链接，点击按标题在搜索引擎中检索核验"
            >
              <Search size={10} />
              搜索核验
            </a>
          </span>
        )}
        <ChevronRight size={14} className="shrink-0 text-slate-200" />
      </div>
    </article>
  )
}
