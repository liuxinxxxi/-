/**
 * 全维度产品拆解器（阶段 3 核心模块）
 * 视图状态机：list（历史） → create（新建表单） → report（流式生成/查看/编辑）
 * 上下文：产品名 + 用户补充资料 + 附件解析文本 + 素材库 RAG 片段。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import CreateForm, { type TeardownRequest } from './CreateForm'
import ReportView, { type ReportMeta } from './ReportView'
import TeardownList from './TeardownList'
import { searchRag } from '../../lib/rag'
import { streamChat } from '../../lib/llm'
import { buildTeardownMessages } from '../../lib/prompts'
import {
  deleteTeardown,
  getAllTeardowns,
  putTeardown,
  countChunks,
} from '../../lib/db'
import { api } from '../../lib/api'
import { uid } from '../../lib/format'
import { toast } from '../../stores/uiStore'
import type { Teardown } from '../../types'

type ViewMode = 'list' | 'create' | 'report'

/** 一次生成/查看会话（未保存时仅存内存） */
interface Session {
  sessionKey: string
  productName: string
  content: string
  streaming: boolean
  error?: string
  sources: string[]
  attachments: Array<{ name: string; chars: number }>
  brief: string
  model: string
  savedId: string | null
  savedAt: number | null
}

export default function ProductTeardown() {
  const [view, setView] = useState<ViewMode>('list')
  const [reports, setReports] = useState<Teardown[]>([])
  const [hasKnowledge, setHasKnowledge] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [starting, setStarting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 初始化：历史报告 + 知识库是否非空
  useEffect(() => {
    void (async () => {
      try {
        setReports(await getAllTeardowns())
      } catch {
        /* 数据库暂不可用时保持空列表 */
      }
      try {
        setHasKnowledge((await countChunks()) > 0)
      } catch {
        /* 同上 */
      }
    })()
  }, [])

  const patchSession = useCallback((patch: Partial<Session>) => {
    setSession((s) => (s ? { ...s, ...patch } : s))
  }, [])

  /** 生成报告 */
  const handleStart = useCallback(
    async (req: TeardownRequest) => {
      setStarting(true)
      try {
        let ragHits: Awaited<ReturnType<typeof searchRag>> = []
        let model = '当前配置模型'

        // 1) 知识库检索（失败不阻断主流程，降级为仅用附件/公开知识）
        if (req.useRag) {
          try {
            const query = `${req.productName} ${req.brief.slice(0, 200)}`.trim()
            ragHits = await searchRag(query, { topK: 6 })
          } catch {
            toast.error('知识库检索失败，已降级为仅基于附件与公开知识生成')
          }
        }

        // 2) 读取当前对话模型名用于展示
        try {
          const cfg = await api.getConfig()
          model = cfg.chatModel
        } catch {
          /* 展示失败不影响生成 */
        }

        // 3) 组装会话与 Prompt
        const { messages, sources } = buildTeardownMessages({
          productName: req.productName,
          brief: req.brief,
          attachments: req.attachments.map((a) => ({ name: a.name, text: a.text })),
          ragHits,
        })

        const newSession: Session = {
          sessionKey: uid('s_'),
          productName: req.productName,
          content: '',
          streaming: true,
          sources,
          attachments: req.attachments.map((a) => ({ name: a.name, chars: a.chars })),
          brief: req.brief,
          model,
          savedId: null,
          savedAt: null,
        }
        setSession(newSession)
        setView('report')
        setStarting(false)

      // 4) 流式生成
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const full = await streamChat(messages, {
          signal: controller.signal,
          temperature: 0.3,
          onDelta: (text) => patchSession({ content: text }),
        })
        if (!full.trim()) {
          patchSession({ streaming: false, error: '模型未返回有效内容，请调整材料后重试' })
          toast.error('未生成有效内容')
        } else {
          patchSession({ streaming: false })
          toast.success('报告生成完成，可编辑、保存或导出')
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError'
        patchSession({
          streaming: false,
          error: aborted ? '已手动停止，已生成内容保留在下方' : err instanceof Error ? err.message : '生成失败',
        })
        if (!aborted) toast.error(err instanceof Error ? err.message : '生成失败')
      } finally {
        abortRef.current = null
      }
      } catch (err) {
        // 组装阶段的任何异常都不应让页面卡死或白屏
        setStarting(false)
        toast.error(err instanceof Error ? `启动生成失败：${err.message}` : '启动生成失败')
      }
    },
    [patchSession],
  )

  /** 停止生成（保留已输出内容） */
  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** 保存（新建或更新） */
  const handleSave = useCallback(
    async (content: string) => {
      if (!session || !content.trim()) return
      try {
        const now = Date.now()
        if (session.savedId) {
          const existing = reports.find((r) => r.id === session.savedId)
          if (existing) {
            const updated: Teardown = { ...existing, content, updatedAt: now }
            await putTeardown(updated)
            setReports(await getAllTeardowns())
            patchSession({ content, savedAt: now })
            toast.success('报告已更新')
          }
          return
        }

        const report: Teardown = {
          id: uid('t_'),
          productName: session.productName,
          content,
          attachments: session.attachments,
          sources: session.sources,
          brief: session.brief.slice(0, 200),
          model: session.model,
          createdAt: now,
          updatedAt: now,
        }
        await putTeardown(report)
        setReports(await getAllTeardowns())
        patchSession({ content, savedId: report.id, savedAt: now })
        toast.success('已保存到拆解库')
      } catch (err) {
        toast.error(err instanceof Error ? `保存失败：${err.message}` : '保存失败')
      }
    },
    [session, reports, patchSession],
  )

  /** 打开历史报告 */
  const handleOpen = useCallback((report: Teardown) => {
    setSession({
      sessionKey: uid('s_'),
      productName: report.productName,
      content: report.content,
      streaming: false,
      sources: report.sources,
      attachments: report.attachments,
      brief: report.brief,
      model: report.model,
      savedId: report.id,
      savedAt: report.updatedAt,
    })
    setView('report')
  }, [])

  const handleDelete = useCallback(
    async (report: Teardown) => {
      if (!window.confirm(`确认删除《${report.productName}》的拆解报告？此操作不可恢复。`)) return
      await deleteTeardown(report.id)
      setReports((prev) => prev.filter((r) => r.id !== report.id))
      if (session?.savedId === report.id) {
        setSession(null)
        setView('list')
      }
      toast.success('已删除')
    },
    [session],
  )

  /** 从报告返回；若仍在生成则先停止 */
  const handleBack = useCallback(() => {
    if (session?.streaming) abortRef.current?.abort()
    setSession(null)
    setView('list')
  }, [session])

  if (view === 'report' && session) {
    const meta: ReportMeta = {
      productName: session.productName,
      content: session.content,
      streaming: session.streaming,
      error: session.error,
      sources: session.sources,
      attachments: session.attachments,
      model: session.model,
      savedId: session.savedId,
      savedAt: session.savedAt,
    }
    return (
      <ReportView
        sessionKey={session.sessionKey}
        meta={meta}
        onStop={handleStop}
        onSave={handleSave}
        onBack={handleBack}
      />
    )
  }

  if (view === 'create') {
    return (
      <div className="page-container max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-800">全维度产品拆解器</h1>
        <div className="mt-6">
          <CreateForm
            hasKnowledge={hasKnowledge}
            starting={starting}
            onStart={handleStart}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  return <TeardownList reports={reports} onNew={() => setView('create')} onOpen={handleOpen} onDelete={handleDelete} />
}
