import { useEscapeClose } from '../../hooks/useEscapeClose'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

interface ConfirmDialogProps {
  name: string
  relations: number
  close: () => void
  submit: () => void
}

export function ConfirmDialog({ name, relations, close, submit }: ConfirmDialogProps) {
  const dialogRef = useDialogFocusTrap<HTMLElement>()
  useEscapeClose(close)
  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-body">
          <p className="eyebrow">高风险操作</p>
          <h2 id="confirm-dialog-title">删除「{name}」？</h2>
          <p>将移除 {relations} 条相关关系，亲属资料不会删除。</p>
        </div>
        <div className="dialog-actions">
          <button type="button" autoFocus onClick={close}>取消</button>
          <button type="button" className="danger" onClick={submit}>确认删除</button>
        </div>
      </section>
    </div>
  )
}
