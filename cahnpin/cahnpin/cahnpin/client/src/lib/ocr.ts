/**
 * 图片 OCR：基于 tesseract.js，中文简体 + 英文。
 * worker 单例复用（多图排队识别）；core 与语言训练数据在首次使用时
 * 自动从 jsDelivr CDN 下载（tesseract.js v5 默认行为），之后浏览器缓存。
 */
import type { Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  // 懒加载 tesseract.js API；core 与中文语言包首次 OCR 时再从 jsDelivr 下载
  if (!workerPromise) {
    const { createWorker } = await import('tesseract.js')
    workerPromise = createWorker(['chi_sim', 'eng'], 1)
  }
  return workerPromise
}

/** 识别图片中的文字，失败时给出可操作的错误提示 */
export async function ocrImage(file: File): Promise<string> {
  try {
    const worker = await getWorker()
    const result = await worker.recognize(file)
    return result.data.text ?? ''
  } catch (err) {
    throw new Error(
      `图片 OCR 失败（首次使用需下载中文语言包，请确认网络可访问 cdn.jsdelivr.net）：${
        err instanceof Error ? err.message : '未知错误'
      }`,
    )
  }
}
