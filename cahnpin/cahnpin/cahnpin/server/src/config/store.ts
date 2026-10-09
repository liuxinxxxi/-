/**
 * LLM 配置本地持久化
 * 配置文件位于 server/data/config.json（已 gitignore），API Key 只保存在用户本机。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LLM_CONFIG, type LlmConfig } from '../constants.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

let cache: LlmConfig | null = null

/** 读取配置；文件不存在时返回默认值 */
export async function loadConfig(): Promise<LlmConfig> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8')
    cache = { ...DEFAULT_LLM_CONFIG, ...(JSON.parse(raw) as Partial<LlmConfig>) }
  } catch {
    cache = { ...DEFAULT_LLM_CONFIG }
  }
  return cache
}

/** 合并保存配置；apiKey 传空串或 undefined 时保留原值（避免编辑时被掩码覆盖） */
export async function saveConfig(patch: Partial<LlmConfig>): Promise<LlmConfig> {
  const current = await loadConfig()
  const next: LlmConfig = {
    provider: patch.provider ?? current.provider,
    baseUrl: patch.baseUrl?.trim() || current.baseUrl,
    apiKey:
      patch.apiKey === undefined || patch.apiKey === ''
        ? current.apiKey
        : patch.apiKey.trim(),
    chatModel: patch.chatModel?.trim() || current.chatModel,
    embeddingModel:
      patch.embeddingModel === undefined
        ? current.embeddingModel
        : patch.embeddingModel.trim(),
  }
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8')
  cache = next
  return next
}

/** 返回给前端的安全视图：不明文回传 API Key */
export function toPublicConfig(cfg: LlmConfig) {
  return {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    chatModel: cfg.chatModel,
    embeddingModel: cfg.embeddingModel,
    hasApiKey: Boolean(cfg.apiKey),
    apiKeyHint: cfg.apiKey ? `••••${cfg.apiKey.slice(-4)}` : '',
  }
}
