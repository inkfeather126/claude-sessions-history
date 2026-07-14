import { homedir } from 'os'
import { join } from 'path'

/** ~/.claude 根目录 */
export const CLAUDE_DIR = join(homedir(), '.claude')

/** 会话历史所在目录 ~/.claude/projects */
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects')

/** 自定义别名文件 ~/.claude/session-aliases.json */
export const ALIASES_FILE = join(CLAUDE_DIR, 'session-aliases.json')

/** 隐藏会话记录文件 ~/.claude/hidden-sessions.json(软删除,不动原始 jsonl) */
export const HIDDEN_FILE = join(CLAUDE_DIR, 'hidden-sessions.json')

/** 会话完整归档目录 ~/.claude/session-backups(删除单条消息前建立,始终保留原文) */
export const BACKUPS_DIR = join(CLAUDE_DIR, 'session-backups')

/** 被占位删除的消息记录 ~/.claude/removed-messages.json({ sessionId: uuid[] }) */
export const REMOVED_FILE = join(CLAUDE_DIR, 'removed-messages.json')

/** 本工具的索引缓存数据库(放在 ~/.claude 下,避免污染项目目录) */
export const INDEX_DB_FILE = join(CLAUDE_DIR, 'session-history-index.sqlite')

/**
 * 由 projects 子目录名还原真实路径(fallback 用)。
 *
 * 注意:目录名 = 绝对路径把 `/` 换成 `-` 并加前导 `-`。但原路径本身可能含 `-`
 * (如 `claude-sessions-history`),这种编码不可逆。因此本函数只做"尽力还原",
 * 真实 cwd 应优先从 jsonl 行内的 `cwd` 字段读取(见 jsonl-parser)。
 */
export function dirNameToPath(dirName: string): string {
  if (!dirName.startsWith('-')) return dirName
  // 去掉前导 '-' 后把 '-' 还原为 '/'(已知不完美,仅兜底)
  return '/' + dirName.slice(1).replace(/-/g, '/')
}
