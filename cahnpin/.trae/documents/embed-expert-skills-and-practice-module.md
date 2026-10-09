# 嵌入专家Skill + 复盘模块改为学练实操模块

## Context（背景与目标）

当前应用的两个模块需要按用户的产品设计重构：

1. **产品专家模块（/chat，AI产品专家陪练）** 现为「答疑/复盘/辩论」三模式。用户希望在此模块嵌入「AI产品经理专家Skill」6 项核心专家能力：产品脑暴、PRD撰写、评审纠错、AI答疑、个人成长、知识库联动。
2. **复盘模块（/reviews，个人复盘沉淀）** 现为「self/case 双类型 + 对话引导 + 报告」。用户希望整体改造为「学练实操模块」：RAG/向量库/工作流的「讲学练评复盘」五闭环实训导师，且"练/评"要做到完整出题+作业批改。

用户已确认三项关键决策：
- 产品专家：**迁移复盘→专家Skill**——保留 `qa` `review` 两个旧 mode 值（含义扩展），废弃 `debate`，新增 `brainstorm` `prd` `growth` `knowledge` 4 个 mode，最终 6 项 Skill。
- 复盘模块：**整体替换为讲学练评复盘**——`/reviews` 路由整体改造为 `/practice`，旧 reviews 数据保留只读。
- 练/评深度：**完整出题+作业批改**——实现三级习题（基础/实操入门/综合实战）+ AI 批改打分+优化方案。

## 一、产品专家模块：6 项专家 Skill

### 1. 类型层 `client/src/types/index.ts` L79-91

`TrainerMode` 由 `'qa' | 'review' | 'debate'` 改为：

```ts
export type TrainerMode =
  | 'brainstorm' // 产品脑暴创新
  | 'prd'        // PRD&需求撰写
  | 'review'     // 产品评审纠错（含义变更：原复盘引导 → 评审纠错）
  | 'qa'         // AI产品答疑（含义扩展）
  | 'growth'     // 个人成长指导
  | 'knowledge'  // 知识库联动（强制开启 RAG）
```

旧 `debate` 会话无法命中新的 `TRAINER_MODE_META`，需在 `SessionList`/`ChatPanel` 加 fallback：未知 mode 时显示为「已弃用模式」标签与默认图标，不阻塞阅读历史消息。

`Conversation` 其余字段不变。

### 2. Prompt 层 `client/src/lib/prompts.ts` L111-186

重写 `TRAINER_SYSTEM_PROMPTS`（6 项 system prompt，按用户原文要点落到位）：

| mode | Skill 名 | system prompt 要点 |
|---|---|---|
| brainstorm | 产品脑暴创新 | 接收模糊想法/需求/痛点 → 输出结构化方案：用户画像、场景拆解、核心痛点、MVP功能清单、差异化优势、商业化思路、风险预判 |
| prd | PRD&需求撰写 | 一句话想法 → 完整 PRD：背景目标、用户故事、功能优先级、交互规则、数据指标、验收标准、上线范围、排期建议 |
| review | 产品评审纠错 | 接收 PRD/方案/产品思路，逐点评审：需求漏洞、逻辑 bug、落地难点、体验问题、技术可行性，给可直接修改的优化方案 |
| qa | AI产品答疑 | 解答 RAG产品设计、Agent功能设计、提示词产品化、向量库应用、工作流产品设计、大模型行业方案、幻觉优化、用户体验 |
| growth | 个人成长指导 | 诊断能力短板、定制学习路线、拆解成长阶段、模拟面试、包装项目经历、梳理作品集、复盘工作问题 |
| knowledge | 知识库联动 | 优先调取用户私有产品资料/行业报告/笔记案例，基于私有资料+专家经验双重输出，引用必带来源 |

`TRAINER_MODE_META` 同步重写为 6 项的 `{ label, desc }`。

`buildTrainerMessages` 不需改动——它只按 `mode` 索引 `TRAINER_SYSTEM_PROMPTS[mode]`，自动适配。

### 3. UI 层

- `pages/ChatTrainer/SessionList.tsx` L7-11 `MODE_ICONS` 改为 6 项图标映射（`Lightbulb`/`FileText`/`ShieldCheck`/`HelpCircle`/`TrendingUp`/`Library`），并对未知 mode（旧 debate）回退默认图标 `MessagesSquare`。
- L50-79 模式选择弹层遍历 `TRAINER_MODE_META` 自动适配；6 项以两列网格更紧凑。
- `pages/ChatTrainer/ChatPanel.tsx` L8-13 `MODE_GUIDES` 改为 6 项空状态引导文案；旧 debate 会话回退默认引导。
- `pages/ChatTrainer/index.tsx` L257-263 空状态文案「答疑 · 复盘 · 辩论」改为「脑暴 · PRD · 评审 · 答疑 · 成长 · 知识库」。

### 4. 导航 `client/src/config/nav.tsx` L52-57

菜单文案「AI产品专家陪练」→「AI产品专家」；desc 改为「6 项专家 Skill：脑暴 / PRD / 评审 / 答疑 / 成长 / 知识库，基于你的知识库作答」。`path` 仍为 `/chat`。

## 二、学练实操模块（替换 /reviews）

### 1. 类型层 `client/src/types/index.ts` 末尾追加

```ts
/* ---------------- 学练实操模块（替换原 Reviews） ---------------- */

export type PracticeStage = 'lecture' | 'learn' | 'practice' | 'grade' | 'review'
/** 习题难度三级 */
export type ExerciseLevel = 'basic' | 'handsOn' | 'case'

export interface PracticeExercise {
  id: string
  level: ExerciseLevel
  /** 题目 markdown */
  question: string
  /** 操作步骤/验收标准/常见错误/优化方向（题目自带） */
  hint?: string
  /** 用户作答 */
  userAnswer: string
  /** AI 批改反馈 markdown（含错点、优化方案） */
  grading?: string
  /** 0-100 */
  score?: number
  gradedAt?: number
  createdAt: number
}

export interface PracticeMsg {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface Practice {
  id: string
  /** 学习主题：RAG分块/向量库/工作流/重排/Agent 等 */
  topic: string
  stage: PracticeStage
  /** 讲义 markdown */
  lecture: string
  /** 学：入库实训记录（chunkSize/overlap/embedding/召回测试结果） */
  learnLog: string
  /** 练：习题列表 */
  exercises: PracticeExercise[]
  /** 复盘报告 markdown */
  reviewReport: string
  /** 贯穿五阶段的对话引导 */
  messages: PracticeMsg[]
  createdAt: number
  updatedAt: number
}
```

`Review` 类型保留不动（旧数据只读）。

### 2. DB 层 `client/src/lib/db.ts`

- L9 `DB_VERSION` 由 `5` 升到 `6`。
- upgrade v6 分支：创建 `practices` store（`keyPath: 'id'`）+ `createdAt` 索引；参照 L103-128 v5 模式。
- 新增 `putPractice` / `getAllPractices` / `getPractice` / `deletePractice` 函数，参照 L329-343 reviews 同款实现。
- 旧 `reviews` store 不删除，仅不再写入；可保留 `getAllReviews`/`deleteReview` 用于"历史复盘只读"小入口。

### 3. Prompt 层 `client/src/lib/prompts.ts` 末尾追加

```ts
/* ---------------- 学练实操模块（讲学练评复盘五闭环） ---------------- */

export const PRACTICE_SYSTEM_PROMPT = `...`  // 实训导师人设：通俗、配产品案例、配实操场景、讲落地坑

export const PRACTICE_TOPICS = ['RAG架构与幻觉', '文档分块策略', '向量库与Embedding选型', '混合检索与Rerank', 'Agent工作流编排'] as const

export function buildPracticeLectureMessages(topic: string): ChatMessage[]
// 生成讲义 markdown：覆盖产品价值、核心概念、落地坑、产品案例

export function buildPracticeExerciseMessages(input: { topic: string; level: ExerciseLevel; count?: number }): ChatMessage[]
// 返回 JSON 数组：每题 { question, hint }；按 level 调难度
// 容错解析函数 parsePracticeExercises(content): { question: string; hint?: string }[]

export function buildPracticeGradingMessages(input: { topic: string; question: string; hint?: string; userAnswer: string }): ChatMessage[]
// 返回 JSON：{ score, feedback, weakPoints[], suggestions[] }
// 容错解析函数 parsePracticeGrading(content): { score: number; feedback: string; ... }

export function buildPracticeReviewMessages(practice: Practice): ChatMessage[]
// 基于 learnLog + exercises + grading 生成五节复盘报告：
// 一、本次掌握知识点清单；二、实操暴露的能力短板；三、错误原因总结（产品视角）；
// 四、针对性补强练习任务；五、下阶段学习规划
```

旧 `REVIEW_*` 系列与 `buildReviewMessages` 等保留不动（旧数据只读展示仍依赖）。

### 4. UI 层 新建 `client/src/pages/Practice/index.tsx`

替换原 `pages/Reviews/index.tsx` 的位置与职责。结构：

- **左侧**：Practice 列表（按主题，最近在前）+「新建实操」按钮（弹主题选择，从 `PRACTICE_TOPICS` 选或自定义）。
- **右侧**：顶部 5 个阶段 tab（讲/学/练/评/复盘）+ 主题标题。
  - **讲 tab**：展示 `practice.lecture`（markdown）；首次进入自动调用 `buildPracticeLectureMessages` 流式生成；可重新生成。
  - **学 tab**：入库实训引导——顶部一段说明引导用户去 `/materials` 上传资料；下方一个 `textarea` 让用户记录 `chunkSize / overlap / 分块策略 / Embedding模型 / 召回测试问题与命中率`，保存为 `learnLog`。
  - **练 tab**：习题列表，按 level 分三组（基础/实操入门/综合实战）。每题展示 `question` + `hint`，下方 `textarea` 收集 `userAnswer` +「提交批改」按钮 → 调 `buildPracticeGradingMessages` 流式生成 `grading` 与 `score`，写入 `exercise.grading`。首次进入自动调 `buildPracticeExerciseMessages` 为每个 level 各生成 1-2 题，用户可"再来一题"追加。
  - **评 tab**：批改总览——按题展示 `score` + `feedback` 摘要；底部一段「知识点盲区总结」（取所有 grading 的 weakPoints 汇总，前端拼接或单独调一次 AI 汇总）。
  - **复盘 tab**：展示 `practice.reviewReport`（markdown）；「生成复盘报告」按钮调 `buildPracticeReviewMessages`；支持预览/编辑/导出 .md（复用 Reviews 的 ReportPane 模式）。
- **空状态**：图标 +「RAG/向量库/工作流 讲学练评复盘五闭环」+「点击左上角新建实操」。
- **历史 reviews 只读入口**：左侧底部一个折叠区「历史复盘记录（已弃用）」，展开后调 `getAllReviews` 列出旧记录，点击进入只读 ReportPane（沿用旧 Reviews 的 ReportPane 组件，迁移到 Practice 目录或保留 Reviews 文件中复用）。

### 5. 路由与导航

- `client/src/App.tsx` L14, L86-93：`Reviews` 懒加载与 `/reviews` 路由 → 改为 `Practice` 与 `/practice`；并加一条 `<Route path="reviews" element={<Navigate to="/practice" replace />} />` 兼容旧入口。
- `client/src/config/nav.tsx` L66-71：`path` 由 `/reviews` 改为 `/practice`，label 由「个人复盘沉淀」改为「学练实操」，desc 改为「RAG/向量库/工作流 讲学练评复盘五闭环实训」。icon 由 `NotebookPen` 改为 `GraduationCap`。

## 关键文件清单

需要修改：
- `client/src/types/index.ts`——`TrainerMode` 改 6 项；新增 `Practice` 系列
- `client/src/lib/prompts.ts`——重写 `TRAINER_SYSTEM_PROMPTS`/`TRAINER_MODE_META`；新增 `PRACTICE_*` 与 4 个 build/parse 函数
- `client/src/lib/db.ts`——`DB_VERSION`→6，新增 `practices` store 与 4 个 CRUD 函数
- `client/src/pages/ChatTrainer/SessionList.tsx`——`MODE_ICONS` 改 6 项 + debate fallback
- `client/src/pages/ChatTrainer/ChatPanel.tsx`——`MODE_GUIDES` 改 6 项 + debate fallback
- `client/src/pages/ChatTrainer/index.tsx`——空状态文案
- `client/src/App.tsx`——路由 `/reviews`→`/practice`
- `client/src/config/nav.tsx`——菜单项文案与 path；icon

需要新建：
- `client/src/pages/Practice/index.tsx`——主页面（含 5 tab + 历史复盘只读入口）
- `client/src/pages/Practice/ReportPane.tsx`——复盘报告预览/编辑/导出（从 Reviews 迁移复用）

可保留不动（仅作为旧数据只读依赖）：
- `client/src/pages/Reviews/index.tsx`——若 Practice 复用其 `ReportPane`，可整体保留或拆分

## 复用与约束

- 复用 `streamChat` / `chatCompletion`（`lib/llm.ts`）、`searchRag`（`lib/rag.ts`）、`renderMarkdown`（`lib/markdown.ts`）、`uid`/`formatDate`（`lib/format.ts`）、`toast`（`stores/uiStore.ts`）。
- 复用 v5 升级分支（`db.ts` L103-128）作为新增 store 的写法参照。
- 复用 Reviews 现有 `ReportPane` 组件（`pages/Reviews/index.tsx` L636-744）作为 Practice 复盘 tab 的预览/编辑/导出实现参考。
- UI 风格遵循用户偏好：极简、低饱和蓝、圆角卡片、弱阴影、不冗余装饰。
- 不破坏旧 `debate` 会话与旧 reviews 数据的读取（fallback 显示）。

## 验证步骤

1. `cd c:\Users\lx\Desktop\cahnpin\cahnpin\cahnpin\client && pnpm dev`（或对应包管理器）启动前端。
2. 进入 `/chat`：
   - 点「新建陪练」→ 应看到 6 项 Skill 模式（脑暴/PRD/评审/答疑/成长/知识库）。
   - 分别选 `brainstorm` 与 `prd` 各发一句模糊想法，验证 AI 角色与输出结构符合 prompt。
   - 选 `knowledge` 模式时若无知识库应被引导先去素材库上传。
3. 进入 `/practice`（旧 `/reviews` 应自动重定向到此）：
   - 新建一次实操（主题选「文档分块策略」）→ 讲 tab 自动生成讲义。
   - 切到练 tab → 自动出 3 级各 1 题；作答后提交批改，应返回 score + feedback。
   - 评 tab 应汇总所有批改；复盘 tab 一键生成五节报告。
4. 数据库：刷新页面后所有 Practice 与新版 Conversation 持久化保留；旧 reviews 与旧 debate 会话可只读查看。
5. 类型检查：`pnpm build` 或 `pnpm tsc --noEmit` 通过。
