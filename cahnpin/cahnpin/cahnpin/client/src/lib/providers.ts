/**
 * LLM 厂商预设（均通过 OpenAI 兼容协议接入）。
 * 选择厂商后自动填充接口地址与默认模型，用户仍可在设置页手动修改。
 */
export type ProviderPreset = {
  id: string
  name: string
  baseUrl: string
  chatModel: string
  embeddingModel: string
  note?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'zhipu',
    name: '智谱 GLM（默认）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatModel: 'glm-4-flash',
    embeddingModel: 'embedding-3',
    note: '国内直连；GLM-4-Flash 轻量低成本，embedding-3 用于知识库向量化',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-chat',
    embeddingModel: '',
    note: 'DeepSeek 暂无 Embedding 接口，向量化需另配厂商',
  },
  {
    id: 'qwen',
    name: '通义千问（DashScope）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatModel: 'qwen-plus',
    embeddingModel: 'text-embedding-v3',
  },
  {
    id: 'kimi',
    name: 'Kimi（Moonshot）',
    baseUrl: 'https://api.moonshot.cn/v1',
    chatModel: 'moonshot-v1-8k',
    embeddingModel: '',
    note: '长文档分析见长；Embedding 模型名请参照官方文档填写',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    note: '需要可访问 OpenAI 的网络环境',
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    chatModel: '',
    embeddingModel: '',
  },
]
