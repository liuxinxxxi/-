/**
 * Markdown 渲染封装：marked 解析 + DOMPurify 消毒，防止注入。
 * 仅在浏览器侧调用（DOMPurify 依赖 DOM）。
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(md: string): string {
  if (!md) return ''
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    // 仅保留常规排版标签，禁止脚本/事件属性（DOMPurify 默认策略已足够，显式声明更清晰）
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'ul', 'ol', 'li',
      'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'table', 'thead',
      'tbody', 'tr', 'th', 'td', 'a', 'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  })
}
