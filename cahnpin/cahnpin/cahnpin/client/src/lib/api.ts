/**
 * 与本地 Express 后端交互的轻量封装。
 * API_BASE：http(s) 部署时为空串（走同源相对路径）；
 * file:// 双击打开（离线分发包）时指向云端已部署的后端（服务端已开启 CORS）。
 */
export const API_BASE =
  window.location.protocol === 'file:'
    ? 'https://pm-groworkbench-jtljkjlfoa.cn-hangzhou.fcapp.run'
    : ''

export type PublicLlmConfig = {
  provider: string
  baseUrl: string
  chatModel: string
  embeddingModel: string
  hasApiKey: boolean
  apiKeyHint: string
}

export type LlmConfigPatch = {
  provider?: string
  baseUrl?: string
  apiKey?: string
  chatModel?: string
  embeddingModel?: string
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error((data as { error?: string }).error ?? `请求失败（${resp.status}）`)
  }
  return data as T
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  getConfig: () => request<PublicLlmConfig>('/api/config'),

  saveConfig: (patch: LlmConfigPatch) =>
    request<PublicLlmConfig>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  /** 连通性校验；config 为页面上当前编辑值（未保存也可测） */
  testConfig: (config: { baseUrl: string; apiKey?: string }) =>
    request<{ ok: boolean; message: string }>('/api/config/test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
}
