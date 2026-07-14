import { useState } from 'react'
import type { SessionSummary } from '../../../shared/types'

interface Props {
  session: SessionSummary
  onClose: () => void
  onRenamed: (updated: SessionSummary) => void
}

export function RenameDialog({ session, onClose, onRenamed }: Props): JSX.Element {
  const [value, setValue] = useState(session.alias ?? '')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    const updated = await window.api.renameSession(session.sessionId, value)
    setSaving(false)
    onRenamed(updated)
  }

  const clear = async (): Promise<void> => {
    setSaving(true)
    const updated = await window.api.renameSession(session.sessionId, '')
    setSaving(false)
    onRenamed(updated)
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">重命名会话</h3>
        <p className="dialog-hint">
          自定义名称只保存在本工具的别名文件中,不会修改 Claude Code 的原始记录。
        </p>
        <input
          className="dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={session.aiTitle || session.slug || '输入自定义名称'}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="dialog-actions">
          {session.alias && (
            <button className="btn danger" onClick={clear} disabled={saving}>
              清除别名
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
