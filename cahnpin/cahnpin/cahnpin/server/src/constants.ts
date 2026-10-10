/**
 * 服务端常量
 * 默认厂商为智谱 GLM（OpenAI 兼容协议），用户可在设置页切换。
 */

// 端口优先级：PORT > FC_SERVER_PORT(阿里云函数计算 Web 函数) > 本地默认 8787
export const PORT = Number(process.env.PORT ?? process.env.FC_SERVER_PORT ?? 8787)

// 未配置时使用的默认值（均为 OpenAI 兼容端点）
export const DEFAULT_LLM_CONFIG = {
  provider: 'zhipu',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  chatModel: 'glm-4-flash',
  embeddingModel: 'embedding-3',
} as const

export type LlmConfig = {
  provider: string
  baseUrl: string
  apiKey: string
  chatModel: string
  embeddingModel: string
}
