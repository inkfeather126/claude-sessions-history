// 纯逻辑:标题解析、别名命中、搜索命中分类、会话摘要组装。
// 只用 import type 引用其它模块,运行时不加载 electron / better-sqlite3,便于单测。
import type { SessionRow } from './db'
import type { AliasMap } from './aliases'
import type { SessionSummary, SearchHit } from '../shared/types'

export function shortCode(sessionId: string): string {
  return sessionId.slice(0, 8)
}

/** 计算最终展示标题:别名 > aiTitle > slug > 首条用户消息 > 短码 */
export function resolveTitle(row: SessionRow, alias: string | null): string {
  return alias || row.aiTitle || row.slug || row.firstUserMsg || shortCode(row.sessionId)
}

/** 别名是否命中查询(大小写不敏感的包含匹配) */
export function aliasMatches(alias: string | null | undefined, q: string): boolean {
  return alias ? alias.toLowerCase().includes(q.toLowerCase()) : false
}

/** 由三个命中维度得出 matchedIn(别名命中并入标题维度) */
export function classifyMatch(
  inTitle: boolean,
  inContent: boolean,
  aliasMatched: boolean
): SearchHit['matchedIn'] {
  return (inTitle || aliasMatched) && inContent ? 'both' : inContent ? 'content' : 'title'
}

export function buildSummary(
  row: SessionRow,
  aliasMap: AliasMap,
  hidden = false
): SessionSummary {
  const alias = aliasMap[row.sessionId]?.alias ?? null
  return {
    sessionId: row.sessionId,
    projectDir: row.projectDir,
    projectPath: row.projectPath,
    title: resolveTitle(row, alias),
    alias,
    aiTitle: row.aiTitle,
    slug: row.slug,
    firstUserMsg: row.firstUserMsg,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messageCount: row.messageCount,
    model: row.model,
    hidden
  }
}
