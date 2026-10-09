import { useState } from 'react'
import {
  FileText,
  FileImage,
  FileType2,
  Trash2,
  ChevronDown,
  AlertCircle,
  Loader2,
  ScanText,
} from 'lucide-react'
import type { Material } from '../../types'
import { getFolderDef } from '../../config/folders'
import { formatBytes, formatDate } from '../../lib/format'
import { IMAGE_EXTS } from '../../lib/parsers'

/** 按文件类型选择图标与配色 */
function iconOf(ext: string, ocr: boolean) {
  if (IMAGE_EXTS.includes(ext) || ocr) {
    return { Icon: FileImage, cls: 'bg-violet-50 text-violet-500' }
  }
  if (ext === 'docx' || ext === 'doc') {
    return { Icon: FileType2, cls: 'bg-primary-50 text-primary-500' }
  }
  return { Icon: FileText, cls: 'bg-slate-100 text-slate-500' }
}

/**
 * 单条素材卡片：展示元信息、处理进度、错误、文本预览与删除。
 */
export default function MaterialItem({
  material,
  onDelete,
}: {
  material: Material
  onDelete: (m: Material) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { Icon, cls } = iconOf(material.ext, material.ocr)
  const folder = getFolderDef(material.folder)
  const processing = material.status === 'processing'

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-card">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cls}`}>
          <Icon size={19} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-700" title={material.name}>
              {material.name}
            </p>
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
              {material.ext || '?'}
            </span>
            {material.ocr && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-500">
                <ScanText size={10} />
                OCR
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
            <span className="rounded-full bg-primary-50/70 px-2 py-0.5 text-primary-600">
              {folder.name}
            </span>
            <span>{formatBytes(material.size)}</span>
            {material.status === 'done' && (
              <>
                <span>·</span>
                <span>{material.textLength.toLocaleString()} 字</span>
                <span>·</span>
                <span>{material.chunkCount} 个切片</span>
              </>
            )}
            <span>·</span>
            <span>{formatDate(material.createdAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {material.previewText && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              预览
              <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          <button
            onClick={() => onDelete(material)}
            disabled={processing}
            title="删除素材及其切片"
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* 处理进度 */}
      {processing && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-xs text-primary-600">
            <Loader2 size={13} className="animate-spin" />
            {material.stage}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary-400 transition-all duration-300"
              style={{ width: `${material.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {material.status === 'error' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50/70 px-3 py-2 text-xs leading-relaxed text-rose-500">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{material.errorMsg ?? '处理失败'}</span>
        </div>
      )}

      {/* 提取文本预览 */}
      {expanded && material.previewText && (
        <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          {material.previewText}
        </pre>
      )}
    </div>
  )
}
