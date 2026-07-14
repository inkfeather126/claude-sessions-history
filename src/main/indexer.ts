import { readdirSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { PROJECTS_DIR, dirNameToPath } from './paths'
import { parseSessionForIndex } from './jsonl-parser'
import { getFileMeta, getAllIndexedPaths, removeFile, upsertSession } from './db'
import type { IndexProgress } from '../shared/types'

interface FileTask {
  filePath: string
  projectDir: string
  mtime: number
  size: number
}

/** 收集 ~/.claude/projects 下所有会话 jsonl 文件 */
function collectFiles(): FileTask[] {
  const tasks: FileTask[] = []
  let projectDirs: string[]
  try {
    projectDirs = readdirSync(PROJECTS_DIR)
  } catch {
    return tasks // projects 目录不存在
  }
  for (const dir of projectDirs) {
    const dirPath = join(PROJECTS_DIR, dir)
    let entries: string[]
    try {
      if (!statSync(dirPath).isDirectory()) continue
      entries = readdirSync(dirPath)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue
      const filePath = join(dirPath, name)
      try {
        const st = statSync(filePath)
        if (!st.isFile()) continue
        tasks.push({ filePath, projectDir: dir, mtime: Math.floor(st.mtimeMs), size: st.size })
      } catch {
        // 文件可能在扫描间隙被删除,忽略
      }
    }
  }
  return tasks
}

/** 让出事件循环,避免长时间同步阻塞主进程 IPC */
function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

const PROGRESS_EVERY = 20
const YIELD_EVERY = 10

/**
 * 增量索引:只重解析指纹(mtime+size)变化的文件,清理磁盘上已删除的文件。
 * @param onProgress 进度回调(节流后)
 */
export async function runIndex(
  onProgress?: (p: IndexProgress) => void
): Promise<IndexProgress> {
  const tasks = collectFiles()
  const total = tasks.length
  let done = 0
  let skippedLines = 0

  // 清理已删除文件
  const onDisk = new Set(tasks.map((t) => t.filePath))
  for (const indexed of getAllIndexedPaths()) {
    if (!onDisk.has(indexed)) {
      try {
        removeFile(indexed)
      } catch {
        // 忽略单文件清理失败
      }
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    try {
      const prev = getFileMeta(task.filePath)
      const changed = !prev || prev.mtime !== task.mtime || prev.size !== task.size
      if (changed) {
        const content = readFileSync(task.filePath, 'utf-8')
        const parsed = parseSessionForIndex(content)
        skippedLines += parsed.skippedLines
        upsertSession({
          parsed,
          filePath: task.filePath,
          mtime: task.mtime,
          size: task.size,
          projectDir: task.projectDir,
          projectPath: dirNameToPath(task.projectDir)
        })
      }
    } catch {
      // 单文件失败不影响整体索引
    }
    done++

    if (done % PROGRESS_EVERY === 0 && onProgress) {
      onProgress({ total, done, finished: false, skippedLines })
    }
    if (i % YIELD_EVERY === 0) {
      await yieldToLoop()
    }
  }

  const final: IndexProgress = { total, done, finished: true, skippedLines }
  onProgress?.(final)
  return final
}
