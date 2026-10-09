import { NavLink, Outlet } from 'react-router-dom'
import { Sparkles, GitCommitVertical } from 'lucide-react'
import { NAV_ITEMS } from '../config/nav'

/**
 * 全局布局：固定左侧导航 + 右侧内容区。
 */
export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左侧固定侧边栏 */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200/70 bg-white">
        {/* 产品标识 */}
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 text-white shadow-sm">
            <Sparkles size={17} />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-800">
              PM 成长工作台
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-slate-400">
              商业 & AI 产品力训练
            </div>
          </div>
        </div>

        {/* 菜单 */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
                  isActive
                    ? 'bg-primary-50 font-medium text-primary-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    size={17}
                    className={isActive ? 'text-primary-500' : 'text-slate-400 group-hover:text-slate-500'}
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 版本记录入口 */}
        <div className="border-t border-slate-100 px-3 pt-2">
          <NavLink
            to="/version-log"
            className={({ isActive }) =>
              [
                'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
                isActive
                  ? 'bg-primary-50 font-medium text-primary-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <GitCommitVertical
                  size={17}
                  className={isActive ? 'text-primary-500' : 'text-slate-400 group-hover:text-slate-500'}
                />
                <span>版本记录</span>
              </>
            )}
          </NavLink>
        </div>

        <div className="border-t border-slate-100 px-5 py-3.5 text-[11px] text-slate-300">
          v0.1.0 · MVP
        </div>
      </aside>

      {/* 右侧内容区 */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
