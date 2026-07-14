import type { SessionSummary, SearchHit } from '../../../shared/types'
import { formatRelativeTime } from '../hooks/useApi'

interface Props {
  items: SessionSummary[]
  hitMap?: Map<string, SearchHit>
  activeSessionId: string | null
  onSelect: (s: SessionSummary) => void
  emptyHint: string
}

/** 把 snippet 里的 [[...]] 标记渲染为高亮 */
function renderSnippet(snippet: string): JSX.Element[] {
  const parts = snippet.split(/(\[\[|\]\])/)
  const out: JSX.Element[] = []
  let highlight = false
  let key = 0
  for (const p of parts) {
    if (p === '[[') {
      highlight = true
      continue
    }
    if (p === ']]') {
      highlight = false
      continue
    }
    if (!p) continue
    out.push(
      highlight ? (
        <mark key={key++}>{p}</mark>
      ) : (
        <span key={key++}>{p}</span>
      )
    )
  }
  return out
}

export function SessionList({
  items,
  hitMap,
  activeSessionId,
  onSelect,
  emptyHint
}: Props): JSX.Element {
  if (items.length === 0) {
    return <div className="session-list empty">{emptyHint}</div>
  }
  return (
    <ul className="session-list">
      {items.map((s) => {
        const hit = hitMap?.get(s.sessionId)
        return (
          <li
            key={s.sessionId}
            className={`session-item ${activeSessionId === s.sessionId ? 'active' : ''}`}
            onClick={() => onSelect(s)}
          >
            <div className="session-title-row">
              <span className="session-title">{s.title}</span>
              {s.alias && <span className="tag alias-tag">别名</span>}
              {s.hidden && <span className="tag hidden-tag">已隐藏</span>}
            </div>
            {s.firstUserMsg && s.firstUserMsg !== s.title && (
              <div className="session-preview">{s.firstUserMsg}</div>
            )}
            {hit?.snippet && (
              <div className="session-snippet">{renderSnippet(hit.snippet)}</div>
            )}
            <div className="session-foot">
              <span>{formatRelativeTime(s.updatedAt)}</span>
              <span>· {s.messageCount} 条</span>
              {s.model && <span>· {s.model}</span>}
              {hit && (
                <span className="match-tag">
                  {hit.matchedIn === 'content'
                    ? '内容命中'
                    : hit.matchedIn === 'both'
                      ? '标题+内容'
                      : '标题命中'}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
