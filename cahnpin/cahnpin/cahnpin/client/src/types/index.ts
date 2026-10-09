/**
 * 领域模型类型定义（MVP：本地 IndexedDB 持久化）
 */

/** 素材库五分类 */
export type FolderId = 'business' | 'ai' | 'competitor' | 'review' | 'case'

/** 素材入库处理状态 */
export type MaterialStatus = 'processing' | 'done' | 'error'

export interface Material {
  id: string
  /** 原始文件名 */
  name: string
  /** 扩展名（小写，不含点），如 pdf / docx / md / png */
  ext: string
  mime: string
  size: number
  folder: FolderId
  status: MaterialStatus
  /** 当前处理阶段文案：解析中 / 切片中 / 向量化中 */
  stage: string
  /** 0-100 处理进度 */
  progress: number
  errorMsg?: string
  /** 提取全文长度（字符数） */
  textLength: number
  /** 入库切片数量 */
  chunkCount: number
  /** 是否经由 OCR 提取（图片类素材） */
  ocr: boolean
  /** 提取文本的前若干字符，用于列表预览 */
  previewText: string
  createdAt: number
}

/** 文本切片 + 向量（向量以 Float32Array 存储，2048 维） */
export interface ChunkRecord {
  id: string
  materialId: string
  materialName: string
  folder: FolderId
  /** 切片在原文中的顺序 */
  ordinal: number
  content: string
  embedding: Float32Array
  createdAt: number
}

/** 产品拆解报告（六层结构化 Markdown） */
export interface Teardown {
  id: string
  productName: string
  /** 完整 Markdown 报告 */
  content: string
  /** 生成时引用的附件（仅名称与字符数，附件本身不入库） */
  attachments: Array<{ name: string; chars: number }>
  /** 引用到的知识库素材名称 */
  sources: string[]
  /** 用户补充资料摘要（前 200 字，便于列表辨认） */
  brief: string
  model: string
  createdAt: number
  updatedAt: number
}

/** RAG 检索命中结果 */
export interface RagHit {
  content: string
  materialId: string
  materialName: string
  folder: FolderId
  /** 余弦相似度 0-1 */
  score: number
}

/* ---------------- 阶段 4：AI 产品专家陪练（6 项专家 Skill） ---------------- */

/**
 * 陪练模式 = 6 项专家 Skill。
 * 旧值 debate 已弃用（保留为字符串字面量类型以兼容已存历史会话只读展示），
 * 前端在 TRAINER_MODE_META 命中失败时回退为「已弃用模式」标签。
 */
export type TrainerMode =
  | 'brainstorm' // 产品脑暴创新
  | 'prd' // PRD&需求撰写
  | 'review' // 产品评审纠错（原"复盘引导"含义变更）
  | 'qa' // AI产品答疑
  | 'growth' // 个人成长指导
  | 'knowledge' // 知识库联动（强制开启 RAG）
  | 'debate' // 已弃用，仅用于历史会话只读兼容

/** 陪练会话 */
export interface Conversation {
  id: string
  title: string
  mode: TrainerMode
  /** 会话级 RAG 开关：开启时每轮用用户消息检索素材库注入上下文 */
  useRag: boolean
  createdAt: number
  updatedAt: number
}

/** 会话内单条消息 */
export interface TrainerMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  /** assistant 消息引用的知识库素材名（去重） */
  sources?: string[]
  createdAt: number
}

/* ---------------- 阶段 5：每日 AI 行业一推 ---------------- */

/** 资讯分类 */
export type InsightCategory = '模型发布' | '新产品' | '赛道趋势' | '落地方法论' | '政策法规'

/** 单条资讯卡片 */
export interface InsightItem {
  title: string
  category: InsightCategory
  /** 事件概述（发生了什么） */
  summary: string
  /** 为什么重要 */
  whyItMatters: string
  /** 对产品经理的启发 */
  pmInsight: string
  /** 来源名称与链接（由模型从检索结果提取，可能缺失） */
  sourceTitle?: string
  sourceUrl?: string
}

/** 每日推送：联网检索命中的单个网页（核验依据） */
export interface InsightSourceRef {
  title: string
  url?: string
  /** 来源平台/媒体名，如「知乎专栏」 */
  media?: string
  publishDate?: string
}

/** 某日的一组推送（id = date，天然每日一条、重新生成即覆盖） */
export interface Insight {
  id: string
  /** YYYY-MM-DD */
  date: string
  items: InsightItem[]
  /** 本次联网实际检索命中的网页清单（含可跳转链接，供逐条核验） */
  searchRefs: InsightSourceRef[]
  model: string
  createdAt: number
}

/* ---------------- 阶段 6：竞品商业洞察跟踪 ---------------- */

/** 被跟踪的竞品 */
export interface Competitor {
  id: string
  name: string
  /** 简介：赛道、产品定位（帮助检索与洞察聚焦） */
  description: string
  createdAt: number
  updatedAt: number
}

/** 竞品事件分类 */
export type CompetitorEventCategory = '融资' | '产品更新' | '战略合作' | '政策合规' | '人事组织' | '其他'

/** 联网检索命中的单个网页（事件的核验依据，追踪时固化入库） */
export interface CompetitorSourceRef {
  title: string
  url?: string
  /** 来源平台/媒体名，如「知乎专栏」 */
  media?: string
  publishDate?: string
}

/** 竞品事件（自动追踪或手动录入） */
export interface CompetitorEvent {
  id: string
  competitorId: string
  title: string
  /** 事件日期 YYYY-MM-DD；未知则为空字符串 */
  date: string
  category: CompetitorEventCategory
  /** 事件概述 */
  summary: string
  /** 商业视角洞察 */
  businessInsight: string
  /** AI 视角洞察 */
  aiInsight: string
  /** 应对建议 */
  suggestion: string
  /** 模型为该事件标注的直接来源（可能缺失，需以下方检索命中核验） */
  sourceTitle?: string
  sourceUrl?: string
  /** 自动追踪：本次联网实际检索命中的网页清单（空数组=未触发检索，内容不可采信） */
  searchRefs?: CompetitorSourceRef[]
  /** auto=联网自动追踪；manual=手动录入 */
  origin: 'auto' | 'manual'
  createdAt: number
  /** 爬虫搜索到的相关真实文章（爬虫模式追踪时填充，纯爬虫数据无 AI 编造） */
  crawlerArticles?: CrawledArticle[]
  /** 本次追踪搜索用的关键词 */
  keyword?: string
}

/* ---------------- 阶段 7：AI 产品实战复盘 ---------------- */

/** 复盘对话中的单条消息（内嵌于 Review，轮数有限不单独建表） */
export interface ReviewMsg {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

/** 复盘类型：self=自己的项目/决策复盘；case=外部 AI 产品案例复盘 */
export type ReviewType = 'self' | 'case'

/** 一次复盘（对话引导 + 结构化总结报告） */
export interface Review {
  id: string
  type: ReviewType
  /** 复盘对象：self 为项目/决策名，case 为产品名 */
  title: string
  /** 补充描述（背景、赛道等，帮助引导聚焦） */
  subject: string
  /** 引导对话记录 */
  messages: ReviewMsg[]
  /** 最终结构化总结报告（Markdown；空=未生成） */
  report: string
  /** case 类型：联网检索到的案例资料（注入对话上下文） */
  caseBrief: string
  status: 'chatting' | 'done'
  createdAt: number
  updatedAt: number
}

/* ---------------- 学练实操模块（替换原 Reviews，讲学练评复盘五闭环） ---------------- */

/** 学练实操的当前阶段：讲 / 学 / 练 / 评 / 复盘 */
export type PracticeStage = 'lecture' | 'learn' | 'practice' | 'grade' | 'review'

/** 习题难度三级：基础题 / 实操入门题 / 综合实战题 */
export type ExerciseLevel = 'basic' | 'handsOn' | 'case'

/** 单道习题 + 用户作答 + AI 批改结果 */
export interface PracticeExercise {
  id: string
  level: ExerciseLevel
  /** 题目正文（markdown） */
  question: string
  /** 题目自带的：任务目标 / 操作步骤 / 验收标准 / 常见错误 / 优化方向 */
  hint?: string
  /** 用户作答 */
  userAnswer: string
  /** AI 批改反馈（markdown，含错点、优化方案） */
  grading?: string
  /** 0-100 */
  score?: number
  gradedAt?: number
  createdAt: number
}

/** 贯穿五阶段的对话引导消息 */
export interface PracticeMsg {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

/** 一次学练实操：选主题 → 讲学练评复盘五闭环 */
export interface Practice {
  id: string
  /** 学习主题：RAG分块 / 向量库 / 工作流 / 重排 / Agent 等 */
  topic: string
  stage: PracticeStage
  /** 讲义 markdown */
  lecture: string
  /** 学：入库实训记录（chunkSize/overlap/分块策略/Embedding/召回测试结果） */
  learnLog: string
  /** 练：习题列表 */
  exercises: PracticeExercise[]
  /** 复盘报告 markdown（空=未生成） */
  reviewReport: string
  /** 贯穿五阶段的对话引导记录（轮数有限，内嵌不单独建表） */
  messages: PracticeMsg[]
  createdAt: number
  updatedAt: number
}

/* ---------------- 阶段 8：AI 产品经理知识一览 ---------------- */

/** 文章来源站点标识 */
export type ArticleSource = 'juejin' | 'woshipm' | 'infoq' | 'csdn'

/** 文章分类（用户可自定义增删改；builtIn 项不可删除，可改名改色） */
export interface ArticleCategory {
  id: string
  name: string
  /** 颜色样式类名（与 InsightCategory 同色板） */
  color: string
  sortOrder: number
  createdAt: number
  /** 是否系统默认（不可删除，可改名改色） */
  builtIn: boolean
}

/** 爬取的文章（每次爬取入库；用户可标记已读 / 收藏 / 分类） */
export interface Article {
  id: string
  /** 来源站点标识 */
  source: ArticleSource
  /** 来源站点显示名（掘金 / 人人都是产品经理 / InfoQ / CSDN） */
  sourceName: string
  /** 原文 URL */
  sourceUrl: string
  title: string
  /** 摘要（站点提供或截取正文） */
  summary: string
  /** 发布时间（站点返回，尽量归一为 YYYY-MM-DD） */
  publishedAt: string
  /** 阅读量（站点返回，缺失时为 0） */
  viewCount: number
  /** 用户分类 id 数组（多对多） */
  categoryIds: string[]
  /** 爬取批次日期 YYYY-MM-DD（同一天重爬则覆盖该批次） */
  crawlDate: string
  /** 爬取时间戳 */
  crawledAt: number
  /** 是否已读 */
  read: boolean
  /** 是否收藏 */
  favorite: boolean
}

/** 服务端爬虫标准化返回项（爬取后由前端组装为 Article 入库） */
export interface CrawledArticle {
  source: ArticleSource
  sourceName: string
  sourceUrl: string
  title: string
  summary: string
  publishedAt: string
  viewCount: number
}

/** 服务端爬虫接口响应 */
export interface CrawlResponse {
  articles: CrawledArticle[]
  /** 各站点实际命中数（便于前端展示来源覆盖） */
  stats: Array<{ source: ArticleSource; count: number; error?: string }>
  crawledAt: number
}
