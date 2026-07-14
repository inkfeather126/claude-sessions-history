import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { REMOVED_FILE } from './paths'

/** 被占位删除的消息:sessionId -> 该会话内被删消息的 uuid 列表 */
export type RemovedMap = Record<string, string[]>

/** 读取删除记录;不存在或损坏时返回空表(不抛错) */
export function readRemoved(file: string = REMOVED_FILE): RemovedMap {
  if (!existsSync(file)) return {}
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as RemovedMap
    return {}
  } catch {
    return {}
  }
}

/** 原子写:先写临时文件再 rename */
function writeRemoved(map: RemovedMap, file: string): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf-8')
  renameSync(tmp, file)
}

/** 取某会话的已删 uuid 集合 */
export function removedSet(sessionId: string, map: RemovedMap): Set<string> {
  return new Set(map[sessionId] ?? [])
}

/** 记录一条被删消息(幂等,自动去重) */
export function addRemoved(
  sessionId: string,
  uuid: string,
  file: string = REMOVED_FILE
): void {
  const map = readRemoved(file)
  const set = removedSet(sessionId, map)
  set.add(uuid)
  map[sessionId] = [...set]
  writeRemoved(map, file)
}

/** 清空某会话的全部删除记录(删除整个会话时调用) */
export function clearRemoved(sessionId: string, file: string = REMOVED_FILE): void {
  const map = readRemoved(file)
  if (!(sessionId in map)) return
  delete map[sessionId]
  writeRemoved(map, file)
}

/** 撤销一条删除记录(恢复时调用);会话清空后删除该 key */
export function removeRemoved(
  sessionId: string,
  uuid: string,
  file: string = REMOVED_FILE
): void {
  const map = readRemoved(file)
  const set = removedSet(sessionId, map)
  set.delete(uuid)
  if (set.size === 0) delete map[sessionId]
  else map[sessionId] = [...set]
  writeRemoved(map, file)
}
