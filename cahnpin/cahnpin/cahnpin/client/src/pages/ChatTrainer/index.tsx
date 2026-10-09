/**
 * AI 产品专家陪练（阶段 4）
 * 三模式（答疑/复盘/辩论）多轮对话训练；RAG 为会话级开关；
 * 会话与消息持久化到 IndexedDB（conversations / messages）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import SessionList from './SessionList'
import ChatPanel from './ChatPanel'
import { streamChat } from '../../lib/llm'
import { searchRag } from '../../lib/rag'
import { buildTrainerMessages } from '../../lib/prompts'
import {
  countChunks,
  deleteConversationCascade,
  getAllConversations,
  getTrainerMessages,
  putConversation,
  putTrainerMessage,
} from '../../lib/db'
import { uid } from '../../lib/format'
import { toast } from '../../stores/uiStore'
import type { Conversation, TrainerMessage, TrainerMode } from '../../types'

export default function ChatTrainer() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TrainerMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [hasKnowledge, setHasKnowledge] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const active = conversations.find((c) => c.id === activeId) ?? null

  // 初始化：会话列表 + 知识库状态
  useEffect(() => {
    void (async () => {
      try {
        const list = await getAllConversations()
        setConversations(list)
        if (list.length > 0) setActiveId(list[0].id)
      } catch {
        /* DB 暂不可用时保持空 */
      }
      try {
        setHasKnowledge((await countChunks()) > 0)
      } catch {
        /* 同上 */
      }
    })()
  }, [])

  // 切换会话：停止进行中的生成并加载消息
  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    abortRef.current?.abort()
    setStreaming(false)
    setStreamingContent('')
    void getTrainerMessages(activeId)
      .then(setMessages)
      .catch(() => setMessages([]))
  }, [activeId])

  /** 新建会话（选模式） */
  const handleCreate = useCallback(async (mode: TrainerMode) => {
    // knowledge 模式强制依赖知识库：空库直接拦截
    if (mode === 'knowledge' && !hasKnowledge) {
      toast.error('知识库为空，请先去「个人素材库」上传资料后再用知识库联动 Skill')
      return
    }
    const now = Date.now()
    const conv: Conversation = {
      id: uid('cv_'),
      title: `新会话 · ${now % 100000}`,
      mode,
      // knowledge 模式默认强制开启 RAG；其余模式由用户在顶栏手动开启
      useRag: mode === 'knowledge',
      createdAt: now,
      updatedAt: now,
    }
    try {
      await putConversation(conv)
      setConversations((prev) => [conv, ...prev])
      setActiveId(conv.id)
    } catch (err) {
      toast.error(err instanceof Error ? `创建会话失败：${err.message}` : '创建会话失败')
    }
  }, [hasKnowledge])

  const handleRename = useCallback(
    async (id: string, title: string) => {
      const conv = conversations.find((c) => c.id === id)
      if (!conv) return
      try {
        await putConversation({ ...conv, title })
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
      } catch {
        toast.error('重命名失败')
      }
    },
    [conversations],
  )

  const handleDelete = useCallback(
    async (conv: Conversation) => {
      if (!window.confirm(`确认删除会话「${conv.title}」？全部对话记录将一并删除。`)) return
      try {
        await deleteConversationCascade(conv.id)
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== conv.id)
          if (activeId === conv.id) setActiveId(next[0]?.id ?? null)
          return next
        })
        toast.success('会话已删除')
      } catch {
        toast.error('删除失败')
      }
    },
    [activeId],
  )

  const handleToggleRag = useCallback(async () => {
    if (!active) return
    const next = { ...active, useRag: !active.useRag }
    try {
      await putConversation(next)
      setConversations((prev) => prev.map((c) => (c.id === next.id ? next : c)))
      toast.success(next.useRag ? '已开启知识库增强' : '已关闭知识库增强')
    } catch {
      toast.error('切换失败')
    }
  }, [active])

  /** 发送消息：写库 → 可选 RAG → 流式生成 → 落库 */
  const handleSend = useCallback(
    (text: string) => {
      const conv = conversations.find((c) => c.id === activeId)
      if (!conv || streaming) return

      void (async () => {
        const now = Date.now()
        const isFirst = messages.length === 0
        const userMsg: TrainerMessage = {
          id: uid('m_'),
          conversationId: conv.id,
          role: 'user',
          content: text,
          createdAt: now,
        }
        const history = [...messages, userMsg]
        setMessages(history)

        // 首条消息自动生成会话标题；同步更新最近时间
        const updatedConv: Conversation = {
          ...conv,
          title: isFirst ? text.slice(0, 20) : conv.title,
          updatedAt: now,
        }
        try {
          await putTrainerMessage(userMsg)
          await putConversation(updatedConv)
          setConversations((prev) =>
            prev.map((c) => (c.id === conv.id ? updatedConv : c)),
          )
        } catch (err) {
          toast.error(err instanceof Error ? `消息保存失败：${err.message}` : '消息保存失败')
          return
        }

        // RAG 检索（失败降级为纯对话）
        let ragHits: Awaited<ReturnType<typeof searchRag>> = []
        if (conv.useRag) {
          try {
            ragHits = await searchRag(text, { topK: 4 })
          } catch {
            toast.error('知识库检索失败，本轮按纯对话回答')
          }
        }

        const { messages: llmMessages, sources } = buildTrainerMessages({
          mode: conv.mode,
          history: history.map((m) => ({ role: m.role, content: m.content })),
          ragHits,
        })

        const controller = new AbortController()
        abortRef.current = controller
        setStreaming(true)
        setStreamingContent('')

        try {
          const full = await streamChat(llmMessages, {
            signal: controller.signal,
            // 降温减少发散与幻觉（配合 glm-4.6 动态思考，事实性回答更稳）
            temperature: 0.3,
            onDelta: (text) => setStreamingContent(text),
          })
          if (full.trim()) {
            const aiMsg: TrainerMessage = {
              id: uid('m_'),
              conversationId: conv.id,
              role: 'assistant',
              content: full,
              sources: sources.length > 0 ? sources : undefined,
              createdAt: Date.now(),
            }
            try {
              await putTrainerMessage(aiMsg)
            } catch {
              toast.error('回复保存失败，刷新后可能丢失')
            }
            setMessages((prev) => [...prev, aiMsg])
          } else {
            toast.error('模型未返回有效内容，请重试')
          }
        } catch (err) {
          const aborted = err instanceof DOMException && err.name === 'AbortError'
          if (!aborted) toast.error(err instanceof Error ? err.message : '生成失败')
          // 手动停止：已生成内容不落库，用户可重发
        } finally {
          setStreaming(false)
          setStreamingContent('')
          abortRef.current = null
        }
      })()
    },
    [conversations, activeId, messages, streaming],
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return (
    <div className="flex h-full">
      <SessionList
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      {active ? (
        <ChatPanel
          conversation={active}
          messages={messages}
          streamingContent={streamingContent}
          streaming={streaming}
          hasKnowledge={hasKnowledge}
          onSend={handleSend}
          onStop={handleStop}
          onToggleRag={handleToggleRag}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
            <span className="text-2xl">🥊</span>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">AI 产品专家</p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">
            脑暴 · PRD · 评审 · 答疑 · 成长 · 知识库 六项专家 Skill
            <br />
            基于你的知识库作答，点击左上角「新建陪练」开始
          </p>
        </div>
      )}
    </div>
  )
}
