/**
 * 内置角色 Skill 定义。
 * MVP 阶段仅做 UI 占位（选中状态全局持久化），角色专属 Prompt/Skill 逻辑二期实现。
 */
export type RoleId = 'ai' | 'business' | 'strategy'

export type Role = {
  id: RoleId
  name: string
  focus: string
}

export const ROLES: Role[] = [
  {
    id: 'ai',
    name: 'AI产品经理Skill',
    focus: '模型、Agent/RAG、幻觉控制、Prompt 工程、AI 产品落地风险',
  },
  {
    id: 'business',
    name: '商业产品经理Skill',
    focus: '赛道、商业模式、定价、LTV、获客、盈利分析',
  },
  {
    id: 'strategy',
    name: '战略产品经理Skill',
    focus: '赛道取舍、长期叙事、壁垒、资源分配、路线判断',
  },
]

export const DEFAULT_ROLE_ID: RoleId = 'ai'
