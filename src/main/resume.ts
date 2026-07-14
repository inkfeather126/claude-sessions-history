import { execFile } from 'child_process'
import { clipboard } from 'electron'
import type { ResumeResult } from '../shared/types'
import { isValidSessionId, escapeForAppleScript, buildResumeCommand } from './resume-utils'

export { isValidSessionId, buildResumeCommand } from './resume-utils'

/**
 * 调起终端恢复会话。macOS 用 osascript 打开 Terminal;失败或非 macOS 则把命令
 * 复制到剪贴板兜底。所有外部输入(sessionId)经 UUID 校验,cwd 经 AppleScript 转义。
 */
export function resumeSession(cwd: string, sessionId: string): Promise<ResumeResult> {
  if (!isValidSessionId(sessionId)) {
    return Promise.reject(new Error('非法的 sessionId'))
  }
  const command = buildResumeCommand(cwd, sessionId)

  if (process.platform !== 'darwin') {
    clipboard.writeText(command)
    return Promise.resolve({ mode: 'clipboard', command })
  }

  const script = `tell application "Terminal"
  activate
  do script "${escapeForAppleScript(command)}"
end tell`

  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], (err) => {
      if (err) {
        clipboard.writeText(command)
        resolve({ mode: 'clipboard', command })
      } else {
        resolve({ mode: 'launched', command })
      }
    })
  })
}
