/**
 * Embedding 代理路由
 *  POST /api/embeddings  { input: string | string[] }
 * 统一转发到已配置厂商的 OpenAI 兼容 /embeddings 接口（当前为智谱 embedding-3）。
 * API Key 只在服务端读取，浏览器侧拿不到密钥。
 */
import { Router } from 'express'
import { loadConfig } from '../config/store.js'

const router = Router()

/** 单批最多文本条数，避免超长请求 */
const MAX_BATCH = 64

router.post('/', async (req, res) => {
  const cfg = await loadConfig()
  if (!cfg.apiKey) {
    res.status(400).json({ error: '尚未配置 API Key，请先在设置页完成 LLM 配置' })
    return
  }
  if (!cfg.embeddingModel) {
    res.status(400).json({ error: '尚未配置向量化模型（Embedding Model）' })
    return
  }

  const rawInput = req.body?.input
  const inputs: string[] = Array.isArray(rawInput) ? rawInput : [rawInput]
  if (inputs.length === 0 || inputs.some((t) => typeof t !== 'string' || !t.trim())) {
    res.status(400).json({ error: 'input 必须为非空字符串或字符串数组' })
    return
  }
  if (inputs.length > MAX_BATCH) {
    res.status(400).json({ error: `单批最多 ${MAX_BATCH} 条文本` })
    return
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    const resp = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: cfg.embeddingModel, input: inputs }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const payload = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      const message =
        (payload as { error?: { message?: string } })?.error?.message ??
        `向量化接口返回 ${resp.status}`
      res.status(502).json({ error: message })
      return
    }
    // 直接回传 { data: [{ embedding }], usage, model }
    res.json(payload)
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    res.status(502).json({
      error: aborted
        ? '向量化请求超时'
        : `向量化请求失败：${err instanceof Error ? err.message : '网络异常'}`,
    })
  }
})

export default router
