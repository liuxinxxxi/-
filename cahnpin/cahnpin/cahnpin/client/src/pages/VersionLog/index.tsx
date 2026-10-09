import { GitCommitVertical, Calendar } from 'lucide-react'
import { VERSION_RECORDS } from '../../config/versions'

/**
 * 版本记录页：展示平台历次更新日期、更新内容与更新序号。
 * 数据源见 config/versions.ts，新增改动时在数组头部追加一条即可。
 */
export default function VersionLog() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      {/* 页头 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">版本记录</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          平台功能每次改动会记录在此，方便追溯演进历程
        </p>
      </div>

      {/* 时间线 */}
      <div className="relative">
        {/* 竖线 */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />

        <div className="space-y-7">
          {VERSION_RECORDS.map((rec, idx) => (
            <div key={rec.seq} className="relative pl-8">
              {/* 节点圆点 */}
              <div
                className={`absolute left-0 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${
                  idx === 0
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-slate-300 bg-white'
                }`}
              />

              {/* 版本号 + 日期 */}
              <div className="mb-2 flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                    idx === 0
                      ? 'bg-primary-50 text-primary-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  第 {rec.seq} 次更新
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={12} />
                  {rec.date}
                </span>
                {idx === 0 && (
                  <span className="rounded bg-primary-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    最新
                  </span>
                )}
              </div>

              {/* 更新内容 */}
              <ul className="space-y-1.5">
                {rec.changes.map((change, cIdx) => (
                  <li
                    key={cIdx}
                    className="flex items-start gap-2 text-sm leading-relaxed text-slate-600"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-10 flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-400">
        <GitCommitVertical size={14} />
        后续每次平台功能有新的改动，都会在此页面追加一条记录
      </div>
    </div>
  )
}
