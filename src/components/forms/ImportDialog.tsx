import type { FamilyTreeSummary } from '../../io'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

interface ImportDialogProps {
  value: string
  setValue: (value: string) => void
  summary: FamilyTreeSummary | null
  error: string | null
  busy?: boolean
  onPickFile: () => void
  onDownloadTemplate: () => void
  onPreview: () => void
  onConfirm: () => void
  onDropFile: (file: File) => void
  excelSelected?: boolean
  close: () => void
}

export function ImportDialog({
  value,
  setValue,
  summary,
  error,
  busy,
  onPickFile,
  onDownloadTemplate,
  onPreview,
  onConfirm,
  onDropFile,
  excelSelected = false,
  close,
}: ImportDialogProps) {
  const dialogRef = useDialogFocusTrap<HTMLElement>()
  useEscapeClose(close)
  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <section
        ref={dialogRef}
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-body">
          <p className="eyebrow">族谱导入</p>
          <h2 id="import-dialog-title">导入已有族谱</h2>
          <p>
            支持 JSON 备份或 Excel 维护表。可先下载模板在表格中填写，选择 Excel 后会立即解析预览；也可粘贴 JSON 后再预览。
            校验失败不会覆盖本机现有数据。
          </p>

          <div className="import-toolbar">
            <button type="button" onClick={onPickFile}>选择 JSON / Excel 文件</button>
            <button type="button" onClick={onDownloadTemplate} disabled={busy}>下载 Excel 模板</button>
          </div>
          <p className="field-hint import-template-hint">模板含空表和「填写示例」。示例表不会被导入；也可使用本系统导出的维护表。</p>

          {!excelSelected && (
            <div
              className="import-drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files[0]
                if (file) onDropFile(file)
              }}
            >
              <textarea
                className="import-area"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder='{"id":"...","name":"...","persons":[],...}'
                aria-label="导入 JSON 内容"
                spellCheck={false}
              />
              <span>可将 JSON 或 Excel 文件拖到这里</span>
            </div>
          )}

          {error && (
            <div className="form-alert form-alert-error" role="alert">
              <strong>无法导入</strong>
              <ul>{error.split('；').map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          )}

          {summary && !error && (
            <div className="import-preview" role="status">
              <p className="section-label">导入预览</p>
              <p>
                将导入族谱 <strong>{summary.name}</strong>
                {summary.surname ? `（${summary.surname}氏）` : ''}
              </p>
              <ul className="import-stats">
                <li><b>{summary.personCount}</b> 人</li>
                <li><b>{summary.parentChildCount}</b> 条亲子关系</li>
                <li><b>{summary.partnerCount}</b> 条配偶关系</li>
                <li>版本 {summary.schemaVersion}</li>
              </ul>
              <p className="import-warn">确认后将<strong>替换</strong>此设备上的当前族谱数据，请先自行导出备份。</p>
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={close} disabled={busy}>取消</button>
          {!summary ? (
            <button type="button" className="primary" disabled={!value.trim() || busy} onClick={onPreview}>
              解析预览
            </button>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={onConfirm}>
              确认替换本地数据
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
