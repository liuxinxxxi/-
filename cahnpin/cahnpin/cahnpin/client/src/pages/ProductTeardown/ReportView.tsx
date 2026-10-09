import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Eye,
  PencilLine,
  Save,
  Download,
  Copy,
  Check,
  Square,
  ShieldAlert,
  FileText,
  Database,
  Loader2,
} from 'lucide-react'
import { renderMarkdown } from '../../lib/markdown'
import { formatDate } from '../../lib/format'
import { toast } from '../../stores/uiStore'

export interface ReportMeta {
  productName: string
  content: string
  streaming: boolean
  error?: string
  sources: string[]
  attachments: Array<{ name: string; chars: number }>
  model: string
  savedId: string | null
  savedAt: number | null
}

/**
 * 六层拆解报告视图：流式预览 / Markdown 编辑 / 保存 / 导出。
 * 顶部免责声明为产品级强制展示，与模型正文中的声明双保险。
 */
export default function ReportView({
  sessionKey,
  meta,
  onStop,
  onSave,
  onBack,
}: {
  /** 每次生成会话的唯一标识，切换会话时重置编辑态 */
  sessionKey: string
  meta: ReportMeta
  onStop: () => void
  onSave: (content: string) => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [draft, setDraft] = useState(meta.content)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // 切换到新报告会话时重置编辑态
  useEffect(() => {
    setMode('preview')
    setDraft(meta.content)
    stickToBottom.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  // 流式输出时自动跟随到底部（用户主动上滑后停止跟随）
  useEffect(() => {
    setDraft(meta.content)
    const el = scrollRef.current
    if (el && meta.streaming && stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [meta.content, meta.streaming])

  const html = useMemo(() => renderMarkdown(draft), [draft])
  const dirty = draft !== meta.content

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  const exportMd = () => {
    const blob = new Blob([draft], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${meta.productName}-全维度产品拆解报告.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('已导出 Markdown 文件')
  }

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      toast.success('报告已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动选择文本复制')
    }
  }

  const toolBtn =
    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40'

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200/70 bg-canvas/90 px-10 py-3 backdrop-blur">
        <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-primary-600">
          <ArrowLeft size={15} />
          返回
        </button>
        <span className="mx-1 text-slate-200">|</span>

        {/* 预览 / 编辑切换 */}
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] transition-colors ${
              mode === 'preview' ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Eye size={13} />
            预览
          </button>
          <button
            onClick={() => setMode('edit')}
            disabled={meta.streaming}
            title={meta.streaming ? '生成结束后可编辑' : '编辑 Markdown 原文'}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] transition-colors disabled:opacity-40 ${
              mode === 'edit' ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <PencilLine size={13} />
            编辑
          </button>
        </div>

        <button onClick={copyAll} className={toolBtn} disabled={!draft}>
          <Copy size={14} />
          复制
        </button>
        <button onClick={exportMd} className={toolBtn} disabled={!draft}>
          <Download size={14} />
          导出 .md
        </button>

        <div className="ml-auto flex items-center gap-3">
          {meta.streaming ? (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-rose-500 transition-colors hover:bg-rose-50"
            >
              <Square size={13} />
              停止生成
            </button>
          ) : (
            <>
              {dirty && <span className="text-[12px] text-amber-500">有未保存的修改</span>}
              {meta.savedId && !dirty && (
                <span className="flex items-center gap-1 text-[12px] text-emerald-500">
                  <Check size={13} />
                  已保存{meta.savedAt ? ` · ${formatDate(meta.savedAt)}` : ''}
                </span>
              )}
              <button
                onClick={() => onSave(draft)}
                className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
              >
                <Save size={14} />
                {meta.savedId ? '更新保存' : '保存到拆解库'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 报告主体 */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-10 py-8">
          {/* 强制免责条 */}
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-[12.5px] leading-relaxed text-amber-700">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              本报告由 AI 基于所提供材料与公开资料推理生成，事实性信息可能过时或失准，
              <strong>所有定价、数据、融资、功能现状等均需人工核验</strong>；标注【待核验】处表示证据不足。
            </span>
          </div>

          {/* 元信息 */}
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-400">
            <span className="text-[15px] font-semibold text-slate-700">{meta.productName}</span>
            <span>模型：{meta.model}</span>
            {meta.attachments.length > 0 && (
              <span className="flex items-center gap-1">
                <FileText size={12} />
                {meta.attachments.length} 份附件
              </span>
            )}
            {meta.sources.length > 0 && (
              <span className="flex items-center gap-1">
                <Database size={12} />
                {meta.sources.length} 条知识库来源
              </span>
            )}
          </div>

          {/* 来源清单 */}
          {meta.sources.length > 0 && (
            <div className="mb-6 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
              <p className="text-[12px] font-medium text-slate-500">本报告引用的知识库材料</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {meta.sources.map((s) => (
                  <span key={s} className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] text-primary-600">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 内容区 */}
          {mode === 'preview' ? (
            meta.content ? (
              <article
                className="md-body rounded-2xl border border-slate-200/70 bg-white px-9 py-8 shadow-card"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : meta.error ? (
              <div className="rounded-2xl border border-rose-200/70 bg-rose-50/60 px-9 py-16 text-center text-sm text-rose-500 shadow-card">
                {meta.error}
                <div className="mt-2 text-[12.5px] text-slate-400">请返回后补充材料重新生成</div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-9 py-16 text-sm text-primary-500 shadow-card">
                <Loader2 size={16} className="animate-spin" />
                正在组织六层分析框架，流式生成中…
              </div>
            )
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="min-h-[70vh] w-full resize-y rounded-2xl border border-slate-200 bg-white px-7 py-6 font-mono text-[13px] leading-[1.8] text-slate-700 shadow-card outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          )}

          {/* 流式光标提示 */}
          {meta.streaming && meta.content && (
            <div className="mt-3 flex items-center gap-1.5 text-[12px] text-primary-400">
              <span className="inline-block h-3.5 w-[2px] animate-pulse bg-primary-400" />
              AI 正在持续输出…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
