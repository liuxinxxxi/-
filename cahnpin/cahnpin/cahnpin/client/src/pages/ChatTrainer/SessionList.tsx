import { useState } from 'react'
import {
  Plus,
  MessagesSquare,
  Pencil,
  Trash2,
  Check,
  X,
  HelpCircle,
  Lightbulb,
  FileText,
  ShieldCheck,
  TrendingUp,
  Library,
  type LucideIcon,
} from 'lucide-react'
import type { Conversation, TrainerMode } from '../../types'
import { TRAINER_MODE_META, getTrainerModeMeta } from '../../lib/prompts'
import { formatDate } from '../../lib/format'

/** 6 项专家 Skill 图标映射；debate 等 fallback 走 MessagesSquare */
const MODE_ICONS: Partial<Record<TrainerMode, LucideIcon>> = {
  brainstorm: Lightbulb,
  prd: FileText,
  review: ShieldCheck,
  qa: HelpCircle,
  growth: TrendingUp,
  knowledge: Library,
}

function getModeIcon(mode: TrainerMode): LucideIcon {
  return MODE_ICONS[mode] ?? MessagesSquare
}

/** 陪练会话列表：新建（选模式）/ 切换 / 重命名 / 删除 */
export default function SessionList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (mode: TrainerMode) => void
  onRename: (id: string, title: string) => void
  onDelete: (conv: Conversation) => void
}) {
  const [picking, setPicking] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const commitRename = (id: string) => {
    const title = editTitle.trim()
    if (title) onRename(id, title.slice(0, 30))
    setEditingId(null)
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/60">
      <div className="relative border-b border-slate-100 p-3">
        <button
          onClick={() => setPicking((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-3 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
        >
          <Plus size={15} />
          新建陪练
        </button>

        {/* 模式选择弹层 */}
        {picking && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPicking(false)} />
            <div className="absolute inset-x-3 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-cardHover">
              {(Object.keys(TRAINER_MODE_META) as TrainerMode[]).map((mode) => {
                const Icon = getModeIcon(mode)
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      setPicking(false)
                      onCreate(mode)
                    }}
                    className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-primary-50/60"
                  >
                    <Icon size={16} className="mt-0.5 shrink-0 text-primary-500" />
                    <div>
                      <p className="text-[13px] font-medium text-slate-700">
                        {TRAINER_MODE_META[mode]!.label}
                      </p>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">
                        {TRAINER_MODE_META[mode]!.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <MessagesSquare size={22} className="text-slate-200" />
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
              还没有陪练会话
              <br />
              选择一种模式开始训练
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const Icon = getModeIcon(conv.mode)
            const active = conv.id === activeId
            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`group mb-1 cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
                  active ? 'bg-primary-50' : 'hover:bg-slate-50'
                }`}
              >
                {editingId === conv.id ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(conv.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="w-full rounded-lg border border-primary-200 bg-white px-2 py-1 text-[13px] text-slate-700 outline-none focus:ring-2 focus:ring-primary-100"
                    />
                    <button
                      onClick={() => commitRename(conv.id)}
                      className="shrink-0 rounded-md p-1 text-emerald-500 hover:bg-emerald-50"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Icon
                        size={14}
                        className={active ? 'shrink-0 text-primary-500' : 'shrink-0 text-slate-300'}
                      />
                      <span
                        className={`truncate text-[13px] ${
                          active ? 'font-medium text-primary-700' : 'text-slate-600'
                        }`}
                        title={conv.title}
                      >
                        {conv.title}
                      </span>
                      <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(conv.id)
                            setEditTitle(conv.title)
                          }}
                          className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-primary-500"
                          title="重命名"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(conv)
                          }}
                          className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-500"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    </div>
                    <p className="mt-1 pl-6 text-[11px] text-slate-300">
                      {getTrainerModeMeta(conv.mode).label} · {formatDate(conv.updatedAt)}
                      {conv.useRag && ' · RAG'}
                    </p>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
