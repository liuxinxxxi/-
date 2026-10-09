/**
 * 文本处理工具：规范化与切片（chunking）。
 * 策略：优先按自然段落聚合（约 chunkSize 字一块），
 * 超长段落按字符滑窗硬切并保留 overlap 重叠，减少语义割裂。
 */

export const CHUNK_SIZE = 500
export const CHUNK_OVERLAP = 80

/** 清洗提取出的原始文本：统一换行、去除每行首尾空白与多余空行 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 将长文本切成 ~size 字符的块，相邻硬切块之间保留 overlap 字符重叠。
 */
export function chunkText(
  raw: string,
  size: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP,
): string[] {
  const text = normalizeText(raw)
  if (!text) return []

  // 第一步：段落级单元，超长段落先滑窗硬切
  const units: string[] = []
  for (const paragraph of text.split('\n\n')) {
    if (paragraph.length <= size) {
      units.push(paragraph)
    } else {
      let start = 0
      while (start < paragraph.length) {
        units.push(paragraph.slice(start, start + size))
        if (start + size >= paragraph.length) break
        start += size - overlap
      }
    }
  }

  // 第二步：贪心聚合小单元到接近 size
  const chunks: string[] = []
  let buffer = ''
  for (const unit of units) {
    if (!buffer) {
      buffer = unit
    } else if (buffer.length + 2 + unit.length <= size) {
      buffer += `\n\n${unit}`
    } else {
      chunks.push(buffer)
      buffer = unit
    }
  }
  if (buffer) chunks.push(buffer)

  return chunks
}
