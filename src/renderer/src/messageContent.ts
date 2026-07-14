// 把 user 消息文本里的 Claude Code 命令包裹标签解析成结构化片段,
// 便于在 UI 里友好展示(命令高亮、输出折叠、说明/提醒淡化)。
// 未识别的内容原样作为 text 片段,交给 Markdown 渲染(并会被安全转义)。

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'command'; name: string; args: string; message: string }
  | { kind: 'stdout'; text: string }
  | { kind: 'caveat'; text: string }
  | { kind: 'reminder'; text: string }

const BLOCK_RE =
  /<(command-message|command-name|command-args|local-command-stdout|local-command-caveat|system-reminder)>([\s\S]*?)<\/\1>/g

interface CommandBuf {
  name: string
  args: string
  message: string
  active: boolean
}

function emptyCmd(): CommandBuf {
  return { name: '', args: '', message: '', active: false }
}

/** 解析 user 文本为有序片段 */
export function parseUserSegments(input: string): Segment[] {
  const segments: Segment[] = []
  let cmd = emptyCmd()
  let cursor = 0

  const flushCmd = (): void => {
    if (cmd.active) {
      segments.push({ kind: 'command', name: cmd.name, args: cmd.args, message: cmd.message })
      cmd = emptyCmd()
    }
  }
  const pushText = (raw: string): void => {
    if (raw.trim()) segments.push({ kind: 'text', text: raw.replace(/^\n+|\n+$/g, '') })
  }

  BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BLOCK_RE.exec(input)) !== null) {
    const [full, tag, content] = m
    const between = input.slice(cursor, m.index)
    const isCmdTag = tag.startsWith('command-')

    if (between.trim()) {
      // 命令块之间出现真实文本 → 先结束当前命令
      flushCmd()
      pushText(between)
    }

    if (isCmdTag) {
      const field = tag.slice('command-'.length) as 'message' | 'name' | 'args'
      // 同一字段重复出现 → 视为新命令开始
      if (cmd[field]) flushCmd()
      cmd[field] = content.trim()
      cmd.active = true
    } else {
      flushCmd()
      if (tag === 'local-command-stdout') {
        const t = content.trim()
        if (t) segments.push({ kind: 'stdout', text: t })
      } else if (tag === 'local-command-caveat') {
        segments.push({ kind: 'caveat', text: content.trim() })
      } else if (tag === 'system-reminder') {
        segments.push({ kind: 'reminder', text: content.trim() })
      }
    }
    cursor = m.index + full.length
  }

  flushCmd()
  pushText(input.slice(cursor))

  // 全部无标签时返回单一 text(即便是空,也给一个,以便调用方统一处理)
  if (segments.length === 0 && input.trim()) {
    segments.push({ kind: 'text', text: input })
  }
  return segments
}
