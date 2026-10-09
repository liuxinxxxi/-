/**
 * 侧边栏菜单与模块元信息集中配置，便于后续扩展。
 * phase 标注模块计划上线阶段（用于占位页提示）。
 */
import {
  House,
  Newspaper,
  Telescope,
  Puzzle,
  MessagesSquare,
  GraduationCap,
  FolderOpen,
  BookMarked,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  path: string
  label: string
  icon: LucideIcon
  phase?: number
  desc?: string
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '首页', icon: House },
  {
    path: '/insights',
    label: 'AI行业洞察',
    icon: Newspaper,
    phase: 5,
    desc: '模型新版本、国内外 AI 新产品、赛道趋势与落地方法论',
  },
  {
    path: '/knowledge-hub',
    label: '产品新知',
    icon: BookMarked,
    phase: 8,
    desc: '每日爬取掘金/人人都是产品经理/InfoQ/CSDN 高阅读量文章，按分类整理学习',
  },
  {
    path: '/competitors',
    label: '竞品跟踪',
    icon: Telescope,
    phase: 6,
    desc: '手动录入竞品与资料，AI 分析商业动作、定价变化与 AI 功能布局',
  },
  {
    path: '/teardown',
    label: '产品拆解',
    icon: Puzzle,
    phase: 3,
    desc: '六层结构化拆解报告：叙事战略、客户价值、商业经营、运营、产品、AI 架构',
  },
  {
    path: '/chat',
    label: 'AI产品专家',
    icon: MessagesSquare,
    phase: 4,
    desc: '脑暴 / PRD / 评审 / 答疑 / 成长 / 知识库，基于你的工作台知识库作答',
  },
  {
    path: '/practice',
    label: '实战营',
    icon: GraduationCap,
    phase: 7,
    desc: 'RAG / 向量库 / 工作流 讲学练评复盘五闭环实训',
  },
  {
    path: '/materials',
    label: '个人智库',
    icon: FolderOpen,
    phase: 2,
    desc: '上传 PDF / Word / Markdown / 图片，自动解析、OCR 并向量化入库；顶部可进入知识库检索',
  },
  { path: '/settings', label: '设置', icon: Settings },
]
