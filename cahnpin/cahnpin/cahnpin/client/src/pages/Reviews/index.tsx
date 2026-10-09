/**
 * AI 产品实战复盘（阶段 7）
 * 双类型：self=自己的项目/决策复盘；case=外部 AI 产品案例复盘（先联网检索案例资料）。
 * 交互：AI 按"事实→归因→规律→行动"对话引导，结束后一键生成五节结构化总结报告，
 * 报告可编辑/导出；复盘与对话记录持久化 IndexedDB（reviews 表，消息内嵌）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ClipboardList,
  Plus,
  Send,
  Square,
  Trash2,
  Bot,
  Loader2,
  FileText,
  Pencil,
  Eye,
  Download,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Globe,
  User,
} from 'lucide-react'
import { chatCompletion, streamChat } from '../../lib/llm'
import {
  buildCaseBriefMessages,
  buildReviewMessages,
  buildReviewReportMessages,
} from '../../lib/prompts'
import { renderMarkdown } from '../../lib/markdown'
import { deleteReview, getAllReviews, putReview } from '../../lib/db'
import { formatDate, uid } from '../../lib/format'
import { toast } from '../../stores/uiStore'
import { useMemo } from 'react'
import type { Review, ReviewType } from '../../types'

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<'chat' | 'report'>('chat')
  const [creating, setCreating] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const active = reviews.find((r) => r.id === activeId) ?? null

  useEffect(() => {
    void getAllReviews()
      .then((list) => {
        setReviews(list)
        if (list.length > 0) {
          setActiveId(list[0].id)
          setView(list[0].report ? 'report' : 'chat')
        }
      })
      .catch(() => {})
  }, [])

  // 组件卸载时中止进行中的生成。
  // 注意：切换复盘的中止必须放在事件处理器里（handleSelect/handleDelete），
  // 不能放在依赖 activeId 的 effect 中——否则 handleCreate 先 setActiveId 再
  // 启动开场流式时，effect 会把刚发出的请求误杀（实测复现：net::ERR_ABORTED）。
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  /** 用户主动切换复盘：中止进行中的生成 */
  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeId) return
      abortRef.current?.abort()
      abortRef.current = null
      setStreaming(false)
      setStreamingContent('')
      setActiveId(id)
      const target = reviews.find((r) => r.id === id)
      setView(target?.report ? 'report' : 'chat')
    },
    [activeId, reviews],
  )

  /** 统一写库 + 更新本地状态 */
  const saveReview = useCallback(async (next: Review) => {
    await putReview(next)
    setReviews((prev) => {
      const exists = prev.some((r) => r.id === next.id)
      const list = exists ? prev.map((r) => (r.id === next.id ? next : r)) : [next, ...prev]
      return [...list].sort((a, b) => b.createdAt - a.createdAt)
    })
  }, [])

  /** 流式跑一轮 assistant 回复（history 为最新完整对话） */
  const runAssistant = useCallback(
    async (review: Review, history: Review['messages']) => {
      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)
      setStreamingContent('')
      try {
        const full = await streamChat(
          buildReviewMessages({
            type: review.type,
            title: review.title,
            subject: review.subject,
            caseBrief: review.caseBrief,
            history: history.map((m) => ({ role: m.role, content: m.content })),
          }),
          {
            signal: controller.signal,
            temperature: 0.5,
            onDelta: (text) => setStreamingContent(text),
          },
        )
        if (full.trim()) {
          const withReply: Review = {
            ...review,
            messages: [...history, { role: 'assistant', content: full, createdAt: Date.now() }],
            updatedAt: Date.now(),
          }
          await saveReview(withReply)
        } else {
          toast.error('模型未返回有效内容，请重试')
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError'
        if (!aborted) toast.error(err instanceof Error ? err.message : '生成失败')
      } finally {
        setStreaming(false)
        setStreamingContent('')
        abortRef.current = null
      }
    },
    [saveReview],
  )

  /** 新建复盘：case 类型进入对话页后流式检索案例资料（SSE 有持续字节，不会被中间层判超时），然后 AI 自动开场 */
  const handleCreate = useCallback(
    async (input: { type: ReviewType; title: string; subject: string }) => {
      const now = Date.now()
      const review: Review = {
        id: uid('rv_'),
        type: input.type,
        title: input.title,
        subject: input.subject,
        messages: [],
        report: '',
        caseBrief: '',
        status: 'chatting',
        createdAt: now,
        updatedAt: now,
      }
      try {
        await saveReview(review)
        setActiveId(review.id)
        setView('chat')
        setCreating(false)

        let ready = review
        if (input.type === 'case') {
          setStreaming(true)
          setStreamingContent('')
          try {
            const brief = await streamChat(buildCaseBriefMessages(input.title), {
              webSearch: true,
              temperature: 0.3,
              onDelta: (text) => setStreamingContent(text),
            })
            if (brief.trim()) {
              ready = { ...review, caseBrief: brief }
              await saveReview(ready)
            }
          } catch {
            toast.error('案例资料检索失败，将按纯对话引导')
          } finally {
            setStreaming(false)
            setStreamingContent('')
          }
        }

        // AI 自动开场
        await runAssistant(ready, [])
      } catch (err) {
        toast.error(err instanceof Error ? `创建失败：${err.message}` : '创建失败')
      }
    },
    [saveReview, runAssistant],
  )

  /** 发送用户消息并触发回复 */
  const handleSend = useCallback(
    (text: string) => {
      const review = reviews.find((r) => r.id === activeId)
      if (!review || streaming) return
      void (async () => {
        const history = [...review.messages, { role: 'user' as const, content: text, createdAt: Date.now() }]
        const withUser: Review = { ...review, messages: history, updatedAt: Date.now() }
        try {
          await saveReview(withUser)
        } catch {
          toast.error('消息保存失败')
          return
        }
        await runAssistant(withUser, history)
      })()
    },
    [reviews, activeId, streaming, saveReview, runAssistant],
  )

  /** 生成/重新生成总结报告 */
  const handleGenerateReport = useCallback(async () => {
    const review = reviews.find((r) => r.id === activeId)
    if (!review || generatingReport) return
    if (review.messages.length < 4) {
      toast.error('对话太少了，先完成几轮复盘引导再生成报告')
      return
    }
    setGeneratingReport(true)
    try {
      const report = await chatCompletion(
        buildReviewReportMessages({
          type: review.type,
          title: review.title,
          subject: review.subject,
          history: review.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      )
      if (!report.trim()) throw new Error('模型未返回有效报告，请重试')
      const next: Review = { ...review, report, status: 'done', updatedAt: Date.now() }
      await saveReview(next)
      setView('report')
      toast.success('总结报告已生成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '报告生成失败')
    } finally {
      setGeneratingReport(false)
    }
  }, [reviews, activeId, generatingReport, saveReview])

  const handleSaveReportEdit = useCallback(
    async (content: string) => {
      const review = reviews.find((r) => r.id === activeId)
      if (!review) return
      try {
        await saveReview({ ...review, report: content, updatedAt: Date.now() })
        toast.success('报告已保存')
      } catch {
        toast.error('保存失败')
      }
    },
    [reviews, activeId, saveReview],
  )

  const handleDelete = useCallback(
    async (review: Review) => {
      if (!window.confirm(`确认删除复盘「${review.title}」？对话与报告将一并删除。`)) return
      try {
        if (review.id === activeId) {
          abortRef.current?.abort()
          abortRef.current = null
          setStreaming(false)
          setStreamingContent('')
        }
        await deleteReview(review.id)
        setReviews((prev) => {
          const next = prev.filter((r) => r.id !== review.id)
          if (activeId === review.id) {
            setActiveId(next[0]?.id ?? null)
            setView(next[0]?.report ? 'report' : 'chat')
          }
          return next
        })
        toast.success('已删除')
      } catch {
        toast.error('删除失败')
      }
    },
    [activeId],
  )

  return (
    <div className="flex h-full">
      {/* 左侧：复盘列表 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/60">
        <div className="border-b border-slate-100 p-3">
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-3 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
          >
            <Plus size={15} />
            新建复盘
          </button>
        </div>

        {creating && <CreateReviewForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />}

        <div className="flex-1 overflow-y-auto p-2">
          {reviews.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-14 text-center">
              <ClipboardList size={22} className="text-slate-200" />
              <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
                还没有复盘
                <br />
                从一个项目或案例开始
              </p>
            </div>
          ) : (
            reviews.map((r) => (
              <div
                key={r.id}
                onClick={() => handleSelect(r.id)}
                className={`group mb-1 cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
                  r.id === activeId ? 'bg-primary-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {r.type === 'case' ? (
                    <Globe size={13} className={r.id === activeId ? 'shrink-0 text-primary-500' : 'shrink-0 text-slate-300'} />
                  ) : (
                    <User size={13} className={r.id === activeId ? 'shrink-0 text-primary-500' : 'shrink-0 text-slate-300'} />
                  )}
                  <span
                    className={`truncate text-[13px] ${r.id === activeId ? 'font-medium text-primary-700' : 'text-slate-600'}`}
                    title={r.title}
                  >
                    {r.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(r)
                    }}
                    className="ml-auto hidden shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-500 group-hover:block"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="mt-1 pl-5 text-[11px] text-slate-300">
                  {r.type === 'case' ? '案例复盘' : '实战复盘'} · {r.status === 'done' ? '已出报告' : '引导中'} ·{' '}
                  {formatDate(r.updatedAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右侧 */}
      {active ? (
        view === 'report' && active.report ? (
          <ReportPane
            key={`${active.id}_${active.updatedAt}`}
            review={active}
            onBackToChat={() => setView('chat')}
            onSave={handleSaveReportEdit}
            onRegenerate={handleGenerateReport}
            regenerating={generatingReport}
          />
        ) : (
          <ChatPane
            review={active}
            streamingContent={streamingContent}
            streaming={streaming}
            generatingReport={generatingReport}
            onSend={handleSend}
            onStop={() => abortRef.current?.abort()}
            onGenerateReport={handleGenerateReport}
            onOpenReport={() => setView('report')}
          />
        )
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
            <ClipboardList size={26} />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">AI 产品实战复盘</p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">
            复盘你自己的实战，或联网检索外部 AI 产品案例
            <br />
            AI 对话引导，最后一键生成结构化总结报告
          </p>
        </div>
      )}
    </div>
  )
}

/** 新建复盘表单（双类型） */
function CreateReviewForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { type: ReviewType; title: string; subject: string }) => Promise<void>
  onCancel: () => void
}) {
  const [type, setType] = useState<ReviewType>('self')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const valid = title.trim().length >= 2

  const submit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({ type, title: title.trim(), subject: subject.trim() })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-b border-slate-100 p-3">
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            { value: 'self', label: '实战复盘', desc: '自己的项目/决策' },
            { value: 'case', label: '案例复盘', desc: '联网检索外部产品' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setType(opt.value)}
            className={`rounded-lg border px-2 py-2 text-left transition-colors ${
              type === opt.value ? 'border-primary-400 bg-primary-50/70' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className={`text-[12px] font-medium ${type === opt.value ? 'text-primary-700' : 'text-slate-600'}`}>
              {opt.label}
            </p>
            <p className="mt-0.5 text-[10.5px] text-slate-400">{opt.desc}</p>
          </button>
        ))}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={type === 'self' ? '复盘对象，如：智能客服上线项目' : '产品名，如：Character.AI'}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
      <textarea
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        rows={2}
        placeholder="补充背景（可选）：目标、时间、你的角色等"
        className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => void submit()}
          disabled={!valid || submitting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
        >
          {submitting && <Loader2 size={12} className="animate-spin" />}
          {submitting ? (type === 'case' ? '检索案例资料中…' : '创建中…') : '开始复盘'}
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

/** 对话引导面板 */
function ChatPane({
  review,
  streamingContent,
  streaming,
  generatingReport,
  onSend,
  onStop,
  onGenerateReport,
  onOpenReport,
}: {
  review: Review
  streamingContent: string
  streaming: boolean
  generatingReport: boolean
  onSend: (text: string) => void
  onStop: () => void
  onGenerateReport: () => void
  onOpenReport: () => void
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [review.messages.length, streamingContent, review.id])

  const canSend = input.trim().length > 0 && !streaming
  const canReport = review.messages.length >= 4 && !streaming

  const handleSend = () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    onSend(text)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white/70 px-6 py-3 backdrop-blur">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] font-medium text-primary-600">
          {review.type === 'case' ? '案例复盘' : '实战复盘'}
        </span>
        <h2 className="truncate text-[14px] font-medium text-slate-700">{review.title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {review.report && (
            <button
              onClick={onOpenReport}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-slate-100"
            >
              <FileText size={13} />
              查看报告
            </button>
          )}
          <button
            onClick={onGenerateReport}
            disabled={!canReport || generatingReport}
            title={canReport ? '基于全部对话生成结构化总结报告' : '至少完成 2 轮对话后可生成'}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
          >
            {generatingReport ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            {generatingReport ? '报告生成中…' : review.report ? '重新生成报告' : '生成总结报告'}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {review.messages.length === 0 && streaming && (
            <div className="flex gap-3">
              <CoachAvatar />
              <div className="rounded-2xl rounded-tl-sm border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
                <span className="flex items-center gap-2 text-[13px] text-slate-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500" />
                  教练正在准备开场…
                </span>
              </div>
            </div>
          )}

          {review.messages.map((msg, i) =>
            msg.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary-500 px-4 py-3 text-sm leading-relaxed text-white shadow-sm">
                  {msg.content}
                </div>
              </div>
            ) : (
              <AssistantBubble key={i} content={msg.content} />
            ),
          )}

          {streaming && streamingContent && <AssistantBubble content={streamingContent} streaming />}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white/70 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={2}
            placeholder="回答教练的问题，Enter 发送，Shift+Enter 换行"
            className="max-h-40 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
          {streaming ? (
            <button
              onClick={onStop}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 transition-colors hover:bg-rose-50"
              title="停止生成"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
              title="发送"
            >
              <Send size={15} />
            </button>
          )}
        </div>
        <p className="mx-auto mt-2 flex max-w-3xl items-center gap-1 text-[11px] text-slate-300">
          <ShieldAlert size={11} />
          按"事实→归因→规律→行动"引导；外部事实以【待核验】标注处需人工确认
        </p>
      </div>
    </div>
  )
}

function CoachAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
      <Bot size={15} />
    </div>
  )
}

function AssistantBubble({ content, streaming }: { content: string; streaming?: boolean }) {
  const html = useMemo(() => renderMarkdown(content), [content])
  return (
    <div className="flex gap-3">
      <CoachAvatar />
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
        <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
        {streaming && (
          <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary-400 align-text-bottom" />
        )}
      </div>
    </div>
  )
}

/** 总结报告面板：预览/编辑/导出/重新生成 */
function ReportPane({
  review,
  onBackToChat,
  onSave,
  onRegenerate,
  regenerating,
}: {
  review: Review
  onBackToChat: () => void
  onSave: (content: string) => void
  onRegenerate: () => void
  regenerating: boolean
}) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [draft, setDraft] = useState(review.report)
  const dirty = draft !== review.report
  const html = useMemo(() => renderMarkdown(draft), [draft])

  const exportMd = () => {
    const text = `# 复盘报告：${review.title}\n\n> 类型：${review.type === 'case' ? '外部产品案例复盘' : '实战复盘'} · 生成时间：${new Date(review.updatedAt).toLocaleString('zh-CN')}\n\n---\n\n${draft}`
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${review.title}-复盘报告.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('报告已导出')
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white/70 px-6 py-3 backdrop-blur">
        <button
          onClick={onBackToChat}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-slate-100"
        >
          <MessageSquare size={13} />
          返回对话
        </button>
        <h2 className="truncate text-[14px] font-medium text-slate-700">复盘报告：{review.title}</h2>

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-500">未保存</span>}
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition-colors ${mode === 'preview' ? 'bg-primary-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Eye size={12} />
              预览
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition-colors ${mode === 'edit' ? 'bg-primary-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Pencil size={12} />
              编辑
            </button>
          </div>
          <button
            onClick={() => dirty && onSave(draft)}
            disabled={!dirty}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
          >
            保存
          </button>
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40"
          >
            {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            重新生成
          </button>
          <button
            onClick={exportMd}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-slate-100"
          >
            <Download size={13} />
            导出 .md
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-[12.5px] leading-relaxed text-amber-700">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              报告基于复盘对话由 AI 总结生成，标有【待核验】处请人工确认事实；支持编辑修订后保存。
            </span>
          </div>
          {mode === 'preview' ? (
            <div className="rounded-2xl border border-slate-200/70 bg-white p-7 shadow-card">
              <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60vh] w-full resize-y rounded-2xl border border-slate-200/70 bg-white p-7 font-mono text-[13px] leading-relaxed text-slate-700 shadow-card outline-none focus:border-primary-300"
            />
          )}
        </div>
      </div>
    </div>
  )
}
