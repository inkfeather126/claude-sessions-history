import { ipcMain, type WebContents } from 'electron'
import { readFileSync } from 'fs'
import {
  listProjects,
  listSessionRows,
  getSessionRow,
  searchTitles,
  searchContent
} from './db'
import { readAliases, setAlias } from './aliases'
import { readHidden, setHidden } from './hidden'
import { readRemoved, removedSet } from './removed'
import { aliasMatches, classifyMatch, buildSummary } from './ipc-utils'
import { parseSessionDetail } from './jsonl-parser'
import { resumeSession } from './resume'
import { deleteSession } from './delete'
import { deleteMessage, restoreMessage, syncArchive, archiveOriginals } from './messages'
import { runIndex } from './indexer'
import type {
  SessionSummary,
  SearchHit,
  SessionDetail,
  IndexProgress,
  DeleteResult,
  MessageEditResult,
  DetailMessage
} from '../shared/types'

export const INDEX_PROGRESS_CHANNEL = 'index:progress'

/** trigram FTS 的最小查询长度 */
const MIN_CONTENT_QUERY_LEN = 3

/** 按当前别名/隐藏状态重建某会话的展示摘要;行不存在时返回最小对象 */
function summaryFor(sessionId: string): SessionSummary {
  const aliases = readAliases()
  const hidden = readHidden()
  const row = getSessionRow(sessionId)
  if (!row) {
    // 理论上不会发生;返回一个最小对象
    return buildSummary(
      {
        sessionId,
        projectDir: '',
        projectPath: '',
        aiTitle: null,
        slug: null,
        firstUserMsg: null,
        createdAt: 0,
        updatedAt: 0,
        messageCount: 0,
        model: null
      },
      aliases,
      !!hidden[sessionId]
    )
  }
  return buildSummary(row, aliases, !!hidden[sessionId])
}

/** 注册所有 IPC handler */
export function registerIpc(): void {
  ipcMain.handle('projects:list', () => listProjects())

  ipcMain.handle('sessions:list', (_e, projectDir?: string, includeHidden?: boolean) => {
    const aliases = readAliases()
    const hidden = readHidden()
    return listSessionRows(projectDir)
      .filter((r) => includeHidden || !hidden[r.sessionId])
      .map((r) => buildSummary(r, aliases, !!hidden[r.sessionId]))
  })

  ipcMain.handle(
    'sessions:search',
    (_e, query: string, includeHidden?: boolean): SearchHit[] => {
      const q = (query ?? '').trim()
      if (!q) return []
      const aliases = readAliases()
      const hidden = readHidden()

      const titleHits = searchTitles(q)
      const contentHits =
        q.length >= MIN_CONTENT_QUERY_LEN ? searchContent(q) : new Map<string, string>()

      const ids = new Set<string>([...titleHits, ...contentHits.keys()])
      const hits: SearchHit[] = []
      for (const id of ids) {
        if (!includeHidden && hidden[id]) continue
        const row = getSessionRow(id)
        if (!row) continue
        const inTitle = titleHits.has(id)
        const inContent = contentHits.has(id)
        // 别名命中也算标题命中
        const aliasMatched = aliasMatches(aliases[id]?.alias, q)
        const matchedIn = classifyMatch(inTitle, inContent, aliasMatched)
        hits.push({
          session: buildSummary(row, aliases, !!hidden[id]),
          matchedIn,
          snippet: contentHits.get(id) ?? null
        })
      }
      hits.sort((a, b) => b.session.updatedAt - a.session.updatedAt)
      return hits
    }
  )

  ipcMain.handle('sessions:detail', (_e, sessionId: string): SessionDetail => {
    const row = getSessionRow(sessionId)
    if (!row || !row.filePath) {
      return { sessionId, projectPath: '', messages: [] }
    }
    let content = ''
    try {
      content = readFileSync(row.filePath, 'utf-8')
    } catch {
      content = ''
    }
    // 有归档则并入新消息(保持归档完整增长)
    syncArchive(sessionId, content)
    // 标记被占位删除的消息,并从归档回填原文供悬停/恢复
    const removed = removedSet(sessionId, readRemoved())
    const originals =
      removed.size > 0 ? archiveOriginals(sessionId) : new Map<string, DetailMessage>()
    const messages = parseSessionDetail(content).map((m) =>
      m.uuid && removed.has(m.uuid)
        ? { ...m, removed: true, originalText: originals.get(m.uuid)?.text ?? '' }
        : m
    )
    return { sessionId, projectPath: row.projectPath, messages }
  })

  ipcMain.handle('sessions:rename', (_e, sessionId: string, alias: string): SessionSummary => {
    setAlias(sessionId, alias ?? '', Date.now())
    return summaryFor(sessionId)
  })

  ipcMain.handle('sessions:hide', (_e, sessionId: string, hidden: boolean): SessionSummary => {
    setHidden(sessionId, !!hidden, Date.now())
    return summaryFor(sessionId)
  })

  ipcMain.handle('sessions:delete', (_e, sessionId: string): Promise<DeleteResult> => {
    return deleteSession(sessionId)
  })

  ipcMain.handle(
    'message:delete',
    (_e, sessionId: string, uuid: string): MessageEditResult => deleteMessage(sessionId, uuid)
  )

  ipcMain.handle(
    'message:restore',
    (_e, sessionId: string, uuid: string): MessageEditResult => restoreMessage(sessionId, uuid)
  )

  ipcMain.handle('sessions:resume', (_e, sessionId: string) => {
    const row = getSessionRow(sessionId)
    const cwd = row?.projectPath || process.env.HOME || '.'
    return resumeSession(cwd, sessionId)
  })

  ipcMain.handle('index:reindex', async (e): Promise<IndexProgress> => {
    return runIndex((p) => sendProgress(e.sender, p))
  })
}

/** 向渲染层推送索引进度 */
export function sendProgress(sender: WebContents, p: IndexProgress): void {
  if (!sender.isDestroyed()) sender.send(INDEX_PROGRESS_CHANNEL, p)
}
