import { memo } from 'react'
import { Markdown } from './Markdown'

interface Props {
  name: string
  /** 工具入参的 JSON 字符串 */
  input: string
}

/** 文件扩展名 → highlight.js 语言标识 */
const EXT_LANG: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
  json: 'json', jsonc: 'json', md: 'markdown', markdown: 'markdown',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  css: 'css', scss: 'scss', less: 'less', html: 'xml', xml: 'xml',
  vue: 'xml', svelte: 'xml', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  sql: 'sql', php: 'php', swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  lua: 'lua', r: 'r', dart: 'dart', scala: 'scala', ini: 'ini'
}

/** 由文件路径推断代码语言;无法识别返回空串(交给 highlight.js 自动探测) */
function langFromPath(p: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(p.trim())
  return m ? EXT_LANG[m[1].toLowerCase()] ?? '' : ''
}

/** 用足够长的反引号围栏,避免内容里出现 ``` 时破坏代码块 */
function fence(code: string, lang = ''): string {
  let ticks = '```'
  while (code.includes(ticks)) ticks += '`'
  return `${ticks}${lang}\n${code}\n${ticks}`
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/**
 * 把工具调用渲染成友好的格式而非裸 JSON:
 * - Bash       → 命令展示为 bash 代码块(附描述)
 * - Write      → 文件内容按扩展名高亮;.md 直接预览成 Markdown
 * - Edit       → 展示替换前/后两段代码
 * - Read/Grep/Glob → 关键参数平铺
 * - 其它       → 美化后的 JSON 代码块
 * 所有富文本走 <Markdown>,代码高亮跟随主题(--hl-*)。
 */
export const ToolUseView = memo(function ToolUseView({ name, input }: Props): JSX.Element {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch {
    data = null
  }

  // 非对象(解析失败或基础类型)→ 原样代码块
  if (data === null || typeof data !== 'object') {
    return <Markdown>{fence(input)}</Markdown>
  }
  const d = data as Record<string, unknown>
  const n = name.toLowerCase()

  // Bash:命令以 bash 代码块展示,描述作为说明
  if (n === 'bash') {
    const command = asString(d.command)
    if (command !== null) {
      const desc = asString(d.description)?.trim()
      const head = desc ? `*${desc}*\n\n` : ''
      return <Markdown>{head + fence(command, 'bash')}</Markdown>
    }
  }

  // Write:文件内容;.md 预览,其余按扩展名高亮
  if (n === 'write' || n === 'create') {
    const content = asString(d.content)
    if (content !== null) {
      const path = asString(d.file_path) ?? ''
      const header = path ? `📝 \`${path}\`\n\n` : ''
      const lang = langFromPath(path)
      // Markdown 文件 → 直接预览
      const body = lang === 'markdown' ? content : fence(content, lang)
      return <Markdown>{header + body}</Markdown>
    }
  }

  // Edit:展示替换前 / 替换后
  if (n === 'edit' || n === 'multiedit') {
    const oldStr = asString(d.old_string)
    if (oldStr !== null) {
      const path = asString(d.file_path) ?? ''
      const lang = langFromPath(path)
      const header = path ? `✏️ \`${path}\`\n\n` : ''
      const body =
        `**− 替换前**\n\n${fence(oldStr, lang)}\n\n` +
        `**+ 替换后**\n\n${fence(asString(d.new_string) ?? '', lang)}`
      return <Markdown>{header + body}</Markdown>
    }
  }

  // Read:文件路径
  if (n === 'read') {
    const path = asString(d.file_path)
    if (path !== null) return <Markdown>{`📄 \`${path}\``}</Markdown>
  }

  // Grep:模式 + 可选范围
  if (n === 'grep') {
    const pattern = asString(d.pattern)
    if (pattern !== null) {
      const where = asString(d.path) ? ` · \`${asString(d.path)}\`` : ''
      return <Markdown>{`🔍 \`${pattern}\`${where}`}</Markdown>
    }
  }

  // Glob:模式
  if (n === 'glob') {
    const pattern = asString(d.pattern)
    if (pattern !== null) return <Markdown>{`📁 \`${pattern}\``}</Markdown>
  }

  // 兜底:美化 JSON
  return <Markdown>{fence(JSON.stringify(d, null, 2), 'json')}</Markdown>
})
