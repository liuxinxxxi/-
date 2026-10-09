/** 通用格式化工具 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 上游检索结果未提供原文链接时的兜底：按标题生成搜索引擎结果页地址。
 * 注意这不是原文链接，UI 必须明确标注为「搜索核验」，不得伪装成来源原文。
 */
export function searchVerifyUrl(title: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(title.trim())}`
}
