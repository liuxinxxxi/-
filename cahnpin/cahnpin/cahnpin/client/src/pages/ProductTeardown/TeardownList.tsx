import { Plus, Puzzle, FileText, Database, Trash2, ChevronRight } from 'lucide-react'
import type { Teardown } from '../../types'
import { formatDate } from '../../lib/format'

/**
 * 拆解报告历史列表。
 */
export default function TeardownList({
  reports,
  onNew,
  onOpen,
  onDelete,
}: {
  reports: Teardown[]
  onNew: () => void
  onOpen: (report: Teardown) => void
  onDelete: (report: Teardown) => void
}) {
  return (
    <div className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">全维度产品拆解器</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            叙事战略 · 客户价值 · 商业经营 · 运营生命周期 · 产品架构 · 技术&amp;AI 架构
          </p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
        >
          <Plus size={16} />
          新建拆解
        </button>
      </div>

      {reports.length === 0 ? (
        <button
          onClick={onNew}
          className="mt-10 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-20 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/30"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
            <Puzzle size={26} />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">开始第一次产品拆解</p>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">
            输入产品名并附上资料，AI 将输出六层结构化 Markdown 报告，支持编辑、保存与导出
          </p>
        </button>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {reports.map((r) => (
            <div
              key={r.id}
              className="group flex cursor-pointer flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-cardHover"
              onClick={() => onOpen(r)}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="truncate text-[15px] font-semibold text-slate-800" title={r.productName}>
                  {r.productName}
                </h3>
                <ChevronRight
                  size={17}
                  className="mt-0.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500"
                />
              </div>

              <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[12.5px] leading-relaxed text-slate-400">
                {/* 跳过标题行，取正文中的第一段实质内容做摘要 */}
                {r.content
                  .split('\n')
                  .find((line) => line.trim() && !line.startsWith('#') && !line.startsWith('>'))
                  ?.replace(/[*#>`]/g, '')
                  .slice(0, 90) || '已生成六层拆解报告'}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-400">
                <span>{formatDate(r.createdAt)}</span>
                <span>{r.content.length.toLocaleString()} 字</span>
                {r.attachments.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <FileText size={11} />
                    {r.attachments.length}
                  </span>
                )}
                {r.sources.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Database size={11} />
                    {r.sources.length}
                  </span>
                )}
              </div>

              <div className="mt-3 flex justify-end border-t border-slate-50 pt-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(r)
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 size={13} />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
