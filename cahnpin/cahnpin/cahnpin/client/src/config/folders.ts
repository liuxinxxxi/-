/**
 * 素材库文件夹分类配置
 */
import {
  Briefcase,
  BrainCircuit,
  Telescope,
  NotebookPen,
  Library,
  type LucideIcon,
} from 'lucide-react'
import type { FolderId } from '../types'

export type FolderDef = {
  id: FolderId
  name: string
  icon: LucideIcon
  desc: string
}

export const FOLDERS: FolderDef[] = [
  { id: 'business', name: '商业学习', icon: Briefcase, desc: '商业模式、定价、行业研究' },
  { id: 'ai', name: 'AI产品学习', icon: BrainCircuit, desc: '模型、Agent/RAG、AI 落地方法' },
  { id: 'competitor', name: '竞品资料', icon: Telescope, desc: '竞品官网、产品动态、定价信息' },
  { id: 'review', name: '个人复盘', icon: NotebookPen, desc: '案例复盘、踩坑复盘、学习复盘' },
  { id: 'case', name: '案例库', icon: Library, desc: '标杆产品案例与拆解素材' },
]

export function getFolderDef(id: FolderId): FolderDef {
  return FOLDERS.find((f) => f.id === id) ?? FOLDERS[0]
}
