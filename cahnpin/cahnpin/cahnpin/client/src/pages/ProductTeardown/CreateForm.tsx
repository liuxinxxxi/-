import { useState } from 'react'
import { Sparkles, Loader2, Database, Info } from 'lucide-react'
import AttachmentInput, { type AttachmentItem } from './AttachmentInput'

/**
 * 新建拆解表单：产品名 + 补充资料 + 附件 + 知识库增强开关。
 */
export interface TeardownRequest {
  productName: string
  brief: string
  attachments: AttachmentItem[]
  useRag: boolean
}

export default function CreateForm({
  hasKnowledge,
  starting,
  onStart,
  onCancel,
}: {
  hasKnowledge: boolean
  starting: boolean
  onStart: (req: TeardownRequest) => void
  onCancel: () => void
}) {
  const [productName, setProductName] = useState('')
  const [brief, setBrief] = useState('')
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [useRag, setUseRag] = useState(true)

  const parsing = attachments.some((a) => a.status === 'parsing')
  const failed = attachments.filter((a) => a.status === 'error')
  const valid = productName.trim().length >= 2 && !parsing && !starting

  const submit = () => {
    if (!valid) return
    onStart({
      productName: productName.trim(),
      brief: brief.trim(),
      attachments: attachments.filter((a) => a.status === 'done'),
      useRag: hasKnowledge ? useRag : false,
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-7 shadow-card">
      <h2 className="text-[15px] font-semibold text-slate-800">新建产品拆解</h2>
      <p className="mt-1 text-[13px] text-slate-400">
        输入产品名称并提供材料，AI 将输出六层结构化拆解报告
      </p>

      <div className="mt-6 space-y-5">
        {/* 产品名称 */}
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-600">
            产品名称 <span className="text-rose-400">*</span>
          </label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="如：Notion AI、Cursor、飞书多维表格"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* 补充资料 */}
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-600">
            补充资料（可粘贴官网文案、定价、公开报道等）
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder="粘贴你掌握的公开资料，AI 会优先依据这些信息分析，并在结论处标注来源…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1 text-right text-[11px] text-slate-300">{brief.length} 字</p>
        </div>

        {/* 附件 */}
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-600">附件材料</label>
          <AttachmentInput items={attachments} onChange={setAttachments} />
          {failed.length > 0 && (
            <p className="mt-1 text-[11.5px] text-rose-400">
              {failed.length} 个附件解析失败，将不会参与本次生成
            </p>
          )}
        </div>

        {/* 知识库增强 */}
        <label
          className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-4 py-3 transition-colors ${
            hasKnowledge ? 'border-slate-200 bg-slate-50/50' : 'cursor-not-allowed border-slate-100 bg-slate-50/30 opacity-60'
          }`}
        >
          <input
            type="checkbox"
            checked={hasKnowledge && useRag}
            disabled={!hasKnowledge}
            onChange={(e) => setUseRag(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#5578AE]"
          />
          <div>
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
              <Database size={13} className="text-primary-500" />
              引入个人知识库相关材料（RAG）
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">
              {hasKnowledge
                ? '将根据产品名自动从素材库检索最相关的 6 个片段作为上下文，并在报告中标注来源'
                : '素材库尚无已入库内容，可先去「个人素材库」上传，或仅凭产品名与本次附件生成'}
            </p>
          </div>
        </label>

        {/* 幻觉提示 */}
        <div className="flex items-start gap-2 rounded-lg bg-amber-50/70 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-700">
          <Info size={13} className="mt-0.5 shrink-0" />
          AI 对不确定的信息会标注【待核验】，报告中所有事实性内容（定价、数据、融资等）请务必人工核验后使用。
        </div>

        {/* 操作 */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {starting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                正在生成…
              </>
            ) : (
              <>
                <Sparkles size={15} />
                生成拆解报告
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
