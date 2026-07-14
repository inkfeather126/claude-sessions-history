import Database from 'better-sqlite3'
import { INDEX_DB_FILE } from './paths'
import { escapeLike, buildFtsMatch } from './search-utils'
import type { ParsedSession } from './jsonl-parser'
import type { ProjectSummary, SessionSummary } from '../shared/types'

let db: Database.Database | null = null

/** 获取(惰性初始化)数据库单例 */
export function getDb(): Database.Database {
  if (db) return db
  db = new Database(INDEX_DB_FILE)
  db.pragma('journal_mode = WAL')
  initSchema(db)
  return db
}

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path        TEXT PRIMARY KEY,
      mtime       INTEGER NOT NULL,
      size        INTEGER NOT NULL,
      session_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id     TEXT PRIMARY KEY,
      project_dir    TEXT NOT NULL,
      project_path   TEXT NOT NULL,
      file_path      TEXT NOT NULL,
      ai_title       TEXT,
      slug           TEXT,
      first_user_msg TEXT,
      created_at     INTEGER NOT NULL DEFAULT 0,
      updated_at     INTEGER NOT NULL DEFAULT 0,
      message_count  INTEGER NOT NULL DEFAULT 0,
      model          TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_dir);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);

    -- trigram 分词器:支持任意子串匹配,对中文也友好(要求查询 >= 3 字符)
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      session_id UNINDEXED,
      role UNINDEXED,
      content,
      tokenize = 'trigram'
    );
  `)
}

/** 取文件指纹,用于增量判断 */
export function getFileMeta(path: string): { mtime: number; size: number } | undefined {
  const row = getDb()
    .prepare('SELECT mtime, size FROM files WHERE path = ?')
    .get(path) as { mtime: number; size: number } | undefined
  return row
}

/** 列出库里所有已索引文件路径(用于清理已删除文件) */
export function getAllIndexedPaths(): string[] {
  const rows = getDb().prepare('SELECT path FROM files').all() as { path: string }[]
  return rows.map((r) => r.path)
}

/** 删除某会话的全部索引数据(sessions + fts);files 行单独处理 */
function deleteSessionData(d: Database.Database, sessionId: string): void {
  d.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId)
  d.prepare('DELETE FROM messages_fts WHERE session_id = ?').run(sessionId)
}

/** 删除某文件对应的全部索引(文件被删除时调用) */
export function removeFile(path: string): void {
  const d = getDb()
  const row = d.prepare('SELECT session_id FROM files WHERE path = ?').get(path) as
    | { session_id: string | null }
    | undefined
  const tx = d.transaction(() => {
    if (row?.session_id) deleteSessionData(d, row.session_id)
    d.prepare('DELETE FROM files WHERE path = ?').run(path)
  })
  tx()
}

/** 把一个解析后的会话写入索引(事务):覆盖式更新 */
export function upsertSession(args: {
  parsed: ParsedSession
  filePath: string
  mtime: number
  size: number
  projectDir: string
  projectPath: string
}): void {
  const { parsed, filePath, mtime, size, projectDir, projectPath } = args
  const sessionId = parsed.sessionId
  const d = getDb()

  const tx = d.transaction(() => {
    if (sessionId) deleteSessionData(d, sessionId)

    if (sessionId) {
      d.prepare(
        `INSERT INTO sessions
           (session_id, project_dir, project_path, file_path, ai_title, slug,
            first_user_msg, created_at, updated_at, message_count, model)
         VALUES (@session_id, @project_dir, @project_path, @file_path, @ai_title, @slug,
            @first_user_msg, @created_at, @updated_at, @message_count, @model)`
      ).run({
        session_id: sessionId,
        project_dir: projectDir,
        project_path: parsed.cwd || projectPath,
        file_path: filePath,
        ai_title: parsed.aiTitle,
        slug: parsed.slug,
        first_user_msg: parsed.firstUserMsg,
        created_at: parsed.createdAt,
        updated_at: parsed.updatedAt,
        message_count: parsed.messageCount,
        model: parsed.model
      })

      const insertFts = d.prepare(
        'INSERT INTO messages_fts (session_id, role, content) VALUES (?, ?, ?)'
      )
      for (const m of parsed.ftsMessages) {
        insertFts.run(sessionId, m.role, m.content)
      }
    }

    d.prepare(
      `INSERT INTO files (path, mtime, size, session_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime,
         size = excluded.size, session_id = excluded.session_id`
    ).run(filePath, mtime, size, sessionId)
  })
  tx()
}

// ---------- 查询(供 IPC 使用,别名在上层合并) ----------

export function listProjects(): ProjectSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT project_dir AS projectDir,
              MIN(project_path) AS projectPath,
              COUNT(*) AS sessionCount,
              MAX(updated_at) AS lastActivity
       FROM sessions
       GROUP BY project_dir
       ORDER BY lastActivity DESC`
    )
    .all() as ProjectSummary[]
  return rows
}

/** 返回会话行(未合并别名;title 先用 aiTitle/slug 兜底,上层再覆盖) */
export function listSessionRows(projectDir?: string): SessionRow[] {
  const base = `SELECT session_id AS sessionId, project_dir AS projectDir,
            project_path AS projectPath, ai_title AS aiTitle, slug,
            first_user_msg AS firstUserMsg, created_at AS createdAt,
            updated_at AS updatedAt, message_count AS messageCount, model
     FROM sessions`
  const sql = projectDir
    ? `${base} WHERE project_dir = ? ORDER BY updated_at DESC`
    : `${base} ORDER BY updated_at DESC`
  const stmt = getDb().prepare(sql)
  return (projectDir ? stmt.all(projectDir) : stmt.all()) as SessionRow[]
}

export function getSessionRow(sessionId: string): SessionRow | undefined {
  return getDb()
    .prepare(
      `SELECT session_id AS sessionId, project_dir AS projectDir,
              project_path AS projectPath, ai_title AS aiTitle, slug,
              first_user_msg AS firstUserMsg, created_at AS createdAt,
              updated_at AS updatedAt, message_count AS messageCount, model,
              file_path AS filePath
       FROM sessions WHERE session_id = ?`
    )
    .get(sessionId) as SessionRow | undefined
}

/** 标题/别名维度的模糊匹配(LIKE);返回 sessionId 集合 */
export function searchTitles(q: string): Set<string> {
  const like = `%${escapeLike(q)}%`
  const rows = getDb()
    .prepare(
      `SELECT session_id AS sessionId FROM sessions
       WHERE ai_title LIKE @q ESCAPE '\\'
          OR slug LIKE @q ESCAPE '\\'
          OR first_user_msg LIKE @q ESCAPE '\\'`
    )
    .all({ q: like }) as { sessionId: string }[]
  return new Set(rows.map((r) => r.sessionId))
}

/** 内容全文搜索(trigram FTS);返回 sessionId -> snippet */
export function searchContent(q: string): Map<string, string> {
  // 把整个查询作为一个 phrase 做子串匹配,转义内部双引号
  const match = buildFtsMatch(q)
  const rows = getDb()
    .prepare(
      `SELECT session_id AS sessionId,
              snippet(messages_fts, 2, '[[', ']]', '…', 12) AS snippet
       FROM messages_fts
       WHERE messages_fts MATCH ?
       LIMIT 500`
    )
    .all(match) as { sessionId: string; snippet: string }[]
  const map = new Map<string, string>()
  for (const r of rows) {
    if (!map.has(r.sessionId)) map.set(r.sessionId, r.snippet)
  }
  return map
}

export interface SessionRow {
  sessionId: string
  projectDir: string
  projectPath: string
  aiTitle: string | null
  slug: string | null
  firstUserMsg: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
  model: string | null
  filePath?: string
}
