/**
 * 多格式文件文本提取：
 * - PDF：pdf.js 读取文本层（逐页）
 * - Word：mammoth 浏览器版提取 docx 纯文本
 * - Markdown / TXT：直接读取
 * - 图片：tesseract.js OCR（见 ocr.ts）
 * 注：纯扫描版 PDF 无文本层，tesseract.js 不支持直接处理 PDF，
 *     此类文件请转成图片后上传（MVP 边界）。
 */
import { ocrImage } from './ocr'
import { normalizeText } from './text'

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']
const TEXT_EXTS = ['md', 'markdown', 'txt', 'text']
const SUPPORTED_EXTS = ['pdf', 'docx', ...TEXT_EXTS, ...IMAGE_EXTS]

export function getExt(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

export function isSupported(file: File): boolean {
  return SUPPORTED_EXTS.includes(getExt(file.name))
}

/** 支持的扩展名清单，用于 input accept 与提示文案 */
export const ACCEPT_ATTR = '.pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp,.bmp,.gif'

/** 懒加载 pdf.js（约 400KB）及其 Web Worker，仅首次解析 PDF 时下载 */
let pdfWorkerReady = false
async function loadPdfJs() {
  const pdfjsLib = await import('pdfjs-dist')
  if (!pdfWorkerReady) {
    // inline：worker 以 blob 形式内联，解压双击（file://）打开时也能正常创建
    const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline')
    pdfjsLib.GlobalWorkerOptions.workerPort = new workerMod.default()
    pdfWorkerReady = true
  }
  return pdfjsLib
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await loadPdfJs()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .trim()
    if (text) pageTexts.push(text)
  }

  await pdf.destroy()

  if (pageTexts.length === 0 || pageTexts.every((t) => t.length < 5)) {
    throw new Error('该 PDF 没有可提取的文本层（可能是扫描件），请转为图片后上传以使用 OCR')
  }
  return pageTexts.join('\n\n')
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  // mammoth 浏览器构建体积较大（约 700KB），仅解析 docx 时按需加载
  const { default: mammoth } = await import('mammoth/mammoth.browser')
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

export interface ExtractResult {
  text: string
  /** 是否经由 OCR */
  ocr: boolean
}

/** 按扩展名分发解析，返回规范化后的文本 */
export async function extractText(file: File): Promise<ExtractResult> {
  const ext = getExt(file.name)

  let raw: string
  let ocr = false

  if (ext === 'pdf') {
    raw = await extractPdf(await file.arrayBuffer())
  } else if (ext === 'docx') {
    raw = await extractDocx(await file.arrayBuffer())
  } else if (IMAGE_EXTS.includes(ext)) {
    raw = await ocrImage(file)
    ocr = true
  } else if (TEXT_EXTS.includes(ext)) {
    raw = await file.text()
  } else if (ext === 'doc') {
    throw new Error('暂不支持旧版 .doc，请用 Word 另存为 .docx 后上传')
  } else {
    throw new Error(`不支持的文件类型：${ext || '未知'}`)
  }

  const text = normalizeText(raw)
  if (!text) {
    throw new Error(ocr ? 'OCR 未识别到文字，请更换更清晰的图片' : '未从文件中提取到文本内容')
  }
  return { text, ocr }
}
