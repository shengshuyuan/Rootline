import type { RecoveryPoint, RecoveryPointReason } from '../../types'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'
import { useEscapeClose } from '../../hooks/useEscapeClose'

interface RecoveryDialogProps {
  points: RecoveryPoint[]
  busy: boolean
  error?: string | null
  close: () => void
  restore: (id: string) => void
  createManual: () => void
}

const reasonLabel: Record<RecoveryPointReason, string> = {
  'before-import': '导入覆盖前',
  'before-delete': '删除人物前',
  'before-migration': '数据升级前',
  'before-restore': '恢复数据前',
  manual: '手动恢复点',
}

const formatTime = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

export function RecoveryDialog({ points, busy, error, close, restore, createManual }: RecoveryDialogProps) {
  useEscapeClose(close)
  const dialogRef = useDialogFocusTrap<HTMLElement>()
  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <section
        ref={dialogRef}
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-body">
          <p className="eyebrow">本地数据保护</p>
          <h2 id="recovery-dialog-title">恢复历史版本</h2>
          <p className="dialog-description">恢复不会删除当前版本；系统会先为当前数据再创建一个恢复点。</p>
          {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
          <div className="recovery-list">
            {points.length > 0 ? points.map((point) => (
              <div className="recovery-row" key={point.id}>
                <div>
                  <b>{point.treeName || '未命名族谱'}</b>
                  <span>{reasonLabel[point.reason]} · {formatTime(point.createdAt)}</span>
                  {point.schemaVersion && <small>数据版本 {point.schemaVersion}</small>}
                </div>
                <button type="button" disabled={busy} onClick={() => restore(point.id)}>恢复此版本</button>
              </div>
            )) : <p className="recovery-empty">暂时没有可恢复的历史版本。</p>}
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={createManual}>保存当前恢复点</button>
          <button type="button" onClick={close}>关闭</button>
        </div>
      </section>
    </div>
  )
}
