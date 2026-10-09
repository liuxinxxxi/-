/**
 * LLM 能力客户端：所有调用经本地 Express 代理，API Key 不下发浏览器。
 * - embedTexts：文本向量化（阶段 2）
 * - streamChat：SSE 流式对话（阶段 3 起）
 */
import { request } from './api'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamOptions {
  /** 每收到增量时回调，参数为截止当前的完整文本与本次增量 */
  onDelta?: (full: string, delta: string) => void
  /** 用于主动停止生成 */
  signal?: AbortSignal
  temperature?: number
  /** 开启智谱 web_search 联网检索工具（阶段 7 案例复盘使用） */
  webSearch?: boolean
}

/**
 * 流式对话：POST /api/chat（SSE），逐块解析 OpenAI 兼容协议。
 * 返回完整回答文本；网络/上游错误以异常抛出。
 */
export async function streamChat(
  messages: ChatMessage[],
  opts: StreamOptions = {},
): Promise<string> {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.webSearch ? { webSearch: true } : {}),
    }),
    signal: opts.signal,
  })

  if (!resp.ok || !resp.body) {
    const data = await resp.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `对话请求失败（${resp.status}）`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let finishReason: string | null = null

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') return
    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
      }
      const choice = json.choices?.[0]
      if (choice?.finish_reason) finishReason = choice.finish_reason
      const delta = choice?.delta?.content
      if (delta) {
        full += delta
        opts.onDelta?.(full, delta)
      }
    } catch {
      // 忽略不完整/非 JSON 的心跳行
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE 以换行分隔事件；保留最后一个可能不完整的片段在 buffer 中
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handleLine(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
    }
  }
  handleLine(buffer)

  // 命中输出长度上限：在文末给出显式警示，避免半截报告被误当完整成品保存
  if (finishReason === 'length' && full.trim()) {
    full += '\n\n---\n\n> ⚠️ **输出已达模型单次长度上限，后半部分可能未生成完整。** 可切换到编辑模式续写，或精简材料后重新生成。'
    opts.onDelta?.(full, '')
  }

  return full
}

interface EmbeddingResponse {
  data: Array<{ index?: number; embedding: number[] }>
  usage?: { total_tokens: number }
  model?: string
}

/** 单批文本数（服务端上限 64，前端保守取 16，平衡请求数与超时风险） */
const EMBED_BATCH = 16

/**
 * 批量文本向量化。返回与入参顺序一致的 Float32Array（embedding-3 为 2048 维）。
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const result: Float32Array[] = []

  for (let start = 0; start < texts.length; start += EMBED_BATCH) {
    const batch = texts.slice(start, start + EMBED_BATCH)
    const resp = await request<EmbeddingResponse>('/api/embeddings', {
      method: 'POST',
      body: JSON.stringify({ input: batch }),
    })
    // 按 index 归位（防止厂商乱序），缺失 index 时按返回顺序
    const ordered = [...resp.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    if (ordered.length !== batch.length) {
      throw new Error('向量化返回数量与请求不一致，请稍后重试')
    }
    for (const item of ordered) {
      result.push(new Float32Array(item.embedding))
    }
  }

  return result
}

/* ---------------- 联网检索对话（阶段 5） ---------------- */

/** 搜索工具返回的检索结果（响应顶层 web_search 数组的元素，已规范化字段） */
export interface WebSearchRef {
  title: string
  /** 来源页 URL（智谱字段名为 link；refer 只是引用编号） */
  url?: string
  /** 来源平台/媒体名，如「知乎专栏」 */
  media?: string
  publishDate?: string
}

interface NonStreamChatResponse {
  choices?: Array<{ message?: { content?: string } }>
  // 智谱 web_search：URL 在 link 字段；refer 仅为引用编号（如 ref_1），不是链接
  web_search?: Array<{ title?: string; publish_date?: string; refer?: string; link?: string; media?: string }>
}

/**
 * 联网检索对话：非流式，模型自动调用 web_search 工具后作答。
 * 返回回答文本与检索命中的网页列表（供来源参考展示）。
 *
 * 智谱 glm-4 偶发不触发 web_search 工具（直接凭记忆编造），
 * 当 searchRefs 为空时自动重试，重试时在 messages 前加一条强提醒。
 * 最多尝试 maxAttempts 次（默认 3 = 1 次首发 + 2 次重试）。
 */
export async function chatWithSearch(
  messages: ChatMessage[],
  opts: { maxAttempts?: number } = {},
): Promise<{ content: string; searchRefs: WebSearchRef[] }> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)

  const parseResp = (data: NonStreamChatResponse) => {
    const content = data.choices?.[0]?.message?.content ?? ''
    const searchRefs: WebSearchRef[] = (data.web_search ?? [])
      .filter((w) => typeof w.title === 'string' && w.title)
      .map((w) => ({
        // 智谱标题常带「（发布时间：YYYY-MM-DD HH:mm:ss）」后缀，日期另有字段，去除冗余
        title: (w.title as string).replace(/（发布时间：[^）]*）\s*$/g, '').trim(),
        url: typeof w.link === 'string' && /^https?:\/\//.test(w.link.trim()) ? w.link.trim() : undefined,
        media: typeof w.media === 'string' && w.media.trim() ? w.media.trim() : undefined,
        publishDate: w.publish_date,
      }))
    return { content, searchRefs }
  }

  let lastResult: { content: string; searchRefs: WebSearchRef[] } = { content: '', searchRefs: [] }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const retryHint =
      attempt > 1
        ? [
            {
              role: 'system' as const,
              content:
                '【重要提醒】上次请求未触发 web_search 工具或工具零结果。本次必须首先调用 web_search 工具至少 3 次；若工具仍未返回任何结果，直接输出空数组 []，不要凭记忆编造任何内容。',
            },
            ...messages,
          ]
        : messages

    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: retryHint, stream: false, webSearch: true, temperature: 0.3 }),
    })

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error ?? `检索请求失败（${resp.status}）`)
    }

    const data = (await resp.json()) as NonStreamChatResponse
    lastResult = parseResp(data)
    // 命中有效检索结果，停止重试
    if (lastResult.searchRefs.length > 0) break
  }

  return lastResult
}

/**
 * 通用非流式对话（不联网）。用于基于用户提供材料生成结构化结果的场景。
 */
export async function chatCompletion(
  messages: ChatMessage[],
  temperature = 0.3,
): Promise<string> {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: false, temperature }),
  })

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `请求失败（${resp.status}）`)
  }

  const data = (await resp.json()) as NonStreamChatResponse
  return data.choices?.[0]?.message?.content ?? ''
}
