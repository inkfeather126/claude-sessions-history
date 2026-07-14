import { useState } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

/** 破坏性操作的二次确认弹窗 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)

  const confirm = async (): Promise<void> => {
    setBusy(true)
    await onConfirm()
    // 关闭由调用方在 onConfirm 内处理;此处兜底防止卡在 busy
    setBusy(false)
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog-danger" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">⚠ {title}</h3>
        <p className="dialog-hint">{message}</p>
        <div className="dialog-actions">
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn danger" onClick={confirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
