import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { BACKUPS_DIR } from './paths'
import { getSessionRow } from './db'
import { parseSessionDetail } from './jsonl-parser'
import {
  redactMessage,
  restoreMessage as restoreLineInFile,
  findLineByUuid,
  mergeNewMessages
} from './message-edit'
import { addRemoved, removeRemoved } from './removed'
import type { MessageEditResult, DetailMessage } from '../shared/types'

function archivePathFor(sessionId: string): string {
  return join(BACKUPS_DIR, sessionId + '.jsonl')
}

/** 原子写:先写临时文件再 rename */
function atomicWrite(file: string, content: string): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, file)
}

/**
 * 占位删除一条消息:
 * ① 首次删除先把当前完整工作文件存为归档;已有归档则先并入删除前的新消息(确保待删原文在归档里)。
 * ② 原子改写工作文件的该行为占位。③ 记录 uuid。
 */
export function deleteMessage(sessionId: string, uuid: string): MessageEditResult {
  const row = getSessionRow(sessionId)
  if (!row?.filePath) return { ok: false }

  let work: string
  try {
    work = readFileSync(row.filePath, 'utf-8')
  } catch {
    return { ok: false }
  }

  const archive = archivePathFor(sessionId)
  if (!existsSync(archive)) {
    mkdirSync(BACKUPS_DIR, { recursive: true })
    atomicWrite(archive, work) // 首次完整备份
  } else {
    // 把删除前 resume 出的新消息并入归档,保证待删原文一定在归档里
    atomicWrite(archive, mergeNewMessages(work, readFileSync(archive, 'utf-8')))
  }

  const { content, changed } = redactMessage(work, uuid)
  if (!changed) return { ok: false }
  atomicWrite(row.filePath, content)
  addRemoved(sessionId, uuid)
  return { ok: true }
}

/** 从归档取回原文,写回工作文件,撤销删除记录 */
export function restoreMessage(sessionId: string, uuid: string): MessageEditResult {
  const row = getSessionRow(sessionId)
  if (!row?.filePath) return { ok: false }
  const archive = archivePathFor(sessionId)
  if (!existsSync(archive)) return { ok: false }

  const original = findLineByUuid(readFileSync(archive, 'utf-8'), uuid)
  if (!original) return { ok: false }

  let work: string
  try {
    work = readFileSync(row.filePath, 'utf-8')
  } catch {
    return { ok: false }
  }
  const { content, changed } = restoreLineInFile(work, uuid, original)
  if (!changed) return { ok: false }
  atomicWrite(row.filePath, content)
  removeRemoved(sessionId, uuid)
  return { ok: true }
}

/** 打开详情时:若有归档,把工作文件里的新消息并入归档(保持归档完整增长) */
export function syncArchive(sessionId: string, workContent: string): void {
  const archive = archivePathFor(sessionId)
  if (!existsSync(archive)) return
  atomicWrite(archive, mergeNewMessages(workContent, readFileSync(archive, 'utf-8')))
}

/** 从归档解析出 uuid -> 原始消息(供被删消息回填原文);无归档返回空 Map */
export function archiveOriginals(sessionId: string): Map<string, DetailMessage> {
  const archive = archivePathFor(sessionId)
  const map = new Map<string, DetailMessage>()
  if (!existsSync(archive)) return map
  try {
    const detail = parseSessionDetail(readFileSync(archive, 'utf-8'))
    for (const m of detail) if (m.uuid) map.set(m.uuid, m)
  } catch {
    // 归档损坏不致命,原文回填为空
  }
  return map
}
