import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import AppLayout from './layouts/AppLayout'
import { ToastHost } from './components/Toast'

// 页面级懒加载：素材解析器等重依赖只在进入对应模块时按需下载
const Home = lazy(() => import('./pages/Home'))
const DailyInsights = lazy(() => import('./pages/DailyInsights/index'))
const Competitors = lazy(() => import('./pages/CompetitorRadar/index'))
const ProductTeardown = lazy(() => import('./pages/ProductTeardown/index'))
const ChatTrainer = lazy(() => import('./pages/ChatTrainer/index'))
const Materials = lazy(() => import('./pages/Materials'))
const Practice = lazy(() => import('./pages/Practice/index'))
const Reviews = lazy(() => import('./pages/Reviews/index'))
const KnowledgeHub = lazy(() => import('./pages/KnowledgeHub/index'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const VersionLog = lazy(() => import('./pages/VersionLog/index'))

/** 路由切换时的轻量加载态 */
function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center text-primary-400">
      <Loader2 size={22} className="animate-spin" />
    </div>
  )
}

/**
 * 应用路由：所有页面共享 AppLayout（固定左侧导航）。
 * 新增模块时在此注册路由，并在 config/nav.ts 中补充菜单项即可。
 */
export default function App() {
  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoading />}>
                <Home />
              </Suspense>
            }
          />
          <Route
            path="insights"
            element={
              <Suspense fallback={<PageLoading />}>
                <DailyInsights />
              </Suspense>
            }
          />
          <Route
            path="competitors"
            element={
              <Suspense fallback={<PageLoading />}>
                <Competitors />
              </Suspense>
            }
          />
          <Route
            path="teardown"
            element={
              <Suspense fallback={<PageLoading />}>
                <ProductTeardown />
              </Suspense>
            }
          />
          <Route
            path="chat"
            element={
              <Suspense fallback={<PageLoading />}>
                <ChatTrainer />
              </Suspense>
            }
          />
          <Route
            path="materials"
            element={
              <Suspense fallback={<PageLoading />}>
                <Materials />
              </Suspense>
            }
          />
          <Route
            path="practice"
            element={
              <Suspense fallback={<PageLoading />}>
                <Practice />
              </Suspense>
            }
          />
          {/* 兼容旧 /reviews 入口：重定向到 /practice；旧 reviews 历史记录只读入口在 Practice 内 */}
          <Route
            path="reviews"
            element={
              <Suspense fallback={<PageLoading />}>
                <Reviews />
              </Suspense>
            }
          />
          <Route path="reviews-fallback" element={<Navigate to="/practice" replace />} />
          {/* 知识库检索已合并进 /materials 内部 tab；旧 /knowledge 链接重定向到 /materials */}
          <Route path="knowledge" element={<Navigate to="/materials" replace />} />
          <Route
            path="knowledge-hub"
            element={
              <Suspense fallback={<PageLoading />}>
                <KnowledgeHub />
              </Suspense>
            }
          />
          <Route
            path="dashboard"
            element={
              <Suspense fallback={<PageLoading />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageLoading />}>
                <Settings />
              </Suspense>
            }
          />
          <Route
            path="version-log"
            element={
              <Suspense fallback={<PageLoading />}>
                <VersionLog />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  )
}
