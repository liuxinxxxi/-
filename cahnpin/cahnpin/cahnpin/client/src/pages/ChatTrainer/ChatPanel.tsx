import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Square, Database, Download, Sparkles, Bot } from 'lucide-react'
import type { Conversation, TrainerMessage, TrainerMode } from '../../types'
import { getTrainerModeMeta } from '../../lib/prompts'
import { renderMarkdown } from '../../lib/markdown'
import { toast } from '../../stores/uiStore'

/** 6 项专家 Skill 开场引导语（空会话时展示）；debate 等 fallback 走兜底文案 */
const MODE_GUIDES: Partial<Record<TrainerMode, string>> = {
  brainstorm:
    '把你的模糊想法、需求或痛点丢给我，例如："想给运营做一个自动写商品文案的小工具"。我会输出结构化 AI 产品方案。',
  prd: '用一句话描述你想做的功能或需求，例如："给客服后台做一个 RAG 知识问答入口"。我会扩写成完整可交付 PRD。',
  review:
    '把你的 PRD、产品方案或功能设计粘进来（或描述思路）。我会逐点评审需求漏洞、逻辑 bug、落地难点、体验与技术可行性，并给可直接修改的优化方案。',
  qa: '直接提出你的问题，例如："RAG 中固定分块 vs 语义分块怎么选？"、"Agent 多步推理怎么兜底幻觉？"',
  growth:
    '告诉我你当前的角色、困惑或目标，例如："工作 2 年偏 B 端，想转 AI 产品方向，该补什么？"。我会诊断短板并给学习路线。',
  knowledge:
    '基于你已上传的私有资料提问，例如："根据我素材库里的 PRD 案例，总结一个 RAG 客服产品的核心数据指标设计"。我会优先调取你的资料作答并标注来源。',
}

const FALLBACK_GUIDE = '该模式已下线，仅供查看历史对话。新建会话请选择当前 6 项专家 Skill 之一。'

function getModeGuide(mode: TrainerMode): string {
  return MODE_GUIDES[mode] ?? FALLBACK_GUIDE
}

/**
 * 陪练聊天面板：消息流（Markdown 渲染 + 来源 chips）+ 流式输出 + 输入区。
 * 顶部含模式标识、会话级 RAG 开关与导出。
 */
export default function ChatPanel({
  conversation,
  messages,
  streamingContent,
  streaming,
  hasKnowledge,
  onSend,
  onStop,
  onToggleRag,
}: {
  conversation: Conversation
  messages: TrainerMessage[]
  /** 正在流式生成的 assistant 内容（未落库） */
  streamingContent: string
  streaming: boolean
  hasKnowledge: boolean
  onSend: (text: string) => void
  onStop: () => void
  onToggleRag: () => void
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 新消息/流式增量时滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamingContent, conversation.id])

  // 输入框自适应高度
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }, [input])

  const canSend = input.trim().length > 0 && !streaming

  const handleSend = () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    onSend(text)
  }

  const exportMd = () => {
    if (messages.length === 0) {
      toast.error('暂无可导出的对话内容')
      return
    }
    const meta = getTrainerModeMeta(conversation.mode)
    const lines = [
      `# 陪练会话：${conversation.title}`,
      '',
      `> 模式：${meta.label} · 导出时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '---',
      '',
    ]
    for (const msg of messages) {
      lines.push(msg.role === 'user' ? '**我：**' : '**AI 教练：**')
      lines.push('')
      lines.push(msg.content)
      if (msg.sources && msg.sources.length > 0) {
        lines.push('')
        lines.push(`> 引用素材：${msg.sources.join('、')}`)
      }
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${conversation.title}-陪练对话.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('对话已导出')
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* 会话顶栏 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white/70 px-6 py-3 backdrop-blur">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11.5px] font-medium text-primary-600">
          {getTrainerModeMeta(conversation.mode).label}
        </span>
        <h2 className="truncate text-[14px] font-medium text-slate-700" title={conversation.title}>
          {conversation.title}
        </h2>

        <div className="ml-auto flex items-center gap-2">
          {/* 会话级 RAG 开关 */}
          <button
            onClick={onToggleRag}
            disabled={!hasKnowledge}
            title={
              hasKnowledge
                ? '开启后，每轮自动检索素材库相关片段作为上下文'
                : '素材库为空，先去「个人素材库」上传内容'
            }
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              conversation.useRag
                ? 'border-primary-200 bg-primary-50 text-primary-600'
                : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'
            }`}
          >
            <Database size={13} />
            知识库 {conversation.useRag ? '已开启' : '已关闭'}
          </button>
          <button
            onClick={exportMd}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-slate-100"
          >
            <Download size={13} />
            导出 .md
          </button>
        </div>
      </div>

      {/* 消息区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !streamingContent ? (
          <div className="mx-auto mt-16 max-w-md text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
              <Sparkles size={22} />
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-slate-700">
              {getTrainerModeMeta(conversation.mode).label}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              {getModeGuide(conversation.mode)}
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {/* 流式中的 assistant 消息 */}
            {streaming && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
                  <Bot size={15} />
                </div>
                <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
                  {streamingContent ? (
                    <StreamingBody content={streamingContent} />
                  ) : (
                    <span className="flex items-center gap-2 text-[13px] text-slate-400">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500" />
                      思考中…
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-slate-100 bg-white/70 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={1}
            placeholder="输入你的问题或观点，Enter 发送，Shift+Enter 换行"
            className="max-h-40 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
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
        <p className="mx-auto mt-2 max-w-3xl text-[11px] text-slate-300">
          AI 回答可能失准，事实性内容请人工核验【待核验】标注处
        </p>
      </div>
    </div>
  )
}

/** 已落库的单条消息气泡 */
function MessageBubble({ msg }: { msg: TrainerMessage }) {
  const html = useMemo(() => renderMarkdown(msg.content), [msg.content])

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary-500 px-4 py-3 text-sm leading-relaxed text-white shadow-sm">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
        <Bot size={15} />
      </div>
      <div className="min-w-0 max-w-[85%]">
        <div
          className="md-body rounded-2xl rounded-tl-sm border border-slate-200/70 bg-white px-4 py-3 shadow-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
            <Database size={11} className="text-slate-300" />
            {msg.sources.map((s) => (
              <span
                key={s}
                className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary-600"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 流式渲染（增量 Markdown） */
function StreamingBody({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content])
  return (
    <div className="relative">
      <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
      <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary-400 align-text-bottom" />
    </div>
  )
}
