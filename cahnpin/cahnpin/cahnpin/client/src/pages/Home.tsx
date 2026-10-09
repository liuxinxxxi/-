import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Telescope,
  Puzzle,
  MessagesSquare,
  ArrowRight,
  Newspaper,
  BookMarked,
  GraduationCap,
  ChartColumn,
  Sparkles,
} from 'lucide-react'

/** 时段问候语配置：按本地小时分早 / 下午 / 晚三档 */
function getGreeting(hour: number) {
  if (hour >= 5 && hour < 12) {
    return {
      title: '早上好',
      emoji: '☀️',
      slogan: '今日精进：积累商业 & AI 产品认知',
    }
  }
  if (hour >= 12 && hour < 18) {
    return {
      title: '下午好',
      emoji: '☕',
      slogan: '持续打磨产品思维，保持行业敏感度',
    }
  }
  return {
    title: '晚上好',
    emoji: '🌙',
    slogan: '深度复盘、拆解案例、沉淀方法论',
  }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 首页两大主入口 */
const MAIN_ENTRIES = [
  {
    to: '/chat',
    icon: MessagesSquare,
    title: 'AI 产品专家',
    desc: '脑暴 / PRD / 评审 / 答疑 / 成长 / 知识库，基于工作台知识库作答',
  },
  {
    to: '/practice',
    icon: GraduationCap,
    title: '实战营',
    desc: 'RAG / 向量库 / 工作流 讲学练评复盘五闭环实训',
  },
]

/** 次级入口 */
const SUB_ENTRIES = [
  {
    to: '/insights',
    icon: Newspaper,
    title: 'AI 行业洞察',
    desc: '每日 AI 行业一推',
  },
  {
    to: '/knowledge-hub',
    icon: BookMarked,
    title: '产品新知',
    desc: '产品经理知识一览',
  },
  {
    to: '/competitors',
    icon: Telescope,
    title: '竞品跟踪',
    desc: '竞品商业洞察跟踪',
  },
  {
    to: '/teardown',
    icon: Puzzle,
    title: '产品拆解',
    desc: '全维度产品拆解器',
  },
]

export default function Home() {
  const now = new Date()
  const greeting = useMemo(() => getGreeting(now.getHours()), [now])

  const dateText = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${
    WEEKDAYS[now.getDay()]
  }`

  return (
    <div className="page-container">
      {/* 顶部：动态问候 */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-400">{dateText}</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-snug text-slate-800">
            {greeting.title}
            <span className="ml-2">{greeting.emoji}</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">{greeting.slogan}</p>
        </div>
      </header>

      {/* 主入口：AI 产品专家 + 实战营 */}
      <section className="mt-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {MAIN_ENTRIES.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-7 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-cardHover"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white shadow-sm transition-transform group-hover:scale-105">
                  <item.icon size={24} />
                </div>
                <ArrowRight
                  size={18}
                  className="text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-primary-500"
                />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-800">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{item.desc}</p>
              {/* 右下角装饰 */}
              <div className="pointer-events-none absolute -bottom-6 -right-6 text-7xl text-primary-50 transition-colors group-hover:text-primary-100/60">
                <Sparkles size={96} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 次级入口 */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-500">资讯 & 工具</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUB_ENTRIES.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-cardHover"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-500 transition-colors group-hover:bg-primary-500 group-hover:text-white">
                  <item.icon size={18} />
                </div>
                <ArrowRight
                  size={14}
                  className="ml-auto text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-500"
                />
              </div>
              <h3 className="mt-3.5 text-[14px] font-semibold text-slate-800">{item.title}</h3>
              <p className="mt-1 text-[12px] text-slate-400">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 底部：成长数据看板 */}
      <section className="mt-8">
        <Link
          to="/dashboard"
          className="group flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-gradient-to-r from-slate-50 to-white p-5 shadow-card transition-all duration-200 hover:border-primary-200 hover:shadow-cardHover"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-primary-500 group-hover:text-white">
            <ChartColumn size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-slate-800">成长数据看板</h3>
            <p className="mt-0.5 text-[12px] text-slate-400">
              拆解数量、学习天数、复盘数量、提问训练次数可视化
            </p>
          </div>
          <ArrowRight
            size={17}
            className="text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-500"
          />
        </Link>
      </section>
    </div>
  )
}
