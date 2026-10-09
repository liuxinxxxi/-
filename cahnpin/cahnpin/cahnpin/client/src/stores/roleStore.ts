import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_ROLE_ID, ROLES, type RoleId } from '../config/roles'

/**
 * 全局角色状态（持久化到 localStorage）。
 * MVP 仅保存选中项供各页面展示，二期在此基础上挂载角色 Skill 逻辑。
 */
type RoleState = {
  roleId: RoleId
  setRoleId: (id: RoleId) => void
}

export const useRoleStore = create<RoleState>()(
  persist(
    (set) => ({
      roleId: DEFAULT_ROLE_ID,
      setRoleId: (roleId) => set({ roleId }),
    }),
    { name: 'pmw-role' },
  ),
)

export function useCurrentRole() {
  const roleId = useRoleStore((s) => s.roleId)
  return ROLES.find((r) => r.id === roleId) ?? ROLES[0]
}
