/**
 * IndexedDB 统一封装（idb 库）。
 * 业务数据全部本地持久化；阶段 2 启用 materials / chunks，
 * 其余 store 一次性创建，供后续阶段直接使用，避免 DB 版本升级。
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { Article, ArticleCategory, ChunkRecord, Competitor, CompetitorEvent, Conversation, Insight, Material, Practice, Review, Teardown, TrainerMessage } from '../types'

const DB_NAME = 'pm-workbench'
const DB_VERSION = 6

export const STORES = {
  materials: 'materials',
  chunks: 'chunks',
  teardowns: 'teardowns', // 阶段3：产品拆解报告
  conversations: 'conversations', // 阶段4：AI 陪练会话
  messages: 'messages', // 阶段4：对话消息
  competitors: 'competitors', // 阶段6：竞品档案
  insights: 'insights', // 阶段5：行业资讯
  reviews: 'reviews', // 阶段7：复盘笔记（已弃用，仅保留只读）
  practices: 'practices', // 学练实操模块（替换 reviews）
  events: 'events', // 阶段7：成长行为事件
  articles: 'articles', // 阶段8：AI 产品经理知识一览
  categories: 'categories', // 阶段8：文章分类
} as const

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    // 升级失败时清空缓存，允许后续重试，避免一次失败后永久不可用
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // v1：阶段 2 素材库
        if (oldVersion < 1) {
          const materials = db.createObjectStore(STORES.materials, { keyPath: 'id' })
          materials.createIndex('folder', 'folder')
          materials.createIndex('status', 'status')
          materials.createIndex('createdAt', 'createdAt')

          const chunks = db.createObjectStore(STORES.chunks, { keyPath: 'id' })
          chunks.createIndex('materialId', 'materialId')
          chunks.createIndex('folder', 'folder')
        }

        // v2：阶段 3 产品拆解 + 后续阶段预留 store
        if (oldVersion < 2) {
          const teardowns = db.createObjectStore(STORES.teardowns, { keyPath: 'id' })
          teardowns.createIndex('createdAt', 'createdAt')

          const conversations = db.createObjectStore(STORES.conversations, { keyPath: 'id' })
          conversations.createIndex('createdAt', 'createdAt')

          const messages = db.createObjectStore(STORES.messages, { keyPath: 'id' })
          messages.createIndex('conversationId', 'conversationId')

          const competitors = db.createObjectStore(STORES.competitors, { keyPath: 'id' })
          competitors.createIndex('createdAt', 'createdAt')

          const insights = db.createObjectStore(STORES.insights, { keyPath: 'id' })
          insights.createIndex('createdAt', 'createdAt')

          const reviews = db.createObjectStore(STORES.reviews, { keyPath: 'id' })
          reviews.createIndex('createdAt', 'createdAt')

          const events = db.createObjectStore(STORES.events, { keyPath: 'id' })
          events.createIndex('createdAt', 'createdAt')
        }

        // v3：结构自愈。开发期版本演进曾产生「store 已存在但索引缺失」的漂移库；
        // 此处对全部表/索引做幂等补齐，任何历史中间态升级后结构都收敛一致。
        if (oldVersion < 3) {
          const expected: Array<[string, Array<[string, string]>]> = [
            [STORES.materials, [['folder', 'folder'], ['status', 'status'], ['createdAt', 'createdAt']]],
            [STORES.chunks, [['materialId', 'materialId'], ['folder', 'folder']]],
            [STORES.teardowns, [['createdAt', 'createdAt']]],
            [STORES.conversations, [['createdAt', 'createdAt']]],
            [STORES.messages, [['conversationId', 'conversationId']]],
            [STORES.competitors, [['createdAt', 'createdAt']]],
            [STORES.insights, [['createdAt', 'createdAt']]],
            [STORES.reviews, [['createdAt', 'createdAt']]],
            [STORES.events, [['createdAt', 'createdAt']]],
          ]
          for (const [storeName, indexes] of expected) {
            const store = db.objectStoreNames.contains(storeName)
              ? transaction.objectStore(storeName)
              : db.createObjectStore(storeName, { keyPath: 'id' })
            for (const [indexName, keyPath] of indexes) {
              if (!store.indexNames.contains(indexName)) {
                store.createIndex(indexName, keyPath)
              }
            }
          }
        }

        // v4：阶段 6 竞品事件按竞品维度查询，补 competitorId 索引
        if (oldVersion < 4) {
          const store = transaction.objectStore(STORES.events)
          if (!store.indexNames.contains('competitorId')) {
            store.createIndex('competitorId', 'competitorId')
          }
        }

        // v5：阶段 8 AI 产品经理知识一览
        if (oldVersion < 5) {
          const articles = db.createObjectStore(STORES.articles, { keyPath: 'id' })
          articles.createIndex('crawlDate', 'crawlDate')
          articles.createIndex('source', 'source')
          articles.createIndex('favorite', 'favorite')
          articles.createIndex('crawledAt', 'crawledAt')

          const categories = db.createObjectStore(STORES.categories, { keyPath: 'id' })
          categories.createIndex('sortOrder', 'sortOrder')
          // 种子默认分类（builtIn=true 不可删除，可改名改色）
          const seedCats: Array<[string, string, string, number]> = [
            ['cat-ai-tech', 'AI 技术', 'bg-violet-50 text-violet-600', 1],
            ['cat-pm-method', '产品方法论', 'bg-primary-50 text-primary-600', 2],
            ['cat-business', '商业分析', 'bg-emerald-50 text-emerald-600', 3],
            ['cat-industry', '行业动态', 'bg-amber-50 text-amber-600', 4],
            ['cat-user-research', '用户研究', 'bg-rose-50 text-rose-500', 5],
            ['cat-data', '数据分析', 'bg-cyan-50 text-cyan-600', 6],
          ]
          const now = Date.now()
          for (const [id, name, color, sortOrder] of seedCats) {
            const cat: ArticleCategory = { id, name, color, sortOrder, createdAt: now, builtIn: true }
            categories.put(cat)
          }
        }

        // v6：学练实操模块（替换原 reviews，原 reviews 表保留只读兼容）
        if (oldVersion < 6) {
          const practices = db.createObjectStore(STORES.practices, { keyPath: 'id' })
          practices.createIndex('createdAt', 'createdAt')
        }
      },
    }).catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

/* ---------------- 素材 ---------------- */

export async function putMaterial(material: Material): Promise<void> {
  const db = await getDB()
  await db.put(STORES.materials, material)
}

export async function getAllMaterials(): Promise<Material[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.materials, 'createdAt')
  // 索引默认升序，页面按时间倒序展示
  return list.reverse()
}

export async function deleteMaterialCascade(materialId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORES.materials, STORES.chunks], 'readwrite')
  await tx.objectStore(STORES.materials).delete(materialId)
  const chunkStore = tx.objectStore(STORES.chunks)
  let cursor = await chunkStore.index('materialId').openCursor(materialId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

/* ---------------- 切片 ---------------- */

export async function putChunks(chunks: ChunkRecord[]): Promise<void> {
  if (chunks.length === 0) return
  const db = await getDB()
  const tx = db.transaction(STORES.chunks, 'readwrite')
  await Promise.all(chunks.map((c) => tx.store.put(c)))
  await tx.done
}

export async function getAllChunks(): Promise<ChunkRecord[]> {
  const db = await getDB()
  return db.getAll(STORES.chunks)
}

/* ---------------- 产品拆解报告（阶段 3） ---------------- */

export async function putTeardown(report: Teardown): Promise<void> {
  const db = await getDB()
  await db.put(STORES.teardowns, report)
}

export async function getTeardown(id: string): Promise<Teardown | undefined> {
  const db = await getDB()
  return db.get(STORES.teardowns, id)
}

export async function getAllTeardowns(): Promise<Teardown[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.teardowns, 'createdAt')
  return list.reverse()
}

export async function deleteTeardown(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.teardowns, id)
}

export async function countChunks(): Promise<number> {
  const db = await getDB()
  return db.count(STORES.chunks)
}

/* ---------------- AI 陪练会话（阶段 4） ---------------- */

export async function putConversation(conv: Conversation): Promise<void> {
  const db = await getDB()
  await db.put(STORES.conversations, conv)
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDB()
  return db.get(STORES.conversations, id)
}

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.conversations, 'createdAt')
  return list.reverse()
}

/** 删除会话并级联删除其全部消息 */
export async function deleteConversationCascade(conversationId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORES.conversations, STORES.messages], 'readwrite')
  await tx.objectStore(STORES.conversations).delete(conversationId)
  const msgStore = tx.objectStore(STORES.messages)
  let cursor = await msgStore.index('conversationId').openCursor(conversationId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function putTrainerMessage(msg: TrainerMessage): Promise<void> {
  const db = await getDB()
  await db.put(STORES.messages, msg)
}

export async function getTrainerMessages(conversationId: string): Promise<TrainerMessage[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.messages, 'conversationId', conversationId)
  // 索引按主键序返回，按时间重排保证展示顺序
  return list.sort((a, b) => a.createdAt - b.createdAt)
}

/* ---------------- 每日 AI 行业一推（阶段 5） ---------------- */

export async function putInsight(insight: Insight): Promise<void> {
  const db = await getDB()
  await db.put(STORES.insights, insight)
}

export async function getInsight(id: string): Promise<Insight | undefined> {
  const db = await getDB()
  return db.get(STORES.insights, id)
}

export async function getAllInsights(): Promise<Insight[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.insights, 'createdAt')
  return list.reverse()
}

export async function deleteInsight(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.insights, id)
}

/* ---------------- 竞品商业洞察跟踪（阶段 6） ---------------- */

export async function putCompetitor(competitor: Competitor): Promise<void> {
  const db = await getDB()
  await db.put(STORES.competitors, competitor)
}

export async function getAllCompetitors(): Promise<Competitor[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.competitors, 'createdAt')
  return list.reverse()
}

/** 删除竞品并级联删除其全部事件 */
export async function deleteCompetitorCascade(competitorId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORES.competitors, STORES.events], 'readwrite')
  await tx.objectStore(STORES.competitors).delete(competitorId)
  const eventStore = tx.objectStore(STORES.events)
  let cursor = await eventStore.index('competitorId').openCursor(competitorId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function putCompetitorEvent(event: CompetitorEvent): Promise<void> {
  const db = await getDB()
  await db.put(STORES.events, event)
}

export async function putCompetitorEvents(events: CompetitorEvent[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORES.events, 'readwrite')
  for (const event of events) {
    await tx.store.put(event)
  }
  await tx.done
}

/** 某竞品的全部事件（按事件日期倒序，无日期排最后） */
export async function getCompetitorEvents(competitorId: string): Promise<CompetitorEvent[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.events, 'competitorId', competitorId)
  return list.sort((a, b) => (b.date || '0000-00-00').localeCompare(a.date || '0000-00-00'))
}

export async function deleteCompetitorEvent(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.events, id)
}

/* ---------------- AI 产品实战复盘（阶段 7） ---------------- */

export async function putReview(review: Review): Promise<void> {
  const db = await getDB()
  await db.put(STORES.reviews, review)
}

export async function getAllReviews(): Promise<Review[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.reviews, 'createdAt')
  return list.reverse()
}

export async function deleteReview(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.reviews, id)
}

/* ---------------- 学练实操模块（讲学练评复盘五闭环） ---------------- */

export async function putPractice(practice: Practice): Promise<void> {
  const db = await getDB()
  await db.put(STORES.practices, practice)
}

export async function getPractice(id: string): Promise<Practice | undefined> {
  const db = await getDB()
  return (await db.get(STORES.practices, id)) as Practice | undefined
}

export async function getAllPractices(): Promise<Practice[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.practices, 'createdAt')
  return list.reverse()
}

export async function deletePractice(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.practices, id)
}

/* ---------------- AI 产品经理知识一览（阶段 8） ---------------- */

export async function putArticle(article: Article): Promise<void> {
  const db = await getDB()
  await db.put(STORES.articles, article)
}

export async function putArticles(articles: Article[]): Promise<void> {
  if (articles.length === 0) return
  const db = await getDB()
  const tx = db.transaction(STORES.articles, 'readwrite')
  await Promise.all(articles.map((a) => tx.store.put(a)))
  await tx.done
}

/** 全部文章（按爬取时间倒序） */
export async function getAllArticles(): Promise<Article[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.articles, 'crawledAt')
  return list.reverse()
}

/** 某批次日期的文章（按阅读量倒序，无阅读量排最后） */
export async function getArticlesByDate(crawlDate: string): Promise<Article[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.articles, 'crawlDate', crawlDate)
  return list.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
}

/** 删除某批次日期的全部文章（同一天重爬前调用以覆盖该批次） */
export async function deleteArticlesByDate(crawlDate: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORES.articles, 'readwrite')
  let cursor = await tx.store.index('crawlDate').openCursor(crawlDate)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function deleteArticle(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.articles, id)
}

/* ---------------- 文章分类 ---------------- */

export async function putCategory(category: ArticleCategory): Promise<void> {
  const db = await getDB()
  await db.put(STORES.categories, category)
}

export async function getAllCategories(): Promise<ArticleCategory[]> {
  const db = await getDB()
  const list = await db.getAllFromIndex(STORES.categories, 'sortOrder')
  return list
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.categories, id)
}
