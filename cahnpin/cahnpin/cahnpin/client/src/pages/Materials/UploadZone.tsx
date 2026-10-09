import { useRef, useState } from 'react'
import { CloudUpload, Loader2 } from 'lucide-react'
import { ACCEPT_ATTR } from '../../lib/parsers'
import { FOLDERS } from '../../config/folders'
import type { FolderId } from '../../types'

/**
 * 拖拽 / 点击上传区。
 * 左侧选中具体分类时锁定目标分类；选中"全部"时可在此下拉选择入库分类。
 */
export default function UploadZone({
  fixedFolder,
  busy,
  onFiles,
}: {
  fixedFolder: FolderId | null
  busy: boolean
  onFiles: (files: File[], targetFolder: FolderId) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [targetFolder, setTargetFolder] = useState<FolderId>('ai')
  const dragDepth = useRef(0)

  const folder = fixedFolder ?? targetFolder

  const emit = (list: FileList | null) => {
    if (!list || list.length === 0) return
    onFiles(Array.from(list), folder)
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current += 1
        setDragOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setDragOver(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDragOver(false)
        if (!busy) emit(e.dataTransfer.files)
      }}
      className={`rounded-2xl border-2 border-dashed bg-white px-6 py-8 text-center transition-colors ${
        dragOver
          ? 'border-primary-400 bg-primary-50/60'
          : 'border-slate-200 hover:border-primary-300'
      }`}
    >
      <CloudUpload size={28} className="mx-auto text-primary-400" />
      <p className="mt-3 text-sm font-medium text-slate-600">
        拖拽文件到此处，或
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mx-1 text-primary-600 underline-offset-2 hover:underline disabled:opacity-50"
        >
          点击选择文件
        </button>
      </p>
      <p className="mt-1.5 text-xs text-slate-400">
        支持 PDF、Word(.docx)、Markdown、TXT、图片（PNG/JPG/WEBP）；图片自动中文 OCR
      </p>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <span>入库到</span>
        {fixedFolder ? (
          <span className="rounded-full bg-primary-50 px-2.5 py-1 font-medium text-primary-600">
            {FOLDERS.find((f) => f.id === fixedFolder)?.name}
          </span>
        ) : (
          <select
            value={targetFolder}
            onChange={(e) => setTargetFolder(e.target.value as FolderId)}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600 outline-none focus:border-primary-400"
          >
            {FOLDERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        {busy && (
          <span className="flex items-center gap-1 text-primary-500">
            <Loader2 size={13} className="animate-spin" />
            正在处理队列…
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files)
          e.target.value = '' // 允许重复选择同一文件
        }}
      />
    </div>
  )
}
