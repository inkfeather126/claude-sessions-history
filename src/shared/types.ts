// 主进程 / preload / 渲染层共用的类型定义

/** 项目(文件夹)聚合信息 */
export interface ProjectSummary {
  /** ~/.claude/projects 下的目录名(编码后的路径,作为稳定 key) */
  projectDir: string
  /** 真实工作目录绝对路径(优先取自 jsonl 内 cwd 字段,否则由目录名还原) */
  projectPath: string
  /** 该项目的会话数量 */
  sessionCount: number
  /** 该项目最近一次活动时间(ms epoch),无则为 0 */
  lastActivity: number
}

/** 会话列表项(已合并自定义别名) */
export interface SessionSummary {
  sessionId: string
  projectDir: string
  projectPath: string
  /** 最终展示标题:别名 > aiTitle > slug > 首条用户消息 > 短码 */
  title: string
  /** 自定义别名(可能为空) */
  alias: string | null
  /** AI 生成标题(可能为空) */
  aiTitle: string | null
  /** slug 简洁名(可能为空) */
  slug: string | null
  /** 首条用户消息预览(已截断) */
  firstUserMsg: string | null
  /** 创建时间(首条消息时间戳,ms epoch) */
  createdAt: number
  /** 最后更新时间(末条消息时间戳,ms epoch) */
  updatedAt: number
  /** 消息条数(user + assistant) */
  messageCount: number
  /** 主要使用的模型 */
  model: string | null
  /** 是否已被隐藏(软删除,记录在独立文件,不影响原始 jsonl) */
  hidden: boolean
}

/** 搜索命中结果 */
export interface SearchHit {
  session: SessionSummary
  /** 命中位置类型 */
  matchedIn: 'title' | 'content' | 'both'
  /** 内容命中的高亮片段(纯文本,带 [[ ]] 标记命中词);标题命中时可为空 */
  snippet: string | null
}

/** 会话详情里的单条消息 */
export interface DetailMessage {
  uuid: string
  /** 'tool' 表示工具结果回传(API 上属 user role,但非真人输入) */
  role: 'user' | 'assistant' | 'tool'
  timestamp: number
  /** 纯文本正文(user 文本 / assistant 的 text 段拼接) */
  text: string
  /** assistant 的 thinking 段(可折叠展示),无则空字符串 */
  thinking: string
  /** 工具调用摘要列表(名称 + 入参 JSON 概要) */
  toolUses: ToolUseSummary[]
  /** 消息内嵌图片(已拼成 data: URI,可直接用于 <img src>) */
  images?: string[]
  model: string | null
  /** 是否已被占位删除(内容替换为 [已移除],原文保留在归档) */
  removed?: boolean
  /** 被删消息的原文(从归档取,供悬停查看/恢复);仅 removed 时有 */
  originalText?: string
}

export interface ToolUseSummary {
  name: string
  /** 入参的 JSON 字符串(可能很长,展示时按需折叠) */
  input: string
}

export interface SessionDetail {
  sessionId: string
  projectPath: string
  messages: DetailMessage[]
}

/** 索引进度 */
export interface IndexProgress {
  total: number
  done: number
  /** 是否已完成 */
  finished: boolean
  /** 解析过程中跳过的坏行数(诊断用) */
  skippedLines: number
}

/** resume 调起结果 */
export interface ResumeResult {
  /** 'launched' = 已调起终端;'clipboard' = 已复制命令到剪贴板(兜底) */
  mode: 'launched' | 'clipboard'
  /** 给用户展示的命令文本 */
  command: string
}

/** 删除会话结果 */
export interface DeleteResult {
  /** true = 已移入系统废纸篓(可恢复);false = 失败(未删除) */
  trashed: boolean
}

/** 删除/恢复单条消息的结果 */
export interface MessageEditResult {
  /** true = 已改写工作文件;false = 未命中该消息或无归档 */
  ok: boolean
}

/** preload 暴露给渲染层的 API 形状 */
export interface ClaudeSessionsApi {
  listProjects(): Promise<ProjectSummary[]>
  listSessions(projectDir?: string, includeHidden?: boolean): Promise<SessionSummary[]>
  searchSessions(query: string, includeHidden?: boolean): Promise<SearchHit[]>
  getSessionDetail(sessionId: string): Promise<SessionDetail>
  renameSession(sessionId: string, alias: string): Promise<SessionSummary>
  /** 隐藏/取消隐藏会话(软删除,可逆);返回更新后的会话 */
  hideSession(sessionId: string, hidden: boolean): Promise<SessionSummary>
  /** 删除会话:把原始 jsonl 移入系统废纸篓并清理索引 */
  deleteSession(sessionId: string): Promise<DeleteResult>
  /** 占位删除对话中的一条消息(内容改为 [已移除],原文进归档,可恢复) */
  deleteMessage(sessionId: string, uuid: string): Promise<MessageEditResult>
  /** 恢复被占位删除的消息(从归档取回原文写回工作文件) */
  restoreMessage(sessionId: string, uuid: string): Promise<MessageEditResult>
  resumeSession(sessionId: string): Promise<ResumeResult>
  reindex(): Promise<IndexProgress>
  onIndexProgress(cb: (p: IndexProgress) => void): () => void
}
