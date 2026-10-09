import { create } from 'zustand'

/**
 * 全局轻量提示（Toast）状态。
 */
export type ToastType = 'success' | 'error' | 'info'
export type ToastItem = { id: number; type: ToastType; message: string }

type UiState = {
  toasts: ToastItem[]
  pushToast: (type: ToastType, message: string) => void
  removeToast: (id: number) => void
}

let seq = 1

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (type, message) => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    // 3 秒后自动消失
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (msg: string) => useUiStore.getState().pushToast('success', msg),
  error: (msg: string) => useUiStore.getState().pushToast('error', msg),
  info: (msg: string) => useUiStore.getState().pushToast('info', msg),
}
