import { useState } from 'react'
import { Search, Loader2, FlaskConical, Quote } from 'lucide-react'
import { searchRag } from '../../lib/rag'
import { FOLDERS, getFolderDef } from '../../config/folders'
import type { FolderId, RagHit } from '../../types'

/**
 * 知识库检索自测：验证素材向量化入库后的语义召回效果。
 * （阶段 7 知识库总览的能力雏形，当前仅做轻量验证入口）
 */
export default function SearchTester({ hasChunks }: { hasChunks: boolean }) {
  const [folder, setFolder] = useState<FolderId | 'all'>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<RagHit[] | null>(null)

  const run = async () => {
    if (!query.trim() || loading) return
    setLoading(true)
    setHits(null)
    try {
      const result = await searchRag(query, { topK: 5, folder })
      setHits(result)
    } catch (err) {
      setHits([])
      alert(err instanceof Error ? err.message : '检索失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <FlaskConical size={16} className="text-primary-500" />
        知识库检索自测
        <span className="text-xs font-normal text-slate-400">用自然语言验证语义召回与来源定位</span>
      </div>

      <div className="mt-3 flex gap-2">
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value as FolderId | 'all')}
          disabled={!hasChunks || loading}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-primary-400 disabled:opacity-50"
        >
          <option value="all">全部分类</option>
          {FOLDERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          disabled={!hasChunks}
          placeholder={hasChunks ? '如：这个产品如何用 Agent 降低客服成本？' : '上传素材并完成入库后即可检索'}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-50"
        />
        <button
          onClick={run}
          disabled={!hasChunks || loading || !query.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          检索
        </button>
      </div>

      {hits && (
        <div className="mt-4 space-y-2.5">
          {hits.length === 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">
              未检索到相关内容，请换个表述或确认素材已成功入库。
            </p>
          )}
          {hits.map((hit, i) => (
            <div key={`${hit.materialId}-${i}`} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-primary-600">{hit.materialName}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-slate-400">
                  {getFolderDef(hit.folder).name}
                </span>
                <span className="ml-auto text-slate-400">
                  语义相似度 {(hit.score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="mt-2 flex gap-1.5 text-[13px] leading-relaxed text-slate-600">
                <Quote size={13} className="mt-1 shrink-0 text-slate-300" />
                {hit.content.length > 260 ? `${hit.content.slice(0, 260)}…` : hit.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
