import { shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getSessionRow, removeFile } from './db'
import { setAlias } from './aliases'
import { setHidden } from './hidden'
import { clearRemoved } from './removed'
import { BACKUPS_DIR } from './paths'
import { isValidSessionId } from './resume-utils'
import type { DeleteResult } from '../shared/types'

/**
 * 删除会话:把原始 jsonl 移入系统废纸篓(可恢复),再清理索引与该会话产生的所有附属数据
 * (别名 / 隐藏 / 单条删除记录 / 消息归档)。绝不永久 unlink;sessionId 先过 UUID 校验做纵深防御。
 * 失败时不清理索引。
 */
export async function deleteSession(sessionId: string): Promise<DeleteResult> {
  if (!isValidSessionId(sessionId)) return { trashed: false }
  const row = getSessionRow(sessionId)
  if (!row?.filePath) return { trashed: false }

  try {
    await shell.trashItem(row.filePath)
  } catch {
    return { trashed: false }
  }

  // 文件已进废纸篓,清理索引与残留记录
  removeFile(row.filePath)
  setAlias(sessionId, '', Date.now())
  setHidden(sessionId, false, Date.now())
  clearRemoved(sessionId)

  // 归档备份也一并移入废纸篓(与会话本体一致,仍可恢复)
  const archive = join(BACKUPS_DIR, sessionId + '.jsonl')
  if (existsSync(archive)) {
    try {
      await shell.trashItem(archive)
    } catch {
      // 归档清理失败不影响会话删除结果
    }
  }
  return { trashed: true }
}
