import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionSummary, SessionDetail } from '../../../shared/types'
import { MessageBubble } from './MessageBubble'
import { formatDateTime } from '../hooks/useApi'

interface Props {
  session: SessionSummary | null
  detail: SessionDetail | null
  loading: boolean
  onRename: () => void
  onResume: () => void
  onToggleHidden: () => void
  onDelete: () => void
  onDeleteMessage: (uuid: string) => void
  onRestoreMessage: (uuid: string) => void
}

const roleLabel = (r: string): string => (r === 'user' ? '我' : r === 'tool' ? '工具' : 'Claude')

export function ConversationView({
  session,
  detail,
  loading,
  onRename,
  onResume,
  onToggleHidden,
  onDelete,
  onDeleteMessage,
  onRestoreMessage
}: Props): JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showToBottom, setShowToBottom] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matchPos, setMatchPos] = useState(0)
  const [peek, setPeek] = useState<{ y: number; role: string; text: string } | null>(null)

  const messages = detail?.messages ?? []

  // 功能3:消息级搜索——匹配的消息在数组中的索引
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const res: number[] = []
    messages.forEach((m, i) => {
      if (m.text.toLowerCase().includes(q)) res.push(i)
    })
    return res
  }, [query, messages])
  const hitIndex = matches.length ? matches[matchPos % matches.length] : -1

  // 查询变化时回到第一个匹配
  useEffect(() => setMatchPos(0), [query])

  // 定位到当前匹配的消息气泡
  useEffect(() => {
    if (hitIndex < 0) return
    const rows = bodyRef.current?.querySelectorAll('.bubble-row')
    ;(rows?.[hitIndex] as HTMLElement | undefined)?.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    })
  }, [hitIndex])

  // 切换会话时:回顶、复位搜索/预览
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = 0
    setShowToBottom(false)
    setPeek(null)
    setQuery('')
  }, [session?.sessionId])

  // Cmd/Ctrl+F 唤出搜索,Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.select(), 0)
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const handleScroll = (): void => {
    const el = bodyRef.current
    if (!el) return
    setShowToBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 300)
  }
  const scrollToBottom = (): void => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }
  const nextMatch = (): void =>
    setMatchPos((p) => (matches.length ? (p + 1) % matches.length : 0))
  const prevMatch = (): void =>
    setMatchPos((p) => (matches.length ? (p - 1 + matches.length) % matches.length : 0))

  // 功能4:滚动条位置预览——按鼠标纵向比例找到对应消息,弹出放大气泡
  const onPeekMove = (e: React.MouseEvent): void => {
    const body = bodyRef.current
    if (!body || messages.length === 0) return
    const strip = e.currentTarget.getBoundingClientRect()
    const br = body.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientY - br.top) / br.height))
    const targetY = ratio * body.scrollHeight
    const rows = body.querySelectorAll<HTMLElement>('.bubble-row')
    let idx = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].offsetTop <= targetY) idx = i
      else break
    }
    const m = messages[idx]
    if (m) setPeek({ y: e.clientY - strip.top, role: m.role, text: m.text.slice(0, 240) })
  }
  const onPeekClick = (e: React.MouseEvent): void => {
    const body = bodyRef.current
    if (!body) return
    const br = body.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientY - br.top) / br.height))
    body.scrollTo({ top: ratio * (body.scrollHeight - body.clientHeight), behavior: 'smooth' })
  }

  if (!session) {
    return (
      <section className="conversation empty">
        <div className="placeholder">从左侧选择一个会话查看完整对话</div>
      </section>
    )
  }

  return (
    <section className="conversation">
      <header className="conversation-header">
        <div className="conv-title-wrap">
          <h2 className="conv-title">{session.title}</h2>
          <div className="conv-sub">
            <span title={session.projectPath}>{session.projectPath}</span>
            <span>· {session.messageCount} 条</span>
            <span>· 更新于 {formatDateTime(session.updatedAt)}</span>
          </div>
        </div>
        <div className="conv-actions">
          <div className="action-group">
            <button className="btn ghost" onClick={() => setSearchOpen((v) => !v)} title="在对话中搜索 (⌘/Ctrl+F)">
              搜索
            </button>
            <button className="btn ghost" onClick={onRename}>
              重命名
            </button>
            <button className="btn ghost" onClick={onToggleHidden}>
              {session.hidden ? '取消隐藏' : '隐藏'}
            </button>
            <button className="btn ghost danger" onClick={onDelete}>
              删除
            </button>
          </div>
          <button className="btn primary" onClick={onResume}>
            在 Claude Code 中恢复
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="conv-search">
          <input
            ref={searchInputRef}
            className="conv-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="在对话中搜索(回车下一条,Shift+回车上一条)"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.shiftKey ? prevMatch : nextMatch)()
              if (e.key === 'Escape') setSearchOpen(false)
            }}
          />
          <span className="conv-search-count">
            {query.trim() ? `${matches.length ? matchPos % matches.length + 1 : 0}/${matches.length}` : ''}
          </span>
          <button className="icon-btn" onClick={prevMatch} disabled={!matches.length} title="上一条">
            ↑
          </button>
          <button className="icon-btn" onClick={nextMatch} disabled={!matches.length} title="下一条">
            ↓
          </button>
          <button className="icon-btn" onClick={() => setSearchOpen(false)} title="关闭">
            ✕
          </button>
        </div>
      )}

      <div className="conversation-body" ref={bodyRef} onScroll={handleScroll}>
        {loading ? (
          <div className="placeholder">加载中…</div>
        ) : messages.length > 0 ? (
          messages.map((m, i) => (
            <MessageBubble
              key={m.uuid || i}
              message={m}
              highlighted={i === hitIndex}
              onDelete={onDeleteMessage}
              onRestore={onRestoreMessage}
            />
          ))
        ) : (
          <div className="placeholder">该会话没有可展示的消息</div>
        )}
      </div>

      {messages.length > 0 && (
        <div
          className="conv-peek"
          onMouseMove={onPeekMove}
          onMouseLeave={() => setPeek(null)}
          onClick={onPeekClick}
          title="悬停预览 · 点击跳转"
        />
      )}
      {peek && (
        <div className="conv-peek-bubble" style={{ top: peek.y }}>
          <span className="cpb-role">{roleLabel(peek.role)}</span>
          <div className="cpb-text">{peek.text || '(无文本内容)'}</div>
        </div>
      )}

      {showToBottom && (
        <button className="scroll-bottom-btn" onClick={scrollToBottom} title="滚动到底部">
          ↓
        </button>
      )}
    </section>
  )
}
