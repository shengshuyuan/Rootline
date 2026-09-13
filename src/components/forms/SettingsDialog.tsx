import { useState } from 'react'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { useGuardedClose } from '../../hooks/useGuardedClose'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

interface SettingsDialogProps {
  name: string
  surname?: string
  close: () => void
  submit: (input: { name: string; surname: string }) => void
  error?: string | null
}

export function SettingsDialog({ name, surname = '', close, submit, error }: SettingsDialogProps) {
  const [draftName, setDraftName] = useState(name)
  const [draftSurname, setDraftSurname] = useState(surname)
  const dirty = draftName !== name || draftSurname !== (surname ?? '')
  const requestClose = useGuardedClose(dirty, close)
  const dialogRef = useDialogFocusTrap<HTMLFormElement>()
  useEscapeClose(requestClose)

  return (
    <div className="modal-backdrop" role="presentation" onClick={requestClose}>
      <form
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          submit({ name: draftName, surname: draftSurname })
        }}
      >
        <div className="dialog-body">
          <p className="eyebrow">基础设置</p>
          <h2 id="settings-dialog-title">族谱信息</h2>
          <p>名称会出现在导出文件与家谱标题中，便于区分多次整理的备份。</p>
          {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
          <label className="field">
            <span className="field-label">族谱名称</span>
            <input
              required
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="例如：盛氏家族族谱"
            />
          </label>
          <label className="field">
            <span className="field-label">姓氏</span>
            <input
              value={draftSurname}
              onChange={(event) => setDraftSurname(event.target.value)}
              placeholder="例如：盛"
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={requestClose}>取消</button>
          <button type="submit" className="primary">保存设置</button>
        </div>
      </form>
    </div>
  )
}
