import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useUiStore, type ToastType } from '../stores/uiStore'

const ICONS: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const COLORS: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-rose-500',
  info: 'text-primary-500',
}

/** 全局 Toast 容器，固定在页面顶部居中，不遮挡主要操作区域 */
export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts)
  const remove = useUiStore((s) => s.removeToast)

  return (
    <div className="pointer-events-none fixed left-1/2 top-5 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white/95 px-4 py-2.5 text-sm text-slate-700 shadow-cardHover backdrop-blur"
          >
            <Icon size={16} className={COLORS[t.type]} />
            <span>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="ml-1 text-slate-300 transition-colors hover:text-slate-500"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
