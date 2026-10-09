import type { LucideIcon } from 'lucide-react'

/**
 * 未上线模块统一占位页：保持侧边导航可跳转，明确传达上线阶段。
 */
export default function PagePlaceholder({
  icon: Icon,
  title,
  desc,
  phase,
}: {
  icon: LucideIcon
  title: string
  desc?: string
  phase?: number
}) {
  return (
    <div className="page-container">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>

      <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400">
          <Icon size={26} />
        </div>
        <p className="mt-5 text-base font-medium text-slate-600">{title}</p>
        {desc && <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">{desc}</p>}
        {phase && (
          <span className="mt-5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-600">
            计划阶段 {phase} 上线
          </span>
        )}
      </div>
    </div>
  )
}
