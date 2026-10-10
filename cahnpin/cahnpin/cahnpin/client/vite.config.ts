import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// Vite 配置：React 插件 + @ 路径别名 + /api 代理到本地 Express
// viteSingleFile：所有 JS/CSS 内联进单个 index.html——Chrome 禁止 file:// 页面
// 加载 <script type="module">，单文件化后解压双击 index.html 可直接打开（离线分发包）
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
