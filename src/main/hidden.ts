import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { HIDDEN_FILE } from './paths'

/** 隐藏记录:sessionId -> 隐藏时间戳(ms epoch) */
export type HiddenMap = Record<string, number>

/** 读取隐藏记录;不存在或损坏时返回空表(不抛错) */
export function readHidden(file: string = HIDDEN_FILE): HiddenMap {
  if (!existsSync(file)) return {}
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as HiddenMap
    return {}
  } catch {
    // 损坏文件不应导致整个应用崩溃
    return {}
  }
}

/** 原子写:先写临时文件再 rename,避免并发/中断损坏 */
function writeHidden(map: HiddenMap, file: string): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf-8')
  renameSync(tmp, file)
}

/**
 * 设置某会话的隐藏状态。
 * @param hidden true=隐藏(记录时间戳);false=取消隐藏(删除记录)。
 * @param now 当前时间戳(ms epoch),由调用方传入以便测试。
 * @param file 隐藏文件路径(默认全局文件,测试时可注入临时路径)。
 * @returns 更新后的隐藏状态。
 */
export function setHidden(
  sessionId: string,
  hidden: boolean,
  now: number,
  file: string = HIDDEN_FILE
): boolean {
  const map = readHidden(file)
  if (hidden) {
    map[sessionId] = now
  } else {
    delete map[sessionId]
  }
  writeHidden(map, file)
  return hidden
}
