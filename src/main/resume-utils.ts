// resume 的纯逻辑(不依赖 electron),便于单测

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** 校验 sessionId 必须是合法 UUID,杜绝命令注入 */
export function isValidSessionId(id: string): boolean {
  return UUID_RE.test(id)
}

/** 为 AppleScript 字符串字面量转义反斜杠与双引号 */
export function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 构造在终端执行的 shell 命令文本(展示/剪贴板用) */
export function buildResumeCommand(cwd: string, sessionId: string): string {
  return `cd ${JSON.stringify(cwd)} && claude --resume ${sessionId}`
}
