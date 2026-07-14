import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { ALIASES_FILE } from './paths'

export interface AliasEntry {
  alias: string
  updatedAt: number
}

export type AliasMap = Record<string, AliasEntry>

/** 读取别名文件;不存在或损坏时返回空表(不抛错) */
export function readAliases(file: string = ALIASES_FILE): AliasMap {
  if (!existsSync(file)) return {}
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as AliasMap
    return {}
  } catch {
    // 损坏文件不应导致整个应用崩溃
    return {}
  }
}

/** 原子写:先写临时文件再 rename,避免并发/中断损坏 */
function writeAliases(map: AliasMap, file: string): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf-8')
  renameSync(tmp, file)
}

/**
 * 设置/清除某会话别名。
 * @param alias 去除首尾空白后为空字符串时,表示清除该别名。
 * @param now 当前时间戳(ms epoch),由调用方传入以便测试。
 * @param file 别名文件路径(默认全局文件,测试时可注入临时路径)。
 * @returns 更新后的别名(清除时为 null)
 */
export function setAlias(
  sessionId: string,
  alias: string,
  now: number,
  file: string = ALIASES_FILE
): string | null {
  const map = readAliases(file)
  const trimmed = alias.trim()
  if (!trimmed) {
    delete map[sessionId]
    writeAliases(map, file)
    return null
  }
  map[sessionId] = { alias: trimmed, updatedAt: now }
  writeAliases(map, file)
  return trimmed
}

/** 取某会话别名,无则 null */
export function getAlias(sessionId: string, map?: AliasMap): string | null {
  const m = map ?? readAliases()
  return m[sessionId]?.alias ?? null
}
