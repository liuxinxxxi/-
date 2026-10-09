/**
 * 学练实操模块（替换原 Reviews）
 * RAG / 向量库 / 工作流 讲学练评复盘五闭环实训。
 * 左侧：实操列表 + 历史复盘只读入口；右侧：5 tab 阶段切换。
 * 数据持久化 IndexedDB（practices 表）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Trash2,
  GraduationCap,
  Loader2,
  RefreshCw,
  BookOpen,
  FlaskConical,
  ClipboardCheck,
  FileText,
  Download,
  Pencil,
  Eye,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react'
import { chatCompletion, streamChat } from '../../lib/llm'
import {
  EXERCISE_LEVEL_META,
  PRACTICE_TOPICS,
  buildPracticeExerciseMessages,
  buildPracticeGradingMessages,
  buildPracticeLectureMessages,
  buildPracticeReviewMessages,
  parsePracticeExercises,
  parsePracticeGrading,
} from '../../lib/prompts'
import { renderMarkdown } from '../../lib/markdown'
import { deletePractice, getAllPractices, putPractice } from '../../lib/db'
import { formatDate, uid } from '../../lib/format'
import { toast } from '../../stores/uiStore'
import type { ExerciseLevel, Practice, PracticeExercise, PracticeStage } from '../../types'

type Tab = PracticeStage

const TABS: Array<{ key: Tab; label: string; icon: typeof BookOpen }> = [
  { key: 'lecture', label: '讲', icon: BookOpen },
  { key: 'learn', label: '学', icon: FlaskConical },
  { key: 'practice', label: '练', icon: ClipboardCheck },
  { key: 'grade', label: '评', icon: FileText },
  { key: 'review', label: '复盘', icon: RefreshCw },
]

export default function Practice() {
  const navigate = useNavigate()
  const [practices, setPractices] = useState<Practice[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('lecture')
  const [creating, setCreating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const active = practices.find((p) => p.id === activeId) ?? null

  useEffect(() => {
    void getAllPractices()
      .then((list) => {
        setPractices(list)
        if (list.length > 0) setActiveId(list[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  /** 统一写库 + 更新本地状态 */
  const savePractice = useCallback(async (next: Practice) => {
    await putPractice(next)
    setPractices((prev) => {
      const exists = prev.some((p) => p.id === next.id)
      const list = exists ? prev.map((p) => (p.id === next.id ? next : p)) : [next, ...prev]
      return [...list].sort((a, b) => b.createdAt - a.createdAt)
    })
  }, [])

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeId) return
      abortRef.current?.abort()
      abortRef.current = null
      setActiveId(id)
      const target = practices.find((p) => p.id === id)
      setTab(target?.stage ?? 'lecture')
    },
    [activeId, practices],
  )

  /** 新建一次实操：选定主题后自动进入"讲"tab 并流式生成讲义 */
  const handleCreate = useCallback(
    async (topic: string) => {
      const now = Date.now()
      const practice: Practice = {
        id: uid('pr_'),
        topic,
        stage: 'lecture',
        lecture: '',
        learnLog: '',
        exercises: [],
        reviewReport: '',
        messages: [],
        createdAt: now,
        updatedAt: now,
      }
      try {
        await savePractice(practice)
        setActiveId(practice.id)
        setTab('lecture')
        setCreating(false)

        // 流式生成讲义
        const controller = new AbortController()
        abortRef.current = controller
        try {
          const full = await streamChat(buildPracticeLectureMessages(topic), {
            signal: controller.signal,
            temperature: 0.4,
            onDelta: () => {},
          })
          if (full.trim()) {
            await savePractice({ ...practice, lecture: full, updatedAt: Date.now() })
          } else {
            toast.error('讲义生成失败，请点击重新生成')
          }
        } catch (err) {
          const aborted = err instanceof DOMException && err.name === 'AbortError'
          if (!aborted) toast.error(err instanceof Error ? err.message : '讲义生成失败')
        } finally {
          abortRef.current = null
        }
      } catch (err) {
        toast.error(err instanceof Error ? `创建失败：${err.message}` : '创建失败')
      }
    },
    [savePractice],
  )

  const handleDelete = useCallback(
    async (practice: Practice) => {
      if (!window.confirm(`确认删除实操「${practice.topic}」？全部记录将一并删除。`)) return
      try {
        if (practice.id === activeId) {
          abortRef.current?.abort()
          abortRef.current = null
        }
        await deletePractice(practice.id)
        setPractices((prev) => {
          const next = prev.filter((p) => p.id !== practice.id)
          if (activeId === practice.id) {
            setActiveId(next[0]?.id ?? null)
            setTab(next[0]?.stage ?? 'lecture')
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

  /** 切换阶段 tab 时同步更新 practice.stage */
  const handleSwitchTab = useCallback(
    (next: Tab) => {
      setTab(next)
      if (active && active.stage !== next) {
        void savePractice({ ...active, stage: next, updatedAt: Date.now() })
      }
    },
    [active, savePractice],
  )

  return (
    <div className="flex h-full">
      {/* 左侧：实操列表 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/60">
        <div className="border-b border-slate-100 p-3">
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-3 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
          >
            <Plus size={15} />
            新建实操
          </button>
        </div>

        {creating && <CreatePracticeForm topics={PRACTICE_TOPICS} onSubmit={handleCreate} onCancel={() => setCreating(false)} />}

        <div className="flex-1 overflow-y-auto p-2">
          {practices.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-14 text-center">
              <GraduationCap size={22} className="text-slate-200" />
              <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
                还没有实操记录
                <br />
                选一个主题开始学练
              </p>
            </div>
          ) : (
            practices.map((p) => (
              <div
                key={p.id}
                onClick={() => handleSelect(p.id)}
                className={`group mb-1 cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
                  p.id === activeId ? 'bg-primary-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GraduationCap
                    size={13}
                    className={p.id === activeId ? 'shrink-0 text-primary-500' : 'shrink-0 text-slate-300'}
                  />
                  <span
                    className={`truncate text-[13px] ${p.id === activeId ? 'font-medium text-primary-700' : 'text-slate-600'}`}
                    title={p.topic}
                  >
                    {p.topic}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(p)
                    }}
                    className="ml-auto hidden shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-500 group-hover:block"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="mt-1 pl-5 text-[11px] text-slate-300">
                  {TABS.find((t) => t.key === p.stage)?.label ?? '讲'} 阶段 · {formatDate(p.updatedAt)}
                </p>
              </div>
            ))
          )}
        </div>

        {/* 历史复盘只读入口 */}
        <button
          onClick={() => navigate('/reviews')}
          className="m-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-[11.5px] text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-500"
          title="查看迁移前的复盘对话与报告（只读）"
        >
          <ChevronRight size={12} />
          历史复盘记录（已迁移）
        </button>
      </aside>

      {/* 右侧 */}
      {active ? (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 顶栏：主题 + tab 切换 */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white/70 px-6 py-3 backdrop-blur">
            <h2 className="truncate text-[14px] font-medium text-slate-700" title={active.topic}>
              {active.topic}
            </h2>
            <div className="ml-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
              {TABS.map((t) => {
                const Icon = t.icon
                const isActive = tab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => handleSwitchTab(t.key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      isActive ? 'bg-primary-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    <Icon size={13} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 内容区 */}
          {tab === 'lecture' && (
            <LecturePane
              practice={active}
              onRegenerate={async (p) => {
                const controller = new AbortController()
                abortRef.current = controller
                try {
                  const full = await streamChat(buildPracticeLectureMessages(p.topic), {
                    signal: controller.signal,
                    temperature: 0.4,
                  })
                  if (full.trim()) {
                    await savePractice({ ...p, lecture: full, updatedAt: Date.now() })
                    toast.success('讲义已重新生成')
                  } else {
                    toast.error('讲义生成失败')
                  }
                } catch (err) {
                  if (!(err instanceof DOMException && err.name === 'AbortError')) {
                    toast.error(err instanceof Error ? err.message : '生成失败')
                  }
                } finally {
                  abortRef.current = null
                }
              }}
            />
          )}

          {tab === 'learn' && (
            <LearnPane
              practice={active}
              onSave={async (p, learnLog) => {
                await savePractice({ ...p, learnLog, updatedAt: Date.now() })
                toast.success('已保存入库实训记录')
              }}
            />
          )}

          {tab === 'practice' && (
            <PracticePane
              practice={active}
              onAddExercise={async (p, level) => {
                try {
                  const raw = await chatCompletion(
                    buildPracticeExerciseMessages({ topic: p.topic, level, count: 1 }),
                    0.6,
                  )
                  const parsed = parsePracticeExercises(raw)
                  if (parsed.length === 0) {
                    toast.error('出题失败，请重试')
                    return
                  }
                  const newExs: PracticeExercise[] = parsed.map((q) => ({
                    id: uid('ex_'),
                    level,
                    question: q.question,
                    hint: q.hint,
                    userAnswer: '',
                    createdAt: Date.now(),
                  }))
                  await savePractice({
                    ...p,
                    exercises: [...p.exercises, ...newExs],
                    updatedAt: Date.now(),
                  })
                } catch (err) {
                  if (!(err instanceof DOMException && err.name === 'AbortError')) {
                    toast.error(err instanceof Error ? err.message : '出题失败')
                  }
                }
              }}
              onAnswer={async (p, exId, answer) => {
                const nextExs = p.exercises.map((e) => (e.id === exId ? { ...e, userAnswer: answer } : e))
                await savePractice({ ...p, exercises: nextExs, updatedAt: Date.now() })
              }}
              onGrade={async (p, exId) => {
                const ex = p.exercises.find((e) => e.id === exId)
                if (!ex) return
                if (!ex.userAnswer.trim()) {
                  toast.error('请先作答再提交批改')
                  return
                }
                try {
                  const raw = await chatCompletion(
                    buildPracticeGradingMessages({
                      topic: p.topic,
                      question: ex.question,
                      hint: ex.hint,
                      userAnswer: ex.userAnswer,
                    }),
                    0.3,
                  )
                  const grading = parsePracticeGrading(raw)
                  const nextExs = p.exercises.map((e) =>
                    e.id === exId
                      ? {
                          ...e,
                          score: grading.score,
                          grading: `**得分：${grading.score}**\n\n${grading.feedback}${grading.weakPoints.length > 0 ? `\n\n### 知识点盲区\n${grading.weakPoints.map((w) => `- ${w}`).join('\n')}` : ''}${grading.suggestions.length > 0 ? `\n\n### 优化方案\n${grading.suggestions.map((s) => `- ${s}`).join('\n')}` : ''}`,
                          gradedAt: Date.now(),
                        }
                      : e,
                  )
                  await savePractice({ ...p, exercises: nextExs, updatedAt: Date.now() })
                  toast.success('批改完成')
                  setTab('grade')
                } catch (err) {
                  if (!(err instanceof DOMException && err.name === 'AbortError')) {
                    toast.error(err instanceof Error ? err.message : '批改失败')
                  }
                } finally {
                  abortRef.current = null
                }
              }}
            />
          )}

          {tab === 'grade' && <GradePane practice={active} />}

          {tab === 'review' && (
            <ReviewPane
              practice={active}
              onGenerate={async (p) => {
                const controller = new AbortController()
                abortRef.current = controller
                try {
                  const full = await streamChat(buildPracticeReviewMessages(p), {
                    signal: controller.signal,
                    temperature: 0.4,
                  })
                  if (full.trim()) {
                    await savePractice({ ...p, reviewReport: full, updatedAt: Date.now() })
                    toast.success('复盘报告已生成')
                  } else {
                    toast.error('报告生成失败')
                  }
                } catch (err) {
                  if (!(err instanceof DOMException && err.name === 'AbortError')) {
                    toast.error(err instanceof Error ? err.message : '生成失败')
                  }
                } finally {
                  abortRef.current = null
                }
              }}
              onSaveReport={async (p, content) => {
                await savePractice({ ...p, reviewReport: content, updatedAt: Date.now() })
                toast.success('报告已保存')
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
            <GraduationCap size={26} />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">学练实操 · 讲学练评复盘五闭环</p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">
            RAG / 向量库 / 工作流 实战实训
            <br />
            点击左上角「新建实操」选择学习主题
          </p>
        </div>
      )}
    </div>
  )
}

/* ---------------- 新建实操表单 ---------------- */

function CreatePracticeForm({
  topics,
  onSubmit,
  onCancel,
}: {
  topics: readonly string[]
  onSubmit: (topic: string) => Promise<void>
  onCancel: () => void
}) {
  const [topic, setTopic] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const valid = topic.trim().length >= 2

  const submit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(topic.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-b border-slate-100 p-3">
      <p className="mb-1.5 text-[11px] font-medium text-slate-500">选择学习主题</p>
      <div className="flex flex-wrap gap-1">
        {topics.map((t) => (
          <button
            key={t}
            onClick={() => setTopic(t)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              topic === t ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="或自定义主题，如：知识库增量入库"
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => void submit()}
          disabled={!valid || submitting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
        >
          {submitting ? <><Loader2 size={12} className="animate-spin" /> 生成讲义中…</> : '开始学练'}
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

/* ---------------- 讲 tab ---------------- */

function LecturePane({ practice, onRegenerate }: { practice: Practice; onRegenerate: (p: Practice) => Promise<void> }) {
  const [regenerating, setRegenerating] = useState(false)
  const html = useMemo(() => renderMarkdown(practice.lecture), [practice.lecture])

  const handleRegen = async () => {
    setRegenerating(true)
    try {
      await onRegenerate(practice)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-white/70 px-6 py-2.5 backdrop-blur">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] font-medium text-primary-600">讲 · 结构化教学</span>
        <button
          onClick={() => void handleRegen()}
          disabled={regenerating}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
        >
          {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {regenerating ? '生成中…' : practice.lecture ? '重新生成讲义' : '生成讲义'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {!practice.lecture && !regenerating ? (
            <EmptyHint text="尚未生成讲义，点击右上角「生成讲义」开始学习。" />
          ) : regenerating && !practice.lecture ? (
            <LoadingHint text="讲义生成中，请稍候…" />
          ) : (
            <div className="rounded-2xl border border-slate-200/70 bg-white p-7 shadow-card">
              <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- 学 tab ---------------- */

function LearnPane({
  practice,
  onSave,
}: {
  practice: Practice
  onSave: (p: Practice, learnLog: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(practice.learnLog)
  const dirty = draft !== practice.learnLog
  const savingRef = useRef(false)

  useEffect(() => setDraft(practice.learnLog), [practice.id, practice.learnLog])

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      await onSave(practice, draft)
    } finally {
      savingRef.current = false
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-white/70 px-6 py-2.5 backdrop-blur">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] font-medium text-primary-600">学 · 私有知识库入库实训</span>
        <button
          onClick={() => void handleSave()}
          disabled={!dirty}
          className="ml-auto rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
        >
          保存记录
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-xl border border-primary-200/70 bg-primary-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-primary-700">
            <p className="font-medium">入库实操引导</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
              <li>前往「个人素材库」上传资料（AI 产品文档、行业报告、PRD 案例）。</li>
              <li>自主配置 Chunk 大小、重叠度、分块策略、Embedding 模型。</li>
              <li>完成文档解析、分块预览、向量化入库。</li>
              <li>自定义问题做召回测试，记录命中率与漏召原因。</li>
            </ol>
            <p className="mt-1.5 text-[11px] text-primary-500">所有入库资料专属你的个人产品知识库，AI 产品专家 Skill 可全局调用。</p>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            placeholder={`记录本次入库实训的参数与结果，例如：\n\n- Chunk 大小：512\n- 重叠度：80\n- 分块策略：语义分块\n- Embedding 模型：embedding-3\n- 召回测试：\n  Q1：xxx → 命中 3/5，漏召原因：分块过细导致上下文割裂\n  Q2：xxx → 命中 5/5`}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed text-slate-700 shadow-card outline-none placeholder:text-slate-300 focus:border-primary-300"
          />
        </div>
      </div>
    </div>
  )
}

/* ---------------- 练 tab ---------------- */

function PracticePane({
  practice,
  onAddExercise,
  onAnswer,
  onGrade,
}: {
  practice: Practice
  onAddExercise: (p: Practice, level: ExerciseLevel) => Promise<void>
  onAnswer: (p: Practice, exId: string, answer: string) => Promise<void>
  onGrade: (p: Practice, exId: string) => Promise<void>
}) {
  const [adding, setAdding] = useState<ExerciseLevel | null>(null)
  const [gradingId, setGradingId] = useState<string | null>(null)

  const handleAdd = async (level: ExerciseLevel) => {
    setAdding(level)
    try {
      await onAddExercise(practice, level)
    } finally {
      setAdding(null)
    }
  }

  const handleGrade = async (exId: string) => {
    setGradingId(exId)
    try {
      await onGrade(practice, exId)
    } finally {
      setGradingId(null)
    }
  }

  const levels: ExerciseLevel[] = ['basic', 'handsOn', 'case']

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-white/70 px-6 py-2.5 backdrop-blur">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] font-medium text-primary-600">练 · 分层实操习题</span>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {levels.map((level) => {
            const meta = EXERCISE_LEVEL_META[level]
            const exs = practice.exercises.filter((e) => e.level === level)
            return (
              <section key={level} className="rounded-2xl border border-slate-200/70 bg-white/60 p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-semibold text-slate-700">{meta.label}</h3>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{meta.desc}</p>
                  </div>
                  <button
                    onClick={() => void handleAdd(level)}
                    disabled={adding === level}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-[12px] font-medium text-primary-600 transition-colors hover:bg-primary-100 disabled:opacity-50"
                  >
                    {adding === level ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {adding === level ? '出题中…' : '再来一题'}
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {exs.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-400">本组暂无题目，点击「再来一题」开始。</p>
                  ) : (
                    exs.map((ex) => (
                      <ExerciseCard
                        key={ex.id}
                        exercise={ex}
                        grading={gradingId === ex.id}
                        onAnswer={(answer) => void onAnswer(practice, ex.id, answer)}
                        onGrade={() => void handleGrade(ex.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ExerciseCard({
  exercise,
  grading,
  onAnswer,
  onGrade,
}: {
  exercise: PracticeExercise
  grading: boolean
  onAnswer: (answer: string) => void
  onGrade: () => void
}) {
  const [draft, setDraft] = useState(exercise.userAnswer)
  useEffect(() => setDraft(exercise.userAnswer), [exercise.userAnswer])
  const questionHtml = useMemo(() => renderMarkdown(exercise.question), [exercise.question])
  const hintHtml = useMemo(() => renderMarkdown(exercise.hint ?? ''), [exercise.hint])
  const gradingHtml = useMemo(() => renderMarkdown(exercise.grading ?? ''), [exercise.grading])

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="md-body text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: questionHtml }} />
      {exercise.hint && (
        <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600">操作步骤 / 验收标准 / 常见错误 / 优化方向</summary>
          <div className="md-body mt-1.5 text-[12px]" dangerouslySetInnerHTML={{ __html: hintHtml }} />
        </details>
      )}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== exercise.userAnswer && onAnswer(draft)}
        rows={4}
        placeholder="在此作答，失焦自动保存；完成后点「提交批改」"
        className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-[13px] leading-relaxed text-slate-700 outline-none placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onGrade}
          disabled={grading || !draft.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
        >
          {grading ? <Loader2 size={12} className="animate-spin" /> : <ClipboardCheck size={12} />}
          {grading ? '批改中…' : '提交批改'}
        </button>
        {typeof exercise.score === 'number' && (
          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${
            exercise.score >= 80 ? 'bg-emerald-50 text-emerald-600' : exercise.score >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-500'
          }`}>
            得分 {exercise.score}
          </span>
        )}
      </div>
      {exercise.grading && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="md-body text-[12.5px]" dangerouslySetInnerHTML={{ __html: gradingHtml }} />
        </div>
      )}
    </div>
  )
}

/* ---------------- 评 tab ---------------- */

function GradePane({ practice }: { practice: Practice }) {
  const graded = practice.exercises.filter((e) => typeof e.score === 'number' && e.grading)
  const avg =
    graded.length > 0
      ? Math.round(graded.reduce((s, e) => s + (e.score ?? 0), 0) / graded.length)
      : null

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-white/70 px-6 py-2.5 backdrop-blur">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] font-medium text-primary-600">评 · 自动作业批改总览</span>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {graded.length === 0 ? (
            <EmptyHint text="还没有批改记录。先到「练」tab 作答并提交批改。" />
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-2xl border border-primary-200/70 bg-primary-50/60 px-5 py-4">
                <div className="text-[28px] font-semibold text-primary-600">{avg}</div>
                <div className="text-[12.5px] leading-relaxed text-primary-700">
                  <p>本次实操平均分</p>
                  <p className="text-[11px] text-primary-500">共 {graded.length} 题已批改</p>
                </div>
              </div>
              {graded.map((ex, i) => (
                <GradeCard key={ex.id} ex={ex} index={i} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 单条批改卡片（独立子组件以合法调用 useMemo） */
function GradeCard({ ex, index }: { ex: PracticeExercise; index: number }) {
  const gradingHtml = useMemo(() => renderMarkdown(ex.grading ?? ''), [ex.grading])
  const score = ex.score ?? 0
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
          {EXERCISE_LEVEL_META[ex.level].label} · 题 {index + 1}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${
          score >= 80 ? 'bg-emerald-50 text-emerald-600' : score >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-500'
        }`}>
          得分 {ex.score}
        </span>
      </div>
      <div className="md-body mt-3 text-[12.5px]" dangerouslySetInnerHTML={{ __html: gradingHtml }} />
    </div>
  )
}

/* ---------------- 复盘 tab ---------------- */

function ReviewPane({
  practice,
  onGenerate,
  onSaveReport,
}: {
  practice: Practice
  onGenerate: (p: Practice) => Promise<void>
  onSaveReport: (p: Practice, content: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [draft, setDraft] = useState(practice.reviewReport)
  const [generating, setGenerating] = useState(false)
  const dirty = draft !== practice.reviewReport
  const html = useMemo(() => renderMarkdown(draft), [draft])

  useEffect(() => setDraft(practice.reviewReport), [practice.id, practice.reviewReport])

  const handleGenerate = async () => {
    if (practice.exercises.length === 0 && !practice.learnLog) {
      toast.error('尚无实操记录：请先到「学/练」tab 完成入库与作答')
      return
    }
    setGenerating(true)
    try {
      await onGenerate(practice)
    } finally {
      setGenerating(false)
    }
  }

  const exportMd = () => {
    const text = `# 学练复盘报告：${practice.topic}\n\n> 生成时间：${new Date(practice.updatedAt).toLocaleString('zh-CN')}\n\n---\n\n${draft}`
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${practice.topic}-学练复盘.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('报告已导出')
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white/70 px-6 py-2.5 backdrop-blur">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] font-medium text-primary-600">复盘 · 学练实训总结</span>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-500">未保存</span>}
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition-colors ${mode === 'preview' ? 'bg-primary-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Eye size={12} /> 预览
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition-colors ${mode === 'edit' ? 'bg-primary-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Pencil size={12} /> 编辑
            </button>
          </div>
          <button
            onClick={() => dirty && onSaveReport(practice, draft)}
            disabled={!dirty}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
          >
            保存
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {generating ? '生成中…' : practice.reviewReport ? '重新生成' : '生成复盘报告'}
          </button>
          <button
            onClick={exportMd}
            disabled={!practice.reviewReport}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40"
          >
            <Download size={13} /> 导出 .md
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-[12.5px] leading-relaxed text-amber-700">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            <span>复盘报告基于本次学练记录由 AI 总结生成，标有【待核验】处请人工确认事实；支持编辑修订后保存。</span>
          </div>
          {!practice.reviewReport && !generating ? (
            <EmptyHint text="尚未生成复盘报告。完成学练后点击「生成复盘报告」。" />
          ) : generating && !practice.reviewReport ? (
            <LoadingHint text="复盘报告生成中，请稍候…" />
          ) : mode === 'preview' ? (
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

/* ---------------- 通用提示 ---------------- */

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileText size={26} className="text-slate-200" />
      <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-slate-400">{text}</p>
    </div>
  )
}

function LoadingHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500" />
      {text}
    </div>
  )
}
