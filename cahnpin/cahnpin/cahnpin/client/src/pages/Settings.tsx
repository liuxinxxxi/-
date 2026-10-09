import { useEffect, useState } from 'react'
import { KeyRound, Plug, Save, Loader2, ShieldCheck } from 'lucide-react'
import { api, type PublicLlmConfig } from '../lib/api'
import { PROVIDER_PRESETS } from '../lib/providers'
import { toast } from '../stores/uiStore'

/**
 * 设置页（阶段 1 可用）：配置 LLM 接口。
 * API Key 保存在本地后端 server/data/config.json 中，不进入浏览器存储。
 */
export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const [provider, setProvider] = useState('zhipu')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('') // 留空表示不修改已保存的 Key
  const [chatModel, setChatModel] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [keyHint, setKeyHint] = useState('')

  // 初始化：拉取后端已保存配置（Key 脱敏）
  useEffect(() => {
    api
      .getConfig()
      .then((cfg: PublicLlmConfig) => {
        setProvider(cfg.provider)
        setBaseUrl(cfg.baseUrl)
        setChatModel(cfg.chatModel)
        setEmbeddingModel(cfg.embeddingModel)
        setKeyHint(cfg.apiKeyHint)
      })
      .catch(() => toast.error('无法连接本地后端服务，请确认 server 已启动'))
      .finally(() => setLoading(false))
  }, [])

  // 切换厂商预设：自动填充地址与模型（自定义不覆盖）
  const onProviderChange = (id: string) => {
    setProvider(id)
    const preset = PROVIDER_PRESETS.find((p) => p.id === id)
    if (preset && id !== 'custom') {
      setBaseUrl(preset.baseUrl)
      setChatModel(preset.chatModel)
      setEmbeddingModel(preset.embeddingModel)
    }
  }

  const handleTest = async () => {
    if (!baseUrl) {
      toast.error('请先填写接口地址')
      return
    }
    setTesting(true)
    try {
      const result = await api.testConfig({ baseUrl, apiKey: apiKey || undefined })
      result.ok ? toast.success(result.message) : toast.error(result.message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '测试失败')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!baseUrl) {
      toast.error('请填写接口地址')
      return
    }
    setSaving(true)
    try {
      const cfg = await api.saveConfig({
        provider,
        baseUrl,
        chatModel,
        embeddingModel,
        ...(apiKey ? { apiKey } : {}),
      })
      setApiKey('')
      setKeyHint(cfg.apiKeyHint)
      toast.success('配置已保存到本地')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100'

  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-800">设置</h1>
      <p className="mt-1.5 text-sm text-slate-400">配置 LLM 接口，供产品拆解、AI 陪练与知识库向量化使用</p>

      <div className="mt-8 rounded-2xl border border-slate-200/70 bg-white p-7 shadow-card">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
          <Plug size={17} className="text-primary-500" />
          LLM 接口配置
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">加载配置中…</div>
        ) : (
          <div className="mt-6 space-y-5">
            {/* 服务商预设 */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-600">服务商</label>
              <select className={inputCls} value={provider} onChange={(e) => onProviderChange(e.target.value)}>
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {PROVIDER_PRESETS.find((p) => p.id === provider)?.note && (
                <p className="mt-1.5 text-xs text-slate-400">
                  {PROVIDER_PRESETS.find((p) => p.id === provider)?.note}
                </p>
              )}
            </div>

            {/* 接口地址 */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-600">
                接口地址（OpenAI 兼容）
              </label>
              <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://..." />
            </div>

            {/* API Key */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
                <KeyRound size={13} />
                API Key
              </label>
              <input
                type="password"
                className={inputCls}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyHint ? `已配置 ${keyHint}，留空则不修改` : '请输入 API Key'}
                autoComplete="off"
              />
            </div>

            {/* 模型名 */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-600">对话模型</label>
                <input className={inputCls} value={chatModel} onChange={(e) => setChatModel(e.target.value)} placeholder="如 glm-4-flash" />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-600">
                  向量化模型（Embedding）
                </label>
                <input
                  className={inputCls}
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder="如 embedding-3"
                />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-primary-500 px-4.5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                保存配置
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:opacity-60"
              >
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
                测试连接
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 安全说明 */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-400">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
        <span>
          API Key 仅保存在本机后端配置文件 <code className="rounded bg-white px-1 py-0.5 text-slate-500">server/data/config.json</code>
          中（已加入 .gitignore），通过本地服务代理调用 LLM，不会写入浏览器存储，也不会上传到第三方。
        </span>
      </div>
    </div>
  )
}
