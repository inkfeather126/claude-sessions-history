import type { DetailMessage, ToolUseSummary } from '../shared/types'

const FIRST_MSG_PREVIEW_LEN = 200

/** 索引用的精简会话信息(解析单个 jsonl 文件得到) */
export interface ParsedSession {
  sessionId: string | null
  /** 真实工作目录(取自行内 cwd 字段) */
  cwd: string | null
  aiTitle: string | null
  slug: string | null
  firstUserMsg: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
  model: string | null
  /** 供 FTS 全文索引的文本行 */
  ftsMessages: { role: 'user' | 'assistant'; content: string }[]
  /** 解析时跳过的坏行数 */
  skippedLines: number
}

/** 把 ISO 时间字符串转 ms epoch;无效返回 0 */
function toEpoch(ts: unknown): number {
  if (typeof ts !== 'string') return 0
  const n = Date.parse(ts)
  return Number.isNaN(n) ? 0 : n
}

/** 从 message.content(string | array)抽取纯文本 */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
    else if (b.type === 'tool_result') {
      // tool_result 的 content 也可能是 string 或数组
      const inner = extractText(b.content)
      if (inner) parts.push(inner)
    }
  }
  return parts.join('\n')
}

/** 从 assistant content 数组抽取 thinking 文本 */
function extractThinking(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block && typeof block === 'object') {
      const b = block as Record<string, unknown>
      if (b.type === 'thinking' && typeof b.thinking === 'string') parts.push(b.thinking)
    }
  }
  return parts.join('\n')
}

/** 从 assistant content 数组抽取 tool_use 摘要 */
function extractToolUses(content: unknown): ToolUseSummary[] {
  if (!Array.isArray(content)) return []
  const uses: ToolUseSummary[] = []
  for (const block of content) {
    if (block && typeof block === 'object') {
      const b = block as Record<string, unknown>
      if (b.type === 'tool_use') {
        uses.push({
          name: typeof b.name === 'string' ? b.name : '(unknown)',
          input: safeStringify(b.input)
        })
      }
    }
  }
  return uses
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? ''
  } catch {
    return ''
  }
}

/** 递归收集 content 里的 base64 图片,拼成可直接用于 <img src> 的 data: URI */
function collectImages(content: unknown, out: string[]): void {
  if (Array.isArray(content)) {
    for (const b of content) collectImages(b, out)
    return
  }
  if (!content || typeof content !== 'object') return
  const b = content as Record<string, unknown>
  if (b.type === 'image' && b.source && typeof b.source === 'object') {
    const s = b.source as Record<string, unknown>
    if (s.type === 'base64' && typeof s.data === 'string') {
      const mt = typeof s.media_type === 'string' ? s.media_type : 'image/png'
      out.push(`data:${mt};base64,${s.data}`)
    }
  }
  // tool_result 的 content 也可能内嵌图片(如截图工具返回)
  if (b.type === 'tool_result' && b.content) collectImages(b.content, out)
}

function extractImages(content: unknown): string[] {
  const out: string[] = []
  collectImages(content, out)
  return out
}

/**
 * 判断 user 消息的 content 是真人输入还是工具结果回传。
 * - 字符串 → 真人输入
 * - 数组含 text/document → 真人输入
 * - 数组仅含 tool_result(无 text/document)→ 工具结果
 */
function isToolResultContent(content: unknown): boolean {
  if (typeof content === 'string') return false
  if (!Array.isArray(content)) return false
  let hasToolResult = false
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const type = (block as Record<string, unknown>).type
    if (type === 'text' || type === 'document') return false
    if (type === 'tool_result') hasToolResult = true
  }
  return hasToolResult
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length > n ? t.slice(0, n) + '…' : t
}

/**
 * 解析单个会话文件内容,抽取索引元数据 + FTS 文本。
 * 纯函数:接收文件内容字符串,不做 IO,便于单测。
 */
export function parseSessionForIndex(content: string): ParsedSession {
  const result: ParsedSession = {
    sessionId: null,
    cwd: null,
    aiTitle: null,
    slug: null,
    firstUserMsg: null,
    createdAt: 0,
    updatedAt: 0,
    messageCount: 0,
    model: null,
    ftsMessages: [],
    skippedLines: 0
  }

  const lines = content.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      result.skippedLines++
      continue
    }

    const type = rec.type
    if (typeof rec.sessionId === 'string' && !result.sessionId) {
      result.sessionId = rec.sessionId
    }
    if (typeof rec.cwd === 'string' && !result.cwd) result.cwd = rec.cwd
    if (typeof rec.slug === 'string' && !result.slug) result.slug = rec.slug

    if (type === 'ai-title' && typeof rec.aiTitle === 'string') {
      result.aiTitle = rec.aiTitle
      continue
    }

    // 跳过子链(子 agent)消息,主会话文件里通常 isSidechain=false
    if (rec.isSidechain === true) continue

    if (type === 'user' || type === 'assistant') {
      const message = (rec.message ?? {}) as Record<string, unknown>
      const role = type as 'user' | 'assistant'
      const text = extractText(message.content)
      const ts = toEpoch(rec.timestamp)

      if (ts > 0) {
        if (result.createdAt === 0 || ts < result.createdAt) result.createdAt = ts
        if (ts > result.updatedAt) result.updatedAt = ts
      }
      result.messageCount++

      if (role === 'assistant' && typeof message.model === 'string') {
        result.model = message.model
      }
      if (role === 'user' && !result.firstUserMsg) {
        const preview = truncate(text, FIRST_MSG_PREVIEW_LEN)
        if (preview) result.firstUserMsg = preview
      }
      if (text.trim()) {
        result.ftsMessages.push({ role, content: text })
      }
    }
  }

  return result
}

/**
 * 解析单个会话文件内容为有序的展示消息(供详情只读查看)。
 * 纯函数,不做 IO。
 */
export function parseSessionDetail(content: string): DetailMessage[] {
  const messages: DetailMessage[] = []
  const lines = content.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    const type = rec.type
    if (type !== 'user' && type !== 'assistant') continue
    if (rec.isSidechain === true) continue

    const message = (rec.message ?? {}) as Record<string, unknown>
    let role: 'user' | 'assistant' | 'tool' = type as 'user' | 'assistant'
    if (type === 'user' && isToolResultContent(message.content)) role = 'tool'
    const text = extractText(message.content)
    const thinking = role === 'assistant' ? extractThinking(message.content) : ''
    const toolUses = role === 'assistant' ? extractToolUses(message.content) : []
    const images = extractImages(message.content)

    // 没有任何可展示内容则跳过(纯 meta 行);有图片则保留(修复纯图片消息被丢弃)
    if (!text.trim() && !thinking.trim() && toolUses.length === 0 && images.length === 0) continue

    messages.push({
      uuid: typeof rec.uuid === 'string' ? rec.uuid : '',
      role,
      timestamp: toEpoch(rec.timestamp),
      text,
      thinking,
      toolUses,
      images,
      model: typeof message.model === 'string' ? message.model : null
    })
  }
  // 按时间排序(timestamp 为 0 的保持相对顺序靠后稳定)
  return messages
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.timestamp - b.m.timestamp) || (a.i - b.i))
    .map((x) => x.m)
}
