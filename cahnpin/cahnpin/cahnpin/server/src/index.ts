/**
 * PM 成长工作台 - Express 后端入口
 * MVP 阶段后端保持极薄：仅提供 LLM 配置管理、LLM 代理与文章爬虫能力，
 * 业务数据与文件全部存储在浏览器 IndexedDB 中。
 * 生产模式下同时托管前端构建产物（client/dist），实现单端口部署。
 */
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORT } from './constants.js'
import configRouter from './routes/config.js'
import embeddingsRouter from './routes/embeddings.js'
import chatRouter from './routes/chat.js'
import articlesRouter from './routes/articles.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pm-growth-workbench', time: new Date().toISOString() })
})

app.use('/api/config', configRouter)
app.use('/api/embeddings', embeddingsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/articles', articlesRouter)

// 生产模式：托管前端构建产物（client/dist）
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../../client/dist')
app.use(express.static(distDir))
// SPA fallback：非 /api 路由统一返回 index.html，交给前端路由处理
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({ error: '前端构建产物不存在，请先执行 npm run build' })
    }
  })
})

// 兜底错误处理
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[server error]', err)
    res.status(500).json({ error: '服务内部错误' })
  },
)

app.listen(PORT, () => {
  console.log(`[PM Workbench] server running at http://localhost:${PORT}`)
})
