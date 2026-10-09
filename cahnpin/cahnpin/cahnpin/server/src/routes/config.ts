/**
 * LLM 配置路由
 *  GET  /api/config        获取当前配置（API Key 脱敏）
 *  PUT  /api/config        更新配置（apiKey 留空表示不修改）
 *  POST /api/config/test   连通性校验：请求厂商的 OpenAI 兼容 GET /models
 */
import { Router } from 'express'
import { loadConfig, saveConfig, toPublicConfig } from '../config/store.js'

const router = Router()

router.get('/', async (_req, res) => {
  const cfg = await loadConfig()
  res.json(toPublicConfig(cfg))
})

router.put('/', async (req, res) => {
  const { provider, baseUrl, apiKey, chatModel, embeddingModel } = req.body ?? {}
  if (baseUrl !== undefined && !/^https?:\/\/.+/i.test(baseUrl)) {
    res.status(400).json({ error: 'baseUrl 格式不正确，需以 http(s):// 开头' })
    return
  }
  const cfg = await saveConfig({
    provider,
    baseUrl,
    apiKey,
    chatModel,
    embeddingModel,
  })
  res.json(toPublicConfig(cfg))
})

router.post('/test', async (req, res) => {
  // 允许用请求体中的临时配置测试（未保存也可测）；缺省回退到已保存配置
  const saved = await loadConfig()
  const baseUrl = (req.body?.baseUrl ?? saved.baseUrl).replace(/\/+$/, '')
  const apiKey = req.body?.apiKey || saved.apiKey

  if (!apiKey) {
    res.status(400).json({ ok: false, message: '尚未配置 API Key' })
    return
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (resp.ok) {
      res.json({ ok: true, message: '连接成功，API Key 与接口地址校验通过' })
    } else {
      const text = await resp.text().catch(() => '')
      res.status(200).json({
        ok: false,
        message: `服务返回 ${resp.status}：${text.slice(0, 200) || '请检查 API Key 与接口地址'}`,
      })
    }
  } catch (err) {
    res.status(200).json({
      ok: false,
      message: `连接失败：${err instanceof Error ? err.message : '网络异常'}`,
    })
  }
})

export default router
