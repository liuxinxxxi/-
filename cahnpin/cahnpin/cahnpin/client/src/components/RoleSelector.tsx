import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, UserRound } from 'lucide-react'
import { ROLES } from '../config/roles'
import { useRoleStore } from '../stores/roleStore'

/**
 * 全局角色下拉选择器。
 * MVP 阶段仅切换 UI 选中状态（已持久化），二期接入各角色 Skill 的 Prompt 与能力逻辑。
 */
export default function RoleSelector() {
  const roleId = useRoleStore((s) => s.roleId)
  const setRoleId = useRoleStore((s) => s.setRoleId)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = ROLES.find((r) => r.id === roleId) ?? ROLES[0]

  // 点击组件外部时收起下拉
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50/50"
      >
        <UserRound size={15} className="text-primary-500" />
        <span className="font-medium">{current.name}</span>
        <ChevronDown
          size={15}
          className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200/80 bg-white py-1.5 shadow-cardHover">
          <p className="px-4 pb-1.5 pt-1 text-xs text-slate-400">
            选择训练角色（Skill 逻辑二期上线）
          </p>
          {ROLES.map((role) => {
            const active = role.id === roleId
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  setRoleId(role.id)
                  setOpen(false)
                }}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-primary-50/60 ${
                  active ? 'bg-primary-50/50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-medium ${
                      active ? 'text-primary-700' : 'text-slate-700'
                    }`}
                  >
                    {role.name}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    {role.focus}
                  </div>
                </div>
                {active && <Check size={15} className="mt-0.5 shrink-0 text-primary-500" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
