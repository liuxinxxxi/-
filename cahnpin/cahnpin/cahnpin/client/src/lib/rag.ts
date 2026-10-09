/**
 * 本地 RAG 检索：问题向量化 → 与全部切片做余弦相似度 → 返回 topK 命中。
 * 数据来自 IndexedDB（chunks 表），MVP 量级下全量计算即可；
 * 后续数据量增大时可在此切换为向量索引而不改调用方。
 */
import type { FolderId, RagHit } from '../types'
import { embedTexts } from './llm'
import { getAllChunks } from './db'

/** 向量归一化，返回 L2 单位向量 */
function normalize(v: Float32Array): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const norm = Math.sqrt(sum) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

/**
 * 语义检索知识库。
 * @param query  用户问题
 * @param topK   返回片段数，默认 5
 * @param folder 指定分类过滤，默认全库
 */
export async function searchRag(
  query: string,
  opts: { topK?: number; folder?: FolderId | 'all' } = {},
): Promise<RagHit[]> {
  const topK = opts.topK ?? 5
  const trimmed = query.trim()
  if (!trimmed) return []

  const [queryEmbedding] = await embedTexts([trimmed])
  if (!queryEmbedding) return []

  const q = normalize(queryEmbedding)
  const all = await getAllChunks()
  const scope = opts.folder && opts.folder !== 'all' ? all.filter((c) => c.folder === opts.folder) : all

  const scored: RagHit[] = scope.map((chunk) => {
    const c = normalize(chunk.embedding)
    let dot = 0
    // 维度以查询向量为准（防止历史数据维度不一致）
    const dim = Math.min(q.length, c.length)
    for (let i = 0; i < dim; i++) dot += q[i] * c[i]
    return {
      content: chunk.content,
      materialId: chunk.materialId,
      materialName: chunk.materialName,
      folder: chunk.folder,
      score: dot,
    }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, topK)
}
