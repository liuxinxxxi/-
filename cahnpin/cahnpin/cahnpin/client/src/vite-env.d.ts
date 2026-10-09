/// <reference types="vite/client" />

// mammoth 浏览器构建未随包提供独立类型声明
declare module 'mammoth/mammoth.browser' {
  interface ExtractResult {
    value: string
    messages: unknown[]
  }
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer
  }): Promise<ExtractResult>
}

