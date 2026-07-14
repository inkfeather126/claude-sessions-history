import { useState } from 'react'
import { parseUserSegments, type Segment } from '../messageContent'
import { Markdown } from './Markdown'

interface Props {
  text: string
}

/** 可折叠的辅助块(说明 / 系统提醒 / 命令输出) */
function Collapsible({
  label,
  body,
  variant,
  defaultOpen = false
}: {
  label: string
  body: string
  variant: 'stdout' | 'caveat' | 'reminder'
  defaultOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`seg-block seg-${variant}`}>
      <button className="collapse-btn" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <pre className="seg-body">{body}</pre>}
    </div>
  )
}

function renderSegment(seg: Segment, i: number): JSX.Element {
  switch (seg.kind) {
    case 'text':
      return <Markdown key={i}>{seg.text}</Markdown>
    case 'command':
      return (
        <div className="seg-command" key={i}>
          <span className="seg-cmd-icon">⌘</span>
          <code className="seg-cmd-name">{seg.name || '(命令)'}</code>
          {seg.args && <code className="seg-cmd-args">{seg.args}</code>}
        </div>
      )
    case 'stdout':
      return <Collapsible key={i} label="命令输出" body={seg.text} variant="stdout" />
    case 'caveat':
      return <Collapsible key={i} label="本地命令说明" body={seg.text} variant="caveat" />
    case 'reminder':
      return <Collapsible key={i} label="系统提醒" body={seg.text} variant="reminder" />
  }
}

export function UserSegments({ text }: Props): JSX.Element {
  const segments = parseUserSegments(text)
  return <>{segments.map(renderSegment)}</>
}
