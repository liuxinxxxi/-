/**
 * 个人素材库（阶段 2）：
 * 五分类文件夹 + 拖拽上传 + 本地解析/OCR + 切片向量化入库（RAG）+ 检索自测。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, Inbox, Library, FolderOpen } from 'lucide-react'
import UploadZone from './UploadZone'
import MaterialItem from './MaterialItem'
import SearchTester from './SearchTester'
import Knowledge from '../Knowledge'
import { FOLDERS } from '../../config/folders'
import { isSupported } from '../../lib/parsers'
import { ingestFile } from '../../lib/pipeline'
import {
  countChunks,
  deleteMaterialCascade,
  getAllMaterials,
  putMaterial,
} from '../../lib/db'
import { toast } from '../../stores/uiStore'
import type { FolderId, Material } from '../../types'

type FolderFilter = FolderId | 'all'
type ViewTab = 'materials' | 'knowledge'

export default function Materials() {
  const [tab, setTab] = useState<ViewTab>('materials')
  const [materials, setMaterials] = useState<Material[]>([])
  const [activeFolder, setActiveFolder] = useState<FolderFilter>('all')
  const [busy, setBusy] = useState(false)
  const [chunkTotal, setChunkTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const refreshStats = useCallback(async () => {
    setChunkTotal(await countChunks())
  }, [])

  // 初始化：修复上次中断的 processing 记录，再加载列表
  useEffect(() => {
    ;(async () => {
      const all = await getAllMaterials()
      const stale = all.filter((m) => m.status === 'processing')
      if (stale.length > 0) {
        await Promise.all(
          stale.map((m) =>
            putMaterial({
              ...m,
              status: 'error',
              stage: '处理中断',
              progress: m.progress,
              errorMsg: '上次处理未完成（页面被关闭或刷新），请删除后重新上传',
            }),
          ),
        )
      }
      setMaterials(await getAllMaterials())
      await refreshStats()
      setLoaded(true)
    })()
  }, [refreshStats])

  // 各分类素材数量
  const folderCounts = useMemo(() => {
    const map: Record<string, number> = { all: materials.length }
    for (const m of materials) map[m.folder] = (map[m.folder] ?? 0) + 1
    return map
  }, [materials])

  const visibleMaterials = useMemo(
    () => (activeFolder === 'all' ? materials : materials.filter((m) => m.folder === activeFolder)),
    [materials, activeFolder],
  )

  const doneCount = useMemo(() => materials.filter((m) => m.status === 'done').length, [materials])

  // 接收上传文件：串行入库（OCR worker 与向量化请求不宜并发）
  const handleFiles = useCallback(
    async (files: File[], targetFolder: FolderId) => {
      const valid = files.filter((f) => {
        if (isSupported(f)) return true
        toast.error(`不支持的文件：${f.name}`)
        return false
      })
      if (valid.length === 0) return

      setBusy(true)
      for (const file of valid) {
        try {
          await ingestFile(file, targetFolder, {
            onUpdate: (m) => {
              setMaterials((prev) => {
                const idx = prev.findIndex((x) => x.id === m.id)
                if (idx < 0) return [m, ...prev]
                const next = [...prev]
                next[idx] = m
                return next
              })
            },
          })
        } catch {
          // 错误已落库并通过 onUpdate 反映到卡片，此处仅轻提示
          toast.error(`「${file.name}」处理失败`)
        }
      }
      await refreshStats()
      setBusy(false)
      toast.success(`本次 ${valid.length} 个文件处理完成`)
    },
    [refreshStats],
  )

  const handleDelete = useCallback(
    async (m: Material) => {
      if (!window.confirm(`确认删除「${m.name}」及其 ${m.chunkCount || ''} 个知识库切片？`)) return
      await deleteMaterialCascade(m.id)
      setMaterials((prev) => prev.filter((x) => x.id !== m.id))
      await refreshStats()
      toast.success('已删除')
    },
    [refreshStats],
  )

  return (
    <div className="page-container">
      {/* 顶部 Tab 切换：素材管理 / 知识库检索 */}
      <div className="flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setTab('materials')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
            tab === 'materials' ? 'bg-primary-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <FolderOpen size={14} />
          素材管理
        </button>
        <button
          onClick={() => setTab('knowledge')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
            tab === 'knowledge' ? 'bg-primary-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <Library size={14} />
          知识库检索
        </button>
      </div>

      {tab === 'knowledge' ? (
        <Knowledge embedded />
      ) : (
        <>
          {/* 页头 */}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">个人素材库</h1>
              <p className="mt-1.5 text-sm text-slate-400">
                上传文档与图片，自动提取文字、切片并向量化，构成本地 RAG 知识库
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-4 py-2 text-xs text-slate-500 shadow-sm">
              <Database size={14} className="text-primary-500" />
              素材 <span className="font-semibold text-slate-700">{doneCount}</span> 份 ·
              知识切片 <span className="font-semibold text-slate-700">{chunkTotal}</span> 个
            </div>
          </div>

      <div className="mt-8 flex gap-8">
        {/* 分类侧栏 */}
        <aside className="w-44 shrink-0">
          <button
            onClick={() => setActiveFolder('all')}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors ${
              activeFolder === 'all'
                ? 'bg-primary-50 font-medium text-primary-700'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            全部素材
            <span className="text-xs text-slate-400">{folderCounts.all ?? 0}</span>
          </button>
          <div className="mt-1 space-y-0.5">
            {FOLDERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFolder(f.id)}
                title={f.desc}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  activeFolder === f.id
                    ? 'bg-primary-50 font-medium text-primary-700'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <f.icon size={15} className={activeFolder === f.id ? 'text-primary-500' : 'text-slate-400'} />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-xs text-slate-400">{folderCounts[f.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* 主区域 */}
        <section className="min-w-0 flex-1 space-y-5">
          <UploadZone
            fixedFolder={activeFolder === 'all' ? null : (activeFolder as FolderId)}
            busy={busy}
            onFiles={handleFiles}
          />

          {/* 素材列表 */}
          {loaded && visibleMaterials.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center">
              <Inbox size={26} className="text-slate-300" />
              <p className="mt-3 text-sm text-slate-400">
                {activeFolder === 'all' ? '还没有素材，从上方上传第一份学习资料吧' : '该分类下暂无素材'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleMaterials.map((m) => (
                <MaterialItem key={m.id} material={m} onDelete={handleDelete} />
              ))}
            </div>
          )}

          <SearchTester hasChunks={chunkTotal > 0} />
        </section>
      </div>
        </>
      )}
    </div>
  )
}
