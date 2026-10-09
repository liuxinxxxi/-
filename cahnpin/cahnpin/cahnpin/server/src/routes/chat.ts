/**
 * 对话代理路由
 *  POST /api/chat  { messages, temperature?, stream?, webSearch? }
 * - stream 默认 true：SSE 透传上游流式响应（阶段 3/4 使用）
 * - stream=false：非流式，上游完整 JSON 原样返回（阶段 5 联网资讯使用，
 *   响应顶层含 web_search 检索结果数组）
 * - webSearch=true 时注入智谱 web_search 工具，模型基于实时检索作答
 */
import { Router } from 'express'
import { loadConfig } from '../config/store.js'

const router = Router()

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

router.post('/', async (req, res) => {
  const cfg = await loadConfig()
  if (!cfg.apiKey) {
    res.status(400).json({ error: '尚未配置 API Key，请先在设置页完成 LLM 配置' })
    return
  }

  const messages = req.body?.messages as ChatMessage[] | undefined
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages 不能为空' })
    return
  }
  const temperature =
    typeof req.body?.temperature === 'number' ? req.body.temperature : 0.3
  const stream = req.body?.stream !== false
  const webSearch = req.body?.webSearch === true

  const upstreamBody: Record<string, unknown> = {
    model: cfg.chatModel,
    messages,
    temperature,
    stream,
    // 六层报告/长文输出；glm-4-flash 实测支持 8192
    max_tokens: 8192,
  }
  // GLM-4.5 及以上支持深度思考（动态思考：模型自行判断是否需要，简单问题不增加延迟）。
  // 旧模型（glm-4 / glm-4-flash / glm-4-air）不识别该参数，传了会 400，故按模型名判断。
  if (/^glm-(4\.[5-9]|5)/i.test(cfg.chatModel.trim())) {
    upstreamBody.thinking = { type: 'enabled' }
  }
  if (webSearch) {
    upstreamBody.tools = [
      { type: 'web_search', web_search: { enable: true, search_result: true } },
    ]
  }

  let controller: AbortController | null = null

  try {
    controller = new AbortController()
    const upstream = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    })

    // 上游非 2xx：读取错误信息后以普通 JSON 返回
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      let message = `对话接口返回 ${upstream.status}`
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } }
        if (parsed.error?.message) message = parsed.error.message
      } catch {
        if (text) message = text.slice(0, 300)
      }
      res.status(502).json({ error: message })
      return
    }

    // 非流式：完整 JSON 透传（含顶层 web_search 检索结果）
    if (!stream) {
      const data = await upstream.json()
      res.json(data)
      return
    }

    // SSE 响应头；X-Accel-Buffering 防止代理缓冲导致流式失效
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // 客户端断开 → 取消上游请求，避免继续计费
    req.on('close', () => {
      controller?.abort()
    })

    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch (err) {
    // 客户端主动中断（AbortError）属正常行为
    if (err instanceof Error && err.name === 'AbortError') {
      if (!res.writableEnded) res.end()
      return
    }
    if (!res.headersSent) {
      res.status(502).json({
        error: `对话请求失败：${err instanceof Error ? err.message : '网络异常'}`,
      })
    } else if (!res.writableEnded) {
      res.end()
    }
  }
})

export default router
