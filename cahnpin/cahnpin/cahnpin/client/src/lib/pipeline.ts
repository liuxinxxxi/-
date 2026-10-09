/**
 * 素材入库流水线（单个文件）：
 *   创建素材记录 → 解析/提取文本 → 切片 → 分批向量化 → 切片入库 → 标记完成
 * 全程更新 IndexedDB 中的素材状态，并通过 onUpdate 回调驱动 UI 进度。
 */
import type { ChunkRecord, FolderId, Material } from '../types'
import { putChunks, putMaterial } from './db'
import { extractText, getExt } from './parsers'
import { chunkText } from './text'
import { embedTexts } from './llm'
import { uid } from './format'

/** 列表预览保留的文本长度 */
const PREVIEW_LIMIT = 600

export interface IngestCallbacks {
  /** 素材状态变化（进度/阶段/完成/失败） */
  onUpdate?: (material: Material) => void
}

/**
 * 执行单个文件入库。任何失败都会落库为 error 状态并向上抛出，方便 UI 提示。
 */
export async function ingestFile(
  file: File,
  folder: FolderId,
  callbacks: IngestCallbacks = {},
): Promise<void> {
  const id = uid('m_')
  const now = Date.now()

  const base: Material = {
    id,
    name: file.name,
    ext: getExt(file.name),
    mime: file.type || 'application/octet-stream',
    size: file.size,
    folder,
    status: 'processing',
    stage: '等待处理',
    progress: 0,
    textLength: 0,
    chunkCount: 0,
    ocr: false,
    previewText: '',
    createdAt: now,
  }

  const save = async (patch: Partial<Material>) => {
    Object.assign(base, patch)
    await putMaterial({ ...base })
    callbacks.onUpdate?.({ ...base })
  }

  try {
    // 1) 解析文本（PDF / docx / 图片 OCR / md / txt）
    await save({ stage: '解析文件内容…', progress: 8 })
    const { text, ocr } = await extractText(file)

    // 2) 切片
    await save({ stage: '文本切片中…', progress: 32 })
    const pieces = chunkText(text)
    if (pieces.length === 0) throw new Error('切片结果为空')

    // 3) 分批向量化并写入 chunks（边算边存，进度连续反馈）
    const BATCH = 16
    for (let start = 0; start < pieces.length; start += BATCH) {
      const end = Math.min(start + BATCH, pieces.length)
      await save({
        stage: `向量化入库中（${end}/${pieces.length} 片）…`,
        progress: 36 + Math.round((start / pieces.length) * 58),
      })
      const batchVectors = await embedTexts(pieces.slice(start, end))

      const records: ChunkRecord[] = pieces.slice(start, end).map((content, i) => ({
        id: uid('c_'),
        materialId: id,
        materialName: file.name,
        folder,
        ordinal: start + i,
        content,
        embedding: batchVectors[i],
        createdAt: now,
      }))
      await putChunks(records)
    }

    // 4) 完成
    await save({
      status: 'done',
      stage: '已入库',
      progress: 100,
      ocr,
      textLength: text.length,
      chunkCount: pieces.length,
      previewText: text.slice(0, PREVIEW_LIMIT),
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '处理失败'
    await save({
      status: 'error',
      stage: '处理失败',
      errorMsg,
      previewText: base.previewText,
    })
    throw new Error(errorMsg)
  }
}
