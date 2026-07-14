// 纯逻辑:对会话 jsonl 文本做"占位改写 / 恢复 / 归档追加"。
// 全部是 字符串 → 字符串,不做 IO,便于单测锁死"改写后结构仍合法"。

/** 被删消息的占位文本 */
export const REMOVED_PLACEHOLDER = '[已移除]'

/** 从一行 jsonl 取 uuid;坏行或无 uuid 返回 null */
export function lineUuid(line: string): string | null {
  const t = line.trim()
  if (!t) return null
  try {
    const o = JSON.parse(t) as Record<string, unknown>
    return typeof o.uuid === 'string' ? o.uuid : null
  } catch {
    return null
  }
}

/**
 * 占位改写 message.content:只清空文本载荷,保留所有结构键
 * (uuid/parentUuid 链、tool_use.id、tool_result.tool_use_id 均不动 → 恢复时可还原、resume 不会因结构损坏报错)。
 */
export function redactContent(content: unknown): unknown {
  if (typeof content === 'string') return REMOVED_PLACEHOLDER
  if (!Array.isArray(content)) return content
  return content.map((block) => {
    if (!block || typeof block !== 'object') return block
    const b = block as Record<string, unknown>
    switch (b.type) {
      case 'text':
        return { ...b, text: REMOVED_PLACEHOLDER }
      case 'thinking':
        return { ...b, thinking: REMOVED_PLACEHOLDER }
      case 'tool_use':
        return { ...b, input: {} }
      case 'tool_result':
        return { ...b, content: REMOVED_PLACEHOLDER }
      default:
        return b
    }
  })
}

/** 改写单行:把 message.content 占位化;非消息行/坏行原样返回 */
export function redactLine(line: string): string {
  const t = line.trim()
  if (!t) return line
  let o: Record<string, unknown>
  try {
    o = JSON.parse(t)
  } catch {
    return line
  }
  const msg = o.message
  if (!msg || typeof msg !== 'object') return line
  const m = msg as Record<string, unknown>
  m.content = redactContent(m.content)
  return JSON.stringify(o)
}

/** 在全文里把某 uuid 的消息行占位改写;其他行原样保留 */
export function redactMessage(
  fileContent: string,
  uuid: string
): { content: string; changed: boolean } {
  let changed = false
  const out = fileContent.split('\n').map((line) => {
    if (!changed && lineUuid(line) === uuid) {
      changed = true
      return redactLine(line)
    }
    return line
  })
  return { content: out.join('\n'), changed }
}

/** 从归档全文取某 uuid 的原始整行(供恢复);找不到返回 null */
export function findLineByUuid(fileContent: string, uuid: string): string | null {
  for (const line of fileContent.split('\n')) {
    if (lineUuid(line) === uuid) return line
  }
  return null
}

/** 恢复:把工作全文里某 uuid 的行替换回原始行 */
export function restoreMessage(
  fileContent: string,
  uuid: string,
  originalLine: string
): { content: string; changed: boolean } {
  let changed = false
  const out = fileContent.split('\n').map((line) => {
    if (!changed && lineUuid(line) === uuid) {
      changed = true
      return originalLine
    }
    return line
  })
  return { content: out.join('\n'), changed }
}

/**
 * 归档追加:把工作文件里"归档没有的"消息行(按 uuid 比对)追加到归档末尾。
 * 保证归档始终完整且跟随对话增长;已存在的 uuid(含被占位的原文)不覆盖、不重复。
 */
export function mergeNewMessages(workContent: string, archiveContent: string): string {
  const known = new Set<string>()
  for (const line of archiveContent.split('\n')) {
    const u = lineUuid(line)
    if (u) known.add(u)
  }
  const additions: string[] = []
  for (const line of workContent.split('\n')) {
    const u = lineUuid(line)
    if (u && !known.has(u)) {
      known.add(u)
      additions.push(line)
    }
  }
  if (additions.length === 0) return archiveContent
  const base = archiveContent.endsWith('\n') ? archiveContent : archiveContent + '\n'
  return base + additions.join('\n') + '\n'
}
