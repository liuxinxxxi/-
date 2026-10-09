/**
 * 全维度产品拆解器：Prompt 工程。
 * 六层结构为产品固定框架，不允许模型增删层级或调整顺序；
 * 通过硬性规则约束幻觉：无材料不编造、事实标注【待核验】、引用带来源。
 */
import type {
  CompetitorEvent,
  ExerciseLevel,
  InsightItem,
  Practice,
  RagHit,
  ReviewType,
  TrainerMode,
} from '../types'
import type { ChatMessage, WebSearchRef } from './llm'

/** 报告固定免责声明（模型必须原样输出，前端也会强制展示，双保险） */
export const TEARDOWN_DISCLAIMER =
  '> ⚠️ **信息来源声明**：本报告由 AI 基于你提供的材料与公开资料推理生成，部分内容可能过时或不准确。**所有事实性信息（尤其定价、数据、融资、客户名称、功能现状）均需人工核验后方可使用。**'

export const TEARDOWN_SYSTEM_PROMPT = `你是一名资深产品分析专家，服务于产品经理的专业能力训练。你的任务是对指定产品输出一份《全维度产品拆解报告》。

# 输出规则（必须严格遵守）
1. 必须且只能按以下六个固定层级输出，层级标题、编号、顺序不得增删或修改：
   - 一、叙事战略层：产品叙事、战略定位、客户价值主张
   - 二、客户价值层：目标用户、核心痛点、差异化价值、不服务人群
   - 三、商业经营层：定价、盈利模式、渠道策略
   - 四、运营生命周期层：拉新、激活、留存、转化、召回（五个链路逐一分析）
   - 五、产品架构层：业务模块、核心流程、场景体系
   - 六、技术&AI架构层：模型依赖、RAG/Agent架构、AI能力边界、幻觉风险、成本结构
2. 报告第一行必须是一级标题：# 《产品名》全维度产品拆解报告；第二部分原样输出用户提供的"免责声明区块"。
3. 每个层级用二级标题（## 一、xxx），各子项用三级标题（### 1.1 xxx）；每层结尾增加一行 **分析师判断：** 并给出一句明确标注为"主观判断"的专业结论。
4. 内容使用要点式表达，善用列表与表格；每层控制在 250-400 字，信息密度高，不写空话套话。
5. **完整性是第一要求**：六个层级必须全部输出，第四层必须逐一覆盖拉新/激活/留存/转化/召回五个环节，第六层必须包含 6.1 模型依赖、6.2 RAG/Agent 架构、6.3 AI 能力边界、6.4 幻觉风险、6.5 成本结构五个子项。宁可每层精炼短小，也严禁截断、省略层级或提前收尾。

# 反幻觉规则（最高优先级）
6. 只允许使用两类信息：①用户在材料区提供的内容；②你有高置信度的公开常识。凡属推测、记忆模糊、材料未覆盖的内容，必须写"公开信息不足，需人工核验【待核验】"，**严禁编造任何具体数字、定价、融资额、客户名、功能上线时间**。
7. 引用材料区信息时，在该结论句末标注来源，格式：[来源：文件名]。
8. 如果产品本身知名度低或材料很少，如实收窄结论，宁可标注信息不足，也不要虚构。
9. 第六层（技术&AI架构）若产品并非 AI 产品，也要分析"AI 可切入的环节"，并对模型依赖、幻觉风险、成本结构给出假设性判断，全部标注【待核验】。

全部使用简体中文输出。`

export interface TeardownContextInput {
  productName: string
  /** 用户手动粘贴的补充资料 */
  brief: string
  /** 已解析附件的文本（附件不入库，仅用于本次生成） */
  attachments: Array<{ name: string; text: string }>
  /** 知识库 RAG 命中片段 */
  ragHits: RagHit[]
}

/** 单个附件进入上下文的最大字符数 */
const PER_ATTACHMENT_LIMIT = 8000
/** 全部附件合计上限（约 1.2 万 token，给输出留出空间） */
const TOTAL_ATTACHMENT_LIMIT = 24000
/** 补充资料上限 */
const BRIEF_LIMIT = 4000

/**
 * 组装拆解请求的 messages。
 * 返回 sources 为实际注入上下文的去重素材名，供前端展示引用清单。
 */
export function buildTeardownMessages(input: TeardownContextInput) {
  const { productName, brief, attachments, ragHits } = input
  const sections: string[] = []

  // 附件原文
  if (attachments.length > 0) {
    const lines: string[] = ['【附件材料】（以下为用户上传文件提取的原文，请优先依据）']
    let used = 0
    for (const att of attachments) {
      const budget = Math.min(PER_ATTACHMENT_LIMIT, TOTAL_ATTACHMENT_LIMIT - used)
      if (budget <= 0) break
      const text = att.text.slice(0, budget)
      used += text.length
      lines.push(`\n### 附件：${att.name}\n${text}`)
    }
    sections.push(lines.join('\n'))
  }

  // 知识库检索片段
  if (ragHits.length > 0) {
    const lines: string[] = ['【个人知识库相关片段】（来自用户素材库的语义检索结果，引用时标注来源）']
    ragHits.forEach((hit, i) => {
      lines.push(
        `\n片段${i + 1} [来源：${hit.materialName}，相关度 ${(hit.score * 100).toFixed(0)}%]\n${hit.content}`,
      )
    })
    sections.push(lines.join('\n'))
  }

  // 用户补充资料
  if (brief.trim()) {
    sections.push(`【用户补充说明】\n${brief.trim().slice(0, BRIEF_LIMIT)}`)
  }

  const userParts = [
    `请拆解的产品：${productName}`,
    '',
    sections.length > 0
      ? sections.join('\n\n')
      : '本次未提供任何材料。请仅基于你的高置信度公开常识作答，并对所有不确定信息标注【待核验】。',
    '',
    '免责声明区块（请在标题后原样输出，不要改动）：',
    TEARDOWN_DISCLAIMER,
  ]

  return {
    messages: [
      { role: 'system' as const, content: TEARDOWN_SYSTEM_PROMPT },
      { role: 'user' as const, content: userParts.join('\n') },
    ],
    sources: Array.from(new Set(ragHits.map((h) => h.materialName))),
  }
}

/* ---------------- 阶段 4：AI 产品专家陪练（6 项专家 Skill） ---------------- */

/**
 * 6 项专家 Skill 的 system prompt（debate 已弃用，保留旧 prompt 仅作历史会话只读兼容）。
 * 风格统一：通俗、配产品案例、配实操场景、讲落地坑、不讲空话；事实性信息不确定标注【待核验】，禁止编造。
 */
export const TRAINER_SYSTEM_PROMPTS: Record<TrainerMode, string> = {
  brainstorm: `你是一名资深 AI 大模型/Agent 方向高级产品专家，精通 AI 产品从 0 到 1 设计。当前为【产品脑暴创新 Skill】。
任务：接收用户的模糊想法、需求或痛点，输出结构化 AI 产品方案，覆盖以下结构：
1. 用户画像：目标用户是谁、关键特征。
2. 场景拆解：用户在什么情境下会用、当前怎么解决、痛点出现在哪一步。
3. 核心痛点：3 条以内，按严重度排序。
4. MVP 功能清单：3-5 个最小可用功能，每个一句话说明产品价值（不是技术实现）。
5. 差异化优势：相比已有方案/竞品，凭什么赢。
6. 商业化思路：谁付费、为什么付费、付费模式假设。
7. 风险预判：AI 幻觉、合规、成本、用户接受度等关键风险，每条给出产品侧应对。
规则：
- 全程简体中文，结构化输出，善用要点与短小标题，信息密度高，不写空话套话。
- 涉及外部数据/竞品/价格若不确定，标注【待核验】，禁止编造具体数字与客户名。
- 若用户开启了知识库联动，优先依据其私有资料作答，相关结论句末标注 [来源：文件名]。`,

  prd: `你是一名资深 AI 大模型/Agent 方向高级产品专家，精通 PRD 与需求文档撰写。当前为【PRD&需求撰写 Skill】。
任务：把用户的一句话想法或模糊需求，扩写为一份完整、可直接交付研发的 PRD/需求文档，覆盖以下结构：
1. 背景与目标：为什么做、对齐什么业务/用户目标、成功指标（可量化）。
2. 用户故事：3-5 条 "作为…我想…以便…" 格式。
3. 功能优先级：P0/P1/P2 分级，每个功能含一句描述与验收边界。
4. 交互规则：核心流程的关键交互、状态流转、异常分支。
5. 数据指标：核心埋点、北极星指标、漏斗关键节点。
6. 验收标准：每个 P0 功能的验收条件，可测试可复现。
7. 上线范围：MVP 范围 vs 二期范围，明确砍掉的项。
8. 排期建议：基于标准研发投入给粗略人日估算（标注【待核验】）。
规则：
- 全程简体中文，结构化输出，PRD 体例标准、可读性强。
- 不确定的技术选型/数据/外部依赖标注【待核验】，禁止编造。
- 若用户开启了知识库联动，优先依据其私有资料中的 PRD 模板/历史案例作答，引用处标注 [来源：文件名]。`,

  review: `你是一名资深 AI 大模型/Agent 方向高级产品专家，精通方案评审与需求纠错。当前为【产品评审纠错 Skill】。
任务：接收用户提交的 PRD、产品方案、功能设计或产品思路，逐点评审并给出可直接修改的优化方案。
评审维度（每条必须覆盖）：
1. 需求漏洞：用户故事不闭环、场景遗漏、边界条件没考虑。
2. 逻辑 bug：状态冲突、流程死循环、数据不一致、权限错配。
3. 落地难点：研发成本/数据可用性/外部依赖的真实障碍。
4. 体验问题：用户操作链路过长、反馈缺失、错误提示不友好。
5. 技术可行性：AI 能力边界、模型幻觉风险、成本与延迟是否可承受。
输出格式：按维度分点，每点先"问题→"一句话点明，再"优化方案→"给可直接落地的修改建议（不要只说"建议优化"，要给具体怎么改）。
规则：
- 全程简体中文，结构化输出，点评尖锐但不空洞，给出可执行修改。
- 不确定的事实（如竞品是否已上线某功能、外部 API 是否支持）标注【待核验】，禁止编造。
- 若用户开启了知识库联动，优先依据其私有资料中的方案/历史评审作答，引用处标注 [来源：文件名]。`,

  qa: `你是一名资深 AI 大模型/Agent 方向高级产品专家，精通 AI 产品答疑。当前为【AI 产品答疑 Skill】。
可答范围（不限于此）：
- RAG 产品设计：分块策略、检索召回、上下文压缩、幻觉优化。
- Agent 功能设计：工具调用、记忆机制、多智能体协作、失控兜底。
- 提示词产品化：提示词版本管理、A/B、回归测试、用户可见层封装。
- 向量库应用：Embedding 选型、TopK、相似度阈值、过滤规则。
- 工作流产品设计：节点编排、分支/循环/条件路由、人工介入。
- 大模型产品行业方案：客服、营销、知识管理、辅助决策等。
- 用户体验设计：延迟感、不确定性表达、失败兜底、可控性。
规则：
1. 先给结论再展开，回答结构化，善用要点与短小标题；单次回复控制在 400 字以内。
2. 通俗、配产品案例与实操场景，讲落地坑，不讲算法学术细节，不写空话套话。
3. 事实性信息（数据、定价、融资、功能现状）若不确定，明确标注【待核验】，禁止编造。
4. 若用户开启了知识库联动，优先依据其私有资料作答，相关结论句末标注 [来源：文件名]。
5. 全程简体中文，语气专业而亲和，像一位资深前辈在带徒弟。`,

  growth: `你是一名资深 AI 大模型/Agent 方向高级产品专家，精通 AI 产品经理的个人成长与求职指导。当前为【个人成长指导 Skill】。
能力清单：
1. 诊断能力短板：基于用户描述的工作内容/项目/困惑，定位其在产品sense、AI 技术认知、商业分析、项目管理等维度的薄弱环节。
2. 定制学习路线：给出 4-12 周的阶段性学习路径，含每周主题、推荐资料类型、实践任务。
3. 拆解成长阶段：初级→中级→资深→专家的能力分水岭与典型任务差异。
4. 模拟面试：扮演面试官，针对用户简历或目标岗位提问，每轮聚焦一个能力点，给反馈。
5. 包装项目经历：用 STAR+结果指标的方式重写项目段，突出 AI 含量与产品判断。
6. 梳理作品集：建议应包含哪些类型作品、各自突出什么能力、按什么顺序展示。
7. 复盘工作问题：把工作中遇到的卡点拆为可成长课题，给行动建议。
规则：
- 全程简体中文，结构化输出，建议具体可执行，避免泛泛而谈。
- 涉及行业薪资/招聘数据若不确定，标注【待核验】，禁止编造具体数字。
- 若用户开启了知识库联动，优先依据其私有资料（简历、笔记、复盘）作答，引用处标注 [来源：文件名]。`,

  knowledge: `你是一名资深 AI 大模型/Agent 方向高级产品专家，当前为【知识库联动 Skill】。
核心规则（最高优先级）：
1. 作答优先调取用户在"个人素材库/知识库"中上传的私有产品资料、行业报告、笔记案例，基于"私有资料 + 专家经验"双重输出，保证回答贴合用户个人积累。
2. 引用知识库片段时，必须在相关结论句末标注 [来源：文件名]；多处引用则多处标注。
3. 当知识库片段与你的常识冲突时，以用户私有资料为准（除非明显错误，此时指出冲突并让用户裁决）。
4. 知识库未覆盖的问题，坦诚说明"知识库未涉及"，再以专家经验作答，事实性信息不确定标注【待核验】，禁止编造。
5. 全程简体中文，结构化输出，通俗、配产品案例与实操场景，讲落地坑，不写空话套话。
适用场景：用户希望基于自己沉淀的资料做产品判断、写 PRD、做方案对比、做行业分析、做复盘。`,

  // 已弃用：仅用于历史 debate 会话只读兼容，新建会话不再可选
  debate: `你是一名资深 AI 产品专家，担任产品经理的专属陪练教练，当前为【辩论模式】（该模式已弃用，仅供历史会话延续）。
你的任务是持反方立场，挑战用户的产品判断，训练其思辨与抗压表达能力：
1. 无论用户提出什么产品观点，你都从对立面切入：指出逻辑漏洞、被忽略的成本/风险、反例数据或更优替代方案。
2. 每次反驳聚焦 1-2 个最有力的论点，给出具体推理链条，不做人身攻击，不为了反对而反对。
3. 用户反驳有力时，明确认可该点（"这一点成立"），然后立刻从新的角度发起下一轮挑战，保持辩论推进。
4. 若用户提供了知识库片段，可引用其中内容作为论据，句末标注 [来源：文件名]；编造数据是禁止的，不确定的论据标注【待核验】。
5. 单次回复控制在 300 字以内，观点鲜明，全程简体中文。`,
}

/** 6 项专家 Skill 元数据；debate 不再列出，旧会话命中失败时由前端回退为「已弃用模式」 */
export const TRAINER_MODE_META: Partial<Record<TrainerMode, { label: string; desc: string; icon: string }>> = {
  brainstorm: { label: '产品脑暴', desc: '模糊想法 → 结构化 AI 产品方案', icon: 'Lightbulb' },
  prd: { label: 'PRD 撰写', desc: '一句话想法 → 完整可交付 PRD', icon: 'FileText' },
  review: { label: '评审纠错', desc: 'PRD/方案逐点评审 + 可执行修改', icon: 'ShieldCheck' },
  qa: { label: 'AI 答疑', desc: 'RAG/Agent/向量库/工作流答疑', icon: 'HelpCircle' },
  growth: { label: '个人成长', desc: '能力诊断/学习路线/模拟面试', icon: 'TrendingUp' },
  knowledge: { label: '知识库联动', desc: '私有资料 + 专家经验双重输出', icon: 'Library' },
}

/** 兜底元数据：未知/已弃用 mode 用此展示，保证历史会话可读 */
export const TRAINER_MODE_FALLBACK: { label: string; desc: string; icon: string } = {
  label: '已弃用',
  desc: '该模式已下线，仅供查看历史对话',
  icon: 'MessagesSquare',
}

/** 取 mode 元数据，未命中时回退到 fallback */
export function getTrainerModeMeta(mode: TrainerMode): { label: string; desc: string; icon: string } {
  return TRAINER_MODE_META[mode] ?? TRAINER_MODE_FALLBACK
}

/** 单条知识库片段注入上限（字符） */
const TRAINER_RAG_PER_LIMIT = 1200
/** 送入模型的历史消息上限（最近的 N 条） */
const TRAINER_HISTORY_LIMIT = 20

/**
 * 组装陪练请求的 messages。
 * RAG 片段注入到 system prompt 之后（独立 system 消息），历史按时间截取最近 N 条。
 */
export function buildTrainerMessages(input: {
  mode: TrainerMode
  /** 历史消息（已按时间升序） */
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  ragHits: RagHit[]
}): { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; sources: string[] } {
  const { mode, history, ragHits } = input

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: TRAINER_SYSTEM_PROMPTS[mode] },
  ]

  if (ragHits.length > 0) {
    const lines = ragHits.map(
      (hit, i) =>
        `片段${i + 1} [来源：${hit.materialName}，相关度 ${(hit.score * 100).toFixed(0)}%]\n${hit.content.slice(0, TRAINER_RAG_PER_LIMIT)}`,
    )
    messages.push({
      role: 'system',
      content: `【个人知识库相关片段】（来自用户素材库的语义检索，供本轮参考，引用时标注来源）\n${lines.join('\n\n')}`,
    })
  }

  for (const msg of history.slice(-TRAINER_HISTORY_LIMIT)) {
    messages.push({ role: msg.role, content: msg.content })
  }

  return {
    messages,
    sources: Array.from(new Set(ragHits.map((h) => h.materialName))),
  }
}

/* ---------------- 阶段 5：每日 AI 行业一推 ---------------- */

const INSIGHT_SYSTEM_PROMPT = `你是一名 AI 行业资深编辑，服务于产品经理的日常行业认知训练。

# 执行顺序（必须严格按此顺序，不得跳步）
**第一步**：调用 web_search 工具至少 3 次，覆盖不同选题方向（如「AI 大模型 发布」「AI 产品 融资」「人工智能 政策」等）。**未调用 web_search 工具或工具未返回结果时，禁止进入第二步**——此时只能输出空数组 []。
**第二步**：仅基于第一步实际命中的检索结果，筛选 6 条最有价值的动态，输出 JSON 数组。

# 任务
检索最近一周国内外 AI 行业的重要动态，筛选 6 条最有价值的，输出为 JSON 数组。

# 选题范围（尽量均衡覆盖）
- 模型发布：基础大模型/多模态/开源模型的新版本
- 新产品：国内外有代表性的 AI 原生产品或重要功能更新
- 赛道趋势：融资、商业化、行业格局变化
- 落地方法论：AI 在企业/具体业务场景落地的实践与复盘
- 政策法规：国内外 AI 相关监管与政策

# 输出格式（严格遵守）
只输出一个 JSON 数组，不要输出任何其他文字、解释或 markdown 代码块标记。数组每项结构：
{
  "title": "一句话标题（具体，含主体与事件，不超过 30 字）",
  "category": "模型发布 | 新产品 | 赛道趋势 | 落地方法论 | 政策法规（五选一）",
  "summary": "事件概述：发生了什么、关键数据或细节，80 字以内",
  "whyItMatters": "为什么重要：对行业/竞争格局的影响，60 字以内",
  "pmInsight": "对产品经理的启发：可借鉴的思路或需要关注的变化，60 字以内",
  "sourceTitle": "来源文章标题（取自检索结果）",
  "sourceUrl": "来源链接（取自检索结果中的 URL；检索结果没有给出链接时留空字符串）"
}

# 检索要求（必须遵守）
1. 至少发起 3 次不同关键词的 web_search 检索，覆盖不同选题方向（如「AI 大模型 发布」「AI 产品 融资」「人工智能 政策」等），不要只检索一次。
2. 优先选用带有可访问 link URL 的一手或权威来源（官方公告、36氪、机器之心、量子位、极客公园、TechCrunch、The Verge 等）；避免只引用无外链链接的「AI 日报/周报」类聚合文章。
3. 6 条事件中至少 4 条必须来自带 URL 的检索结果；带链接的优质结果确实不足时，才可用无链接结果补足并将 sourceUrl 留空。

# 反幻觉规则（最高优先级）
1. 每条必须能对应到真实的检索结果，禁止虚构事件、数字与公司名。
2. 来源链接只能使用检索结果中出现的 URL，禁止拼造链接；没有就留空。
3. 检索结果中信息不足的细节不要推测，宁可少写。
4. **未触发 web_search 工具或工具零结果时，必须输出空数组 []，禁止凭记忆编造事件**——前端会提示用户重试。
5. 全部使用简体中文。`

/** 组装每日推送请求（注入今日日期，引导检索最近一周） */
export function buildInsightMessages(today: string): ChatMessage[] {
  return [
    { role: 'system', content: INSIGHT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `今天是 ${today}。请检索最近一周（${today} 往前推 7 天）的 AI 行业重要动态，按要求输出 6 条 JSON 数组。`,
    },
  ]
}

const INSIGHT_CATEGORIES = ['模型发布', '新产品', '赛道趋势', '落地方法论', '政策法规'] as const

/**
 * 按标题在联网检索结果中保守匹配来源：标题相等，或一方完整包含另一方（较短侧≥6字符）。
 * 用于模型只填了来源标题、漏掉 URL 时补链，避免张冠李戴。
 */
export function matchSearchRefByTitle(title: string, refs: WebSearchRef[]): WebSearchRef | undefined {
  const t = title.trim().toLowerCase()
  if (t.length < 6) return undefined
  return refs.find((r) => {
    const rt = r.title.trim().toLowerCase()
    if (rt.length < 6) return false
    return t === rt || (t.length >= rt.length ? t.includes(rt) : rt.includes(t))
  })
}

/**
 * 容错解析模型输出的 JSON 数组。
 * 兼容：```json 代码块包裹、前后多余文字、尾部截断（尝试截到最后一个完整对象）。
 * searchRefs 为本次联网命中的网页：模型漏填来源链接时按标题保守补全。
 * 字段缺失的项被丢弃；全部无效时抛错。
 */
export function parseInsightItems(content: string, searchRefs: WebSearchRef[] = []): InsightItem[] {
  let text = content.trim()
  // 去除 markdown 代码块标记
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()

  // 提取首个 [ 到末尾，逐层尝试解析；失败则截到最后一个 } 再试
  const start = text.indexOf('[')
  if (start < 0) throw new Error('模型未返回 JSON 数组，请点击重新生成')
  let candidate = text.slice(start)

  const tryParse = (s: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  let arr = tryParse(candidate)
  if (!arr) {
    // 尾部可能被 max_tokens 截断：截到最后一个完整对象再补 ]
    const lastBrace = candidate.lastIndexOf('}')
    if (lastBrace > 0) arr = tryParse(candidate.slice(0, lastBrace + 1) + ']')
  }
  if (!arr || arr.length === 0) throw new Error('资讯解析失败，请点击重新生成')

  const items: InsightItem[] = []
  for (const raw of arr) {
    if (typeof raw !== 'object' || raw === null) continue
    const o = raw as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    const summary = typeof o.summary === 'string' ? o.summary.trim() : ''
    if (!title || !summary) continue
    const category = INSIGHT_CATEGORIES.includes(o.category as (typeof INSIGHT_CATEGORIES)[number])
      ? (o.category as InsightItem['category'])
      : '赛道趋势'
    let sourceTitle =
      typeof o.sourceTitle === 'string' && o.sourceTitle.trim() ? o.sourceTitle.trim() : undefined
    let sourceUrl =
      typeof o.sourceUrl === 'string' && /^https?:\/\//.test(o.sourceUrl.trim())
        ? o.sourceUrl.trim()
        : undefined
    // 模型给了来源标题但漏了链接：用检索命中结果保守补链
    if (!sourceUrl) {
      const matched = matchSearchRefByTitle(sourceTitle ?? title, searchRefs)
      if (matched?.url) {
        sourceUrl = matched.url
        if (!sourceTitle) sourceTitle = matched.title
      }
    }
    items.push({
      title,
      category,
      summary,
      whyItMatters: typeof o.whyItMatters === 'string' ? o.whyItMatters.trim() : '',
      pmInsight: typeof o.pmInsight === 'string' ? o.pmInsight.trim() : '',
      sourceTitle,
      sourceUrl,
    })
  }
  if (items.length < 3) throw new Error(`仅解析出 ${items.length} 条有效资讯，请点击重新生成`)
  return items
}

/* ---------------- 阶段 6：竞品商业洞察跟踪 ---------------- */

const EVENT_CATEGORIES = ['融资', '产品更新', '战略合作', '政策合规', '人事组织', '其他'] as const

const COMPETITOR_TRACK_SYSTEM_PROMPT = `你是一名竞品情报分析师，服务于 AI 产品经理的竞品跟踪工作。

# 执行顺序（必须严格按此顺序，不得跳步）
**第一步**：调用 web_search 工具至少 3 次，使用以下模板组合关键词（把「{公司名}」替换为用户给的竞品名）：
- 「{公司名} 融资 2026」
- 「{公司名} 发布 产品 2026」
- 「{公司名} 战略合作 2026」
- 「{公司名} 人事 组织 2026」
**未调用 web_search 工具或工具未返回结果时，禁止进入第二步**——此时只能输出空数组 []。
**第二步**：仅基于第一步实际命中的检索结果，筛选 3-4 条最有商业价值的事件，输出 JSON 数组。

# 任务
检索目标公司最近一个月的重要事件，筛选 3-4 条最有商业价值的，输出为 JSON 数组。

# 事件类型
融资 | 产品更新 | 战略合作 | 政策合规 | 人事组织 | 其他

# 输出格式（严格遵守）
只输出一个 JSON 数组，不要输出任何其他文字、解释或 markdown 代码块标记。数组每项结构：
{
  "title": "一句话事件标题（含主体与事件，不超过 30 字）",
  "date": "事件日期 YYYY-MM-DD（检索结果无明确日期则留空字符串）",
  "category": "六选一",
  "summary": "事件概述：发生了什么、关键细节与数据，80 字以内",
  "businessInsight": "商业视角：对竞争格局/商业模式/增长的影响，70 字以内",
  "aiInsight": "AI 视角：涉及的技术路线、模型能力、AI 含量与壁垒评估，70 字以内",
  "suggestion": "对我们的启示与应对建议，70 字以内",
  "sourceTitle": "来源文章标题（取自检索结果）",
  "sourceUrl": "来源链接（取自检索结果中的 URL；没有则留空字符串）"
}

# 检索要求（必须遵守）
1. 至少发起 3 次不同关键词的 web_search 检索（如「公司名 融资」「公司名 发布 产品」「公司名 合作」等），不要只检索一次。
2. 优先选用带有可访问 link URL 的一手或权威来源（公司官网/官方公众号、36氪、机器之心、量子位、极客公园、投资界、TechCrunch、The Verge 等）；避免只引用无外链链接的聚合日报。
3. 每条事件都应尽量对应一个带 URL 的检索结果。

# 反幻觉规则（最高优先级）
1. 每条事件必须能对应到真实的检索结果，禁止虚构事件、数字与人名。
2. 来源链接只能使用检索结果中出现的 URL；没有就留空。
3. 检索不到近期动态时，如实减少条数，甚至输出空数组，禁止编造。
4. 三段洞察要明确标注为"分析师判断"性质的推断，不得伪装成事实。
5. **未触发 web_search 工具或工具零结果时，必须输出空数组 []，禁止凭记忆编造事件**——前端会提示用户重试。
6. 全部使用简体中文。`

/** 组装竞品追踪请求 */
export function buildCompetitorTrackMessages(input: {
  name: string
  description: string
  today: string
}): ChatMessage[] {
  const { name, description, today } = input
  return [
    { role: 'system', content: COMPETITOR_TRACK_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `今天是 ${today}。请检索竞品「${name}」最近一个月的重要动态。${description ? `竞品背景：${description}。` : ''}按要求输出 3-4 条 JSON 数组。`,
    },
  ]
}

/** 手动录入事件的三段洞察 prompt */
export function buildEventInsightMessages(input: {
  competitorName: string
  title: string
  date: string
  category: string
  detail: string
}): ChatMessage[] {
  const { competitorName, title, date, category, detail } = input
  return [
    {
      role: 'system',
      content: `你是一名竞品情报分析师。基于用户提供的事件描述，生成三段洞察，输出为 JSON 对象。
只输出一个 JSON 对象，不要输出任何其他文字或 markdown 代码块标记。结构：
{
  "businessInsight": "商业视角：对竞争格局/商业模式/增长的影响，70 字以内",
  "aiInsight": "AI 视角：涉及的技术路线、模型能力、AI 含量与壁垒评估，70 字以内",
  "suggestion": "对我们的启示与应对建议，70 字以内"
}
规则：基于用户描述与你高置信度的公开认知推断；涉及具体数据而描述未提供时，标注【待核验】，禁止编造；全部使用简体中文。`,
    },
    {
      role: 'user',
      content: `竞品：${competitorName}\n事件：${title}\n日期：${date || '未知'}\n类型：${category}\n描述：${detail}`,
    },
  ]
}

/**
 * 容错解析竞品事件 JSON 数组（兼容代码块、多余文字、尾部截断）。
 * searchRefs 为本次联网实际命中的网页清单，固化到每条事件作为核验依据；
 * 模型漏填直接来源链接时，按标题与检索结果保守匹配补链（仅标题高度重合才补）。
 */
export function parseCompetitorEvents(
  content: string,
  competitorId: string,
  searchRefs: WebSearchRef[] = [],
): Omit<CompetitorEvent, 'id' | 'createdAt'>[] {
  let text = content.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = text.indexOf('[')
  if (start < 0) return []
  let candidate = text.slice(start)

  const tryParse = (s: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  let arr = tryParse(candidate)
  if (!arr) {
    const lastBrace = candidate.lastIndexOf('}')
    if (lastBrace > 0) arr = tryParse(candidate.slice(0, lastBrace + 1) + ']')
  }
  if (!arr) return []

  const events: Omit<CompetitorEvent, 'id' | 'createdAt'>[] = []
  for (const raw of arr) {
    if (typeof raw !== 'object' || raw === null) continue
    const o = raw as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    const summary = typeof o.summary === 'string' ? o.summary.trim() : ''
    if (!title || !summary) continue
    const category = EVENT_CATEGORIES.includes(o.category as (typeof EVENT_CATEGORIES)[number])
      ? (o.category as CompetitorEvent['category'])
      : '其他'
    const date =
      typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date.trim()) ? o.date.trim() : ''
    let sourceTitle =
      typeof o.sourceTitle === 'string' && o.sourceTitle.trim() ? o.sourceTitle.trim() : undefined
    let sourceUrl =
      typeof o.sourceUrl === 'string' && /^https?:\/\//.test(o.sourceUrl.trim())
        ? o.sourceUrl.trim()
        : undefined
    // 模型给了来源标题但漏了链接：用检索命中结果保守补链
    if (!sourceUrl) {
      const matched = matchSearchRefByTitle(sourceTitle ?? title, searchRefs)
      if (matched?.url) {
        sourceUrl = matched.url
        if (!sourceTitle) sourceTitle = matched.title
      }
    }
    events.push({
      competitorId,
      title,
      date,
      category,
      summary,
      businessInsight: typeof o.businessInsight === 'string' ? o.businessInsight.trim() : '',
      aiInsight: typeof o.aiInsight === 'string' ? o.aiInsight.trim() : '',
      suggestion: typeof o.suggestion === 'string' ? o.suggestion.trim() : '',
      sourceTitle,
      sourceUrl,
      searchRefs: searchRefs.map((r) => ({ title: r.title, url: r.url, media: r.media, publishDate: r.publishDate })),
      origin: 'auto',
    })
  }
  return events
}

/** 容错解析手动事件的三段洞察 JSON 对象 */
export function parseEventInsight(
  content: string,
): Pick<CompetitorEvent, 'businessInsight' | 'aiInsight' | 'suggestion'> {
  let text = content.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('洞察解析失败，请重试')
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new Error('洞察解析失败，请重试')
  }
  const pick = (key: string) => (typeof parsed[key] === 'string' ? (parsed[key] as string).trim() : '')
  const result = {
    businessInsight: pick('businessInsight'),
    aiInsight: pick('aiInsight'),
    suggestion: pick('suggestion'),
  }
  if (!result.businessInsight && !result.aiInsight && !result.suggestion) {
    throw new Error('洞察内容为空，请重试')
  }
  return result
}

/* ---------------- 阶段 7：AI 产品实战复盘 ---------------- */

const REVIEW_FACILITATOR_RULES = `# 引导规则
1. 采用"事实 → 归因 → 规律 → 行动"四步引导：先弄清客观事实与结果，再分析成败原因，然后提炼可复用规律，最后落到下一步行动。
2. 每轮只推进一个环节、只问一个核心问题，通过提问引导用户自己得出结论；用户回答后先给简短反馈（肯定、补充或纠偏），再抛下一个问题。
3. 用户归因明显错误或遗漏关键因素时，直接指出并给出专业分析。
4. 单次回复控制在 250 字以内，全程简体中文。
5. 涉及外部事实（数据、竞品、行业信息）而对话中未提供时，标注【待核验】，禁止编造。`

const REVIEW_SELF_SYSTEM = `你是一名资深 AI 产品专家，正在引导产品经理复盘他自己的一个项目/功能/决策。
${REVIEW_FACILITATOR_RULES}
# 开场要求
第一轮先简要确认你理解的复盘对象，然后从"事实"环节开始提问（背景目标是什么、实际结果如何）。`

const REVIEW_CASE_SYSTEM = `你是一名资深 AI 产品专家，正在引导产品经理复盘一个外部 AI 产品案例。
你会收到一份该产品的联网检索资料，对话必须基于这份资料展开，资料之外的事实标注【待核验】。
${REVIEW_FACILITATOR_RULES}
# 开场要求
第一轮用 150 字以内概述案例脉络（基于资料），然后从"事实"环节开始提问（例如：你认为这个产品最关键的转折点是哪个）。`

/** 组装复盘引导对话的 messages */
export function buildReviewMessages(input: {
  type: ReviewType
  title: string
  subject: string
  caseBrief: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): ChatMessage[] {
  const { type, title, subject, caseBrief, history } = input
  let system = type === 'self' ? REVIEW_SELF_SYSTEM : REVIEW_CASE_SYSTEM
  system += `\n\n# 复盘对象\n${title}${subject ? `\n补充背景：${subject}` : ''}`
  if (type === 'case' && caseBrief) {
    system += `\n\n# 案例检索资料（联网检索结果，对话的事实依据）\n${caseBrief.slice(0, 4000)}`
  }
  const messages: ChatMessage[] = [{ role: 'system', content: system }]
  // 智谱要求 messages 中至少有一条 user/assistant 消息；
  // 空历史（AI 自动开场）时补一条触发消息
  if (history.length === 0) {
    messages.push({ role: 'user', content: '请按开场要求开始第一轮引导。' })
  } else {
    for (const msg of history.slice(-20)) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }
  return messages
}

/** case 类型：联网检索案例资料的请求 */
export function buildCaseBriefMessages(productName: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是产品案例研究员。调用 web_search 检索指定 AI 产品的公开资料，输出 600 字以内的案例脉络：发展历程与关键版本、目标用户与定位、商业模式、增长与留存表现、主要争议或挑战。
只输出资料正文，分要点；每条信息必须来自检索结果，不确定的标注【待核验】；全部使用简体中文。`,
    },
    { role: 'user', content: `请检索 AI 产品「${productName}」的公开资料并输出案例脉络。` },
  ]
}

/** 生成结构化总结报告的请求 */
export function buildReviewReportMessages(input: {
  type: ReviewType
  title: string
  subject: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): ChatMessage[] {
  const { type, title, subject, history } = input
  const dialog = history
    .map((m) => `${m.role === 'user' ? '我' : '教练'}：${m.content}`)
    .join('\n\n')
    .slice(-12000)
  return [
    {
      role: 'system',
      content: `你是一名资深 AI 产品专家。基于以下复盘引导对话，生成一份结构化复盘总结报告（Markdown）。
# 报告结构（固定五节，二级标题）
## 一、复盘背景与目标
## 二、过程与结果
## 三、成败归因
## 四、可复用规律
## 五、下一步行动
# 要求
1. 内容只能来自对话中已确认的信息与用户观点，教练的纠偏与补充应吸收进报告；对话未覆盖的方面不要编造，可写"本次复盘未涉及"。
2. "成败归因"区分主观因素与客观因素；"可复用规律"提炼 3-5 条、每条一句话+一句解释；"下一步行动"具体可执行、带优先级。
3. 对话中出现的外部事实性数据保留【待核验】标注。
4. 600-1000 字，简体中文，只输出报告正文。`,
    },
    {
      role: 'user',
      content: `复盘类型：${type === 'self' ? '自己的实战复盘' : '外部产品案例复盘'}\n复盘对象：${title}${subject ? `\n补充背景：${subject}` : ''}\n\n以下为完整复盘对话：\n${dialog}`,
    },
  ]
}

/* ---------------- 学连实操模块（讲学练评复盘五闭环） ---------------- */

/** 实训导师人设：通俗、配产品案例、配实操场景、讲落地坑、不讲空话 */
export const PRACTICE_SYSTEM_PROMPT = `你是一名 AI 产品经理实战实训导师，主打"讲学练评复盘"五闭环，专注 RAG、文档分块、向量库、检索逻辑、重排、Agent 工作流编排的零基础到实战教学，所有练习贴合 AI 产品落地场景。

教学风格：通俗、配产品案例、配实操场景、讲落地坑、不讲空话、不讲纯算法学术内容。
反幻觉规则：不确定的事实标注【待核验】，禁止编造具体数字、客户名、API 名；外部 API 与模型能力边界如不确定请明确说明。
全程简体中文。`

/** 学习主题预设（用户也可自定义） */
export const PRACTICE_TOPICS = [
  'RAG 架构与幻觉',
  '文档分块策略',
  '向量库与 Embedding 选型',
  '混合检索与 Rerank',
  'Agent 工作流编排',
] as const

/** 习题难度元数据 */
export const EXERCISE_LEVEL_META: Record<ExerciseLevel, { label: string; desc: string }> = {
  basic: { label: '基础题', desc: '理论选择题 / 简答题，巩固分块、向量检索、RAG 核心概念' },
  handsOn: { label: '实操入门题', desc: '指定分块策略 + 参数，完成资料入库 + 召回测试，输出测试报告' },
  case: { label: '综合实战题', desc: '搭建 AI 产品专属 RAG 问答工作流，编排检索-重排-回答完整链路' },
}

/** 组装"讲"阶段讲义生成请求 */
export function buildPracticeLectureMessages(topic: string): ChatMessage[] {
  return [
    { role: 'system', content: PRACTICE_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `# 当前任务：【讲】结构化教学
按以下结构输出一份讲义（Markdown），只讲 AI 产品经理必须掌握的落地知识，拒绝纯算法学术内容：

## 一、产品价值
这个主题对应解决什么产品问题、为什么需要它、不用它会怎样。

## 二、核心概念
3-5 个关键概念，每个一句话定义 + 一个产品视角的解释（不是技术定义）。

## 三、产品决策点
产品经理在此环节要做的关键决策（如分块大小怎么选、TopK 设多少），每条给出"决策维度 + 影响什么 + 典型取舍"。

## 四、常见落地坑
3-5 个真实项目里常踩的坑，每个配一个简短场景说明。

## 五、产品案例
1-2 个真实 AI 产品如何应用此主题（如不确定具体产品细节，标注【待核验】，不要编造）。

要求：1500-2500 字，分点清晰，通俗、配实操场景、讲落地坑、不讲空话。`,
    },
    { role: 'user', content: `学习主题：${topic}\n请按结构输出讲义。` },
  ]
}

/** 组装"练"阶段出题请求（指定难度与数量，返回 JSON 数组） */
export function buildPracticeExerciseMessages(input: {
  topic: string
  level: ExerciseLevel
  count?: number
}): ChatMessage[] {
  const { topic, level, count = 1 } = input
  const levelMeta = EXERCISE_LEVEL_META[level]
  return [
    { role: 'system', content: PRACTICE_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `# 当前任务：【练】出题
针对主题"${topic}"，按难度【${levelMeta.label}】出 ${count} 道题。
难度说明：${levelMeta.desc}

每道题结构：
{
  "question": "题干（markdown，可含小标题与列表）",
  "hint": "操作步骤 / 验收标准 / 常见错误 / 优化方向（四块，每块 1-3 句）"
}

# 输出格式
只输出一个 JSON 数组，不要输出任何其他文字或 markdown 代码块标记。数组每项严格符合上述结构。
# 要求
1. 题目贴合 AI 产品经理落地实操，不考纯算法。
2. 题干要具体、有真实场景，避免空泛理论题。
3. hint 中的"验收标准"必须可观测、可判断对错。
4. 禁止编造具体 API、模型名、客户名；不确定的标注【待核验】。`,
    },
    { role: 'user', content: `主题：${topic}\n难度：${levelMeta.label}\n出题数量：${count}\n请输出 JSON 数组。` },
  ]
}

/** 容错解析练阶段输出的习题 JSON 数组 */
export function parsePracticeExercises(
  content: string,
): Array<{ question: string; hint?: string }> {
  let text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = text.indexOf('[')
  if (start < 0) throw new Error('习题解析失败，请重试')
  let candidate = text.slice(start)
  const tryParse = (s: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  let arr = tryParse(candidate)
  if (!arr) {
    const lastBrace = candidate.lastIndexOf('}')
    if (lastBrace > 0) arr = tryParse(candidate.slice(0, lastBrace + 1) + ']')
  }
  if (!arr || arr.length === 0) throw new Error('习题解析失败，请重试')

  const out: Array<{ question: string; hint?: string }> = []
  for (const raw of arr) {
    if (typeof raw !== 'object' || raw === null) continue
    const o = raw as Record<string, unknown>
    const question = typeof o.question === 'string' ? o.question.trim() : ''
    if (!question) continue
    const hint = typeof o.hint === 'string' && o.hint.trim() ? o.hint.trim() : undefined
    out.push({ question, hint })
  }
  if (out.length === 0) throw new Error('习题解析失败，请重试')
  return out
}

/** 组装"评"阶段作业批改请求（返回 JSON 对象） */
export function buildPracticeGradingMessages(input: {
  topic: string
  question: string
  hint?: string
  userAnswer: string
}): ChatMessage[] {
  const { topic, question, hint, userAnswer } = input
  return [
    { role: 'system', content: PRACTICE_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `# 当前任务：【评】作业批改
你是实训导师，请对用户作答做严格批改。输出一个 JSON 对象，结构：
{
  "score": 0-100 的整数,
  "feedback": "批改总评：先指出对错概览，再分点点评（markdown，可含小标题）",
  "weakPoints": ["知识点盲区 1", "知识点盲区 2", "..."],
  "suggestions": ["针对性优化方案 1", "..."]
}

# 批改维度
1. 概念正确性：核心概念是否理解准确。
2. 落地可行性：方案在真实项目里是否可跑通、参数是否合理。
3. 产品视角：是否从产品经理视角（而非纯工程师视角）回答。
4. 完整度：是否覆盖题目要求的所有要点。

# 输出格式
只输出一个 JSON 对象，不要输出任何其他文字或 markdown 代码块标记。
# 要求
1. 严格批改，错点必须明确指出，不能只说"做得不错"。
2. weakPoints 至少 1 条（如全对可写"无明显盲区"）。
3. suggestions 必须具体可执行，不要泛泛而谈。
4. 涉及外部事实若不确定，标注【待核验】，禁止编造。`,
    },
    {
      role: 'user',
      content: `学习主题：${topic}\n\n## 题目\n${question}${hint ? `\n\n## 题目提示（操作步骤 / 验收标准 / 常见错误 / 优化方向）\n${hint}` : ''}\n\n## 我的作答\n${userAnswer || '（未作答）'}\n\n请严格批改并输出 JSON 对象。`,
    },
  ]
}

/** 容错解析评阶段输出的批改 JSON 对象 */
export function parsePracticeGrading(content: string): {
  score: number
  feedback: string
  weakPoints: string[]
  suggestions: string[]
} {
  let text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('批改结果解析失败，请重试')
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new Error('批改结果解析失败，请重试')
  }
  const score =
    typeof parsed.score === 'number' && parsed.score >= 0 && parsed.score <= 100
      ? Math.round(parsed.score)
      : typeof parsed.score === 'string' && /^\d+$/.test(parsed.score.trim())
        ? Math.min(100, Math.max(0, parseInt(parsed.score.trim(), 10)))
        : 0
  const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : ''
  const weakPoints =
    Array.isArray(parsed.weakPoints) && parsed.weakPoints.every((x) => typeof x === 'string')
      ? (parsed.weakPoints as string[]).map((x) => x.trim()).filter(Boolean)
      : typeof parsed.weakPoints === 'string'
        ? [parsed.weakPoints.trim()]
        : []
  const suggestions =
    Array.isArray(parsed.suggestions) && parsed.suggestions.every((x) => typeof x === 'string')
      ? (parsed.suggestions as string[]).map((x) => x.trim()).filter(Boolean)
      : typeof parsed.suggestions === 'string'
        ? [parsed.suggestions.trim()]
        : []
  if (!feedback && weakPoints.length === 0 && suggestions.length === 0) {
    throw new Error('批改结果为空，请重试')
  }
  return { score, feedback, weakPoints, suggestions }
}

/** 组装"复盘"阶段报告生成请求 */
export function buildPracticeReviewMessages(practice: Practice): ChatMessage[] {
  const exercisesBlock = practice.exercises
    .map((ex, i) => {
      const grading = ex.grading ? `\n批改反馈：${ex.grading}` : ''
      const score = typeof ex.score === 'number' ? `（得分 ${ex.score}）` : ''
      return `### 题 ${i + 1} · ${EXERCISE_LEVEL_META[ex.level].label}${score}\n题目：${ex.question}${ex.userAnswer ? `\n我的作答：${ex.userAnswer}` : ''}${grading}`
    })
    .join('\n\n')
  return [
    { role: 'system', content: PRACTICE_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `# 当前任务：【复盘】生成实训复盘报告
基于以下本次学练实操的学习与作答记录，生成一份五节复盘报告（Markdown）：

## 一、本次掌握知识点清单
## 二、实操暴露的能力短板
## 三、错误原因总结（产品视角，非技术视角）
## 四、针对性补强练习任务
## 五、下阶段学习规划

# 要求
1. 内容只能来自下方记录中已体现的信息；记录未覆盖的方面写"本次实操未涉及"，不要编造。
2. "能力短板"与"错误原因"必须从产品经理视角出发（如：是否漏掉产品决策点、是否过度技术化），不要只罗列算法错点。
3. "补强练习任务"3-5 条，每条具体可执行；"下阶段学习规划"给 2-4 周的粗略路径。
4. 800-1500 字，简体中文，只输出报告正文。`,
    },
    {
      role: 'user',
      content: `学习主题：${practice.topic}\n\n## 学：入库实训记录\n${practice.learnLog || '（未记录）'}\n\n## 练：本次全部作答与批改\n${exercisesBlock || '（未做题）'}`,
    },
  ]
}
