import { useRef } from 'react'
import { Paperclip, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { ACCEPT_ATTR, extractText, isSupported } from '../../lib/parsers'
import { formatBytes, uid } from '../../lib/format'
import { toast } from '../../stores/uiStore'

/** 附件解析后的内存态（仅用于本次拆解，不写入素材库） */
export interface AttachmentItem {
  id: string
  name: string
  size: number
  status: 'parsing' | 'done' | 'error'
  text: string
  chars: number
  errorMsg?: string
}

/**
 * 拆解附件上传：复用素材库解析能力（PDF / docx / MD / TXT / 图片 OCR）。
 * 与素材库不同，附件只保存在内存中用于本次生成。
 */
export default function AttachmentInput({
  items,
  onChange,
}: {
  items: AttachmentItem[]
  onChange: (items: AttachmentItem[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = async (files: File[]) => {
    const valid = files.filter((f) => {
      if (isSupported(f)) return true
      toast.error(`不支持的文件：${f.name}`)
      return false
    })
    if (valid.length === 0) return

    const added: AttachmentItem[] = valid.map((f) => ({
      id: uid('a_'),
      name: f.name,
      size: f.size,
      status: 'parsing',
      text: '',
      chars: 0,
    }))
    onChange([...items, ...added])

    // 串行解析（OCR 内部已对 worker 做单例复用）
    for (let i = 0; i < added.length; i++) {
      const item = added[i]
      const file = valid[i]
      try {
        const { text } = await extractText(file)
        item.status = 'done'
        item.text = text
        item.chars = text.length
      } catch (err) {
        item.status = 'error'
        item.errorMsg = err instanceof Error ? err.message : '解析失败'
      }
      // 触发列表刷新
      onChange([...items, ...added])
    }
  }

  const remove = (id: string) => onChange(items.filter((it) => it.id !== id))

  const parsingCount = items.filter((it) => it.status === 'parsing').length

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3.5 py-2 text-[13px] text-slate-500 transition-colors hover:border-primary-300 hover:text-primary-600"
      >
        <Paperclip size={14} />
        添加附件（PDF / Word / Markdown / 图片）
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />

      {items.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-[12.5px]"
            >
              {it.status === 'parsing' && <Loader2 size={14} className="shrink-0 animate-spin text-primary-500" />}
              {it.status === 'done' && <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />}
              {it.status === 'error' && <AlertCircle size={14} className="shrink-0 text-rose-500" />}
              <span className="min-w-0 flex-1 truncate text-slate-600" title={it.name}>
                {it.name}
              </span>
              <span className="shrink-0 text-slate-400">{formatBytes(it.size)}</span>
              {it.status === 'done' && <span className="shrink-0 text-emerald-600">{it.chars.toLocaleString()} 字</span>}
              {it.status === 'parsing' && <span className="shrink-0 text-primary-500">解析中…</span>}
              {it.status === 'error' && (
                <span className="shrink-0 text-rose-500" title={it.errorMsg}>
                  解析失败
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="shrink-0 rounded p-0.5 text-slate-300 hover:text-rose-500"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
        附件仅用于本次拆解的上下文输入，不会自动进入素材库；{parsingCount > 0 && '有附件正在解析，请稍候再生成。'}
        {parsingCount === 0 && '如需长期沉淀请到「个人素材库」上传。'}
      </p>
    </div>
  )
}
