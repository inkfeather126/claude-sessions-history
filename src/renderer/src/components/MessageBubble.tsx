import { useState } from 'react'
import type { DetailMessage } from '../../../shared/types'
import { formatDateTime } from '../hooks/useApi'
import { Markdown } from './Markdown'
import { UserSegments } from './UserSegments'
import { ToolUseView } from './ToolUseView'

interface Props {
  message: DetailMessage
  highlighted?: boolean
  onDelete: (uuid: string) => void
  onRestore: (uuid: string) => void
}

/** 一条消息里内嵌的图片(data: URI),横向排列 */
function Images({ srcs }: { srcs: string[] }): JSX.Element {
  return (
    <div className="msg-images">
      {srcs.map((src, i) => (
        <img key={i} className="msg-image" src={src} loading="lazy" alt="图片" />
      ))}
    </div>
  )
}

export function MessageBubble({ message, highlighted, onDelete, onRestore }: Props): JSX.Element {
  const [showThinking, setShowThinking] = useState(false)
  const [openTools, setOpenTools] = useState<Record<number, boolean>>({})
  const [openTool, setOpenTool] = useState(false)
  const isUser = message.role === 'user'
  const hasImages = !!message.images && message.images.length > 0

  // 已被占位删除:显示占位卡片,悬停看原文,可恢复
  if (message.removed) {
    return (
      <div className={`bubble-row ${isUser ? 'user' : 'assistant'}${highlighted ? ' search-hit' : ''}`}>
        <div className="bubble removed">
          <div className="bubble-head">
            <span className="role">{isUser ? '我' : 'Claude'}</span>
            <span className="time">{formatDateTime(message.timestamp)}</span>
            <button
              className="restore-btn"
              title="从归档恢复这条消息"
              onClick={() => onRestore(message.uuid)}
            >
              恢复
            </button>
          </div>
          <div className="removed-note">⊘ 已移除 · 不进入上下文</div>
          {message.originalText && (
            <div className="removed-original">
              <span className="ro-hint">悬停查看原文</span>
              <pre className="ro-text">{message.originalText}</pre>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 工具结果 / 终端输出:默认折叠,展开看等宽原文
  if (message.role === 'tool') {
    const preview = (message.text.split('\n').find((l) => l.trim()) ?? '').slice(0, 80)
    return (
      <div className={`bubble-row assistant${highlighted ? ' search-hit' : ''}`}>
        <div className="bubble tool-result">
          <div className="bubble-head">
            <button className="collapse-btn" onClick={() => setOpenTool((v) => !v)}>
              {openTool ? '▾' : '▸'} ⚙ 工具结果
            </button>
            {!openTool && preview && <span className="tool-preview">{preview}</span>}
            <span className="time">{formatDateTime(message.timestamp)}</span>
            {message.uuid && (
              <button
                className="msg-del-btn"
                title="从上下文移除这条消息(原文会备份,可恢复)"
                onClick={() => onDelete(message.uuid)}
              >
                ✕
              </button>
            )}
          </div>
          {openTool && message.text.trim() && (
            <pre className="tool-result-text">{message.text}</pre>
          )}
          {openTool && hasImages && <Images srcs={message.images as string[]} />}
        </div>
      </div>
    )
  }

  return (
    <div className={`bubble-row ${isUser ? 'user' : 'assistant'}${highlighted ? ' search-hit' : ''}`}>
      <div className="bubble">
        <div className="bubble-head">
          <span className="role">{isUser ? '我' : 'Claude'}</span>
          {message.model && <span className="model">{message.model}</span>}
          <span className="time">{formatDateTime(message.timestamp)}</span>
          {message.uuid && (
            <button
              className="msg-del-btn"
              title="从上下文移除这条消息(原文会备份,可恢复)"
              onClick={() => onDelete(message.uuid)}
            >
              ✕
            </button>
          )}
        </div>

        {message.thinking && (
          <div className="thinking-block">
            <button className="collapse-btn" onClick={() => setShowThinking((v) => !v)}>
              {showThinking ? '▾' : '▸'} thinking
            </button>
            {showThinking && <pre className="thinking-text">{message.thinking}</pre>}
          </div>
        )}

        {message.text &&
          (isUser ? (
            <div className="bubble-text">
              <UserSegments text={message.text} />
            </div>
          ) : (
            <div className="bubble-text">
              <Markdown>{message.text}</Markdown>
            </div>
          ))}

        {hasImages && <Images srcs={message.images as string[]} />}

        {message.toolUses.map((t, i) => (
          <div className="tool-block" key={i}>
            <button
              className="collapse-btn"
              onClick={() => setOpenTools((p) => ({ ...p, [i]: !p[i] }))}
            >
              {openTools[i] ? '▾' : '▸'} 🔧 {t.name}
            </button>
            {openTools[i] && (
              <div className="tool-input">
                <ToolUseView name={t.name} input={t.input} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
