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

      <div className="conversation-body">
        {loading ? (
          <div className="placeholder">加载中…</div>
        ) : detail && detail.messages.length > 0 ? (
          detail.messages.map((m) => (
            <MessageBubble
              key={m.uuid || Math.random()}
              message={m}
              onDelete={onDeleteMessage}
              onRestore={onRestoreMessage}
            />
          ))
        ) : (
          <div className="placeholder">该会话没有可展示的消息</div>
        )}
      </div>
    </section>
  )
}
