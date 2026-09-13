import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Gender } from '../../types'
import type { PersonDraft } from '../../types/draft'
import type { PersonFieldKey } from '../../utils/formErrors'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { useGuardedClose } from '../../hooks/useGuardedClose'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'
import { FamilyDatePicker } from './FamilyDatePicker'

interface PersonDialogProps {
  title: string
  draft: PersonDraft
  setDraft: (draft: PersonDraft) => void
  submit: () => void | Promise<void>
  close: () => void
  fieldErrors?: Partial<Record<PersonFieldKey, string>>
  formErrors?: string[]
  recoveryAction?: ReactNode
  busy?: boolean
}

export function PersonDialog({
  title,
  draft,
  setDraft,
  submit,
  close,
  fieldErrors = {},
  formErrors = [],
  busy = false,
  recoveryAction,
}: PersonDialogProps) {
  const [baseline] = useState(() => JSON.stringify(draft))
  const [submitting, setSubmitting] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(() => Boolean(
    draft.biography.trim() || draft.notes.trim() || fieldErrors.notes,
  ))
  const dirty = JSON.stringify(draft) !== baseline
  const requestClose = useGuardedClose(dirty, close)
  const dialogRef = useDialogFocusTrap<HTMLFormElement>()
  const busyNow = busy || submitting
  const requestCloseWhenIdle = useCallback(() => {
    if (!busyNow) requestClose()
  }, [busyNow, requestClose])
  useEscapeClose(requestCloseWhenIdle)

  useEffect(() => {
    if (fieldErrors.notes) setDetailsOpen(true)
  }, [fieldErrors.notes])

  const submitSafely = async () => {
    if (busyNow) return
    setSubmitting(true)
    try {
      await submit()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={requestCloseWhenIdle}>
      <form
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          void submitSafely()
        }}
      >
        <div className="dialog-body">
          <p className="eyebrow">人物信息</p>
          <h2 id="person-dialog-title">{title}</h2>

          {formErrors.length > 0 && (
            <div className="form-alert form-alert-error" role="alert">
              <strong>请核对资料</strong>
              <ul>{formErrors.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}

          {recoveryAction}
          <fieldset className="person-dialog-fields" disabled={busyNow}>
            <label className="field">
              <span className="field-label">姓名</span>
              <input
                required
                autoFocus
                disabled={busyNow}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </label>

            <div className="field">
              <span className="field-label">性别</span>
              <div className="gender" role="radiogroup" aria-label="性别">
                {([
                  { value: 'male' as Gender, label: '男性' },
                  { value: 'female' as Gender, label: '女性' },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={draft.gender === option.value}
                    disabled={busyNow}
                    className={`gender-card ${draft.gender === option.value ? 'active' : ''}`}
                    onClick={() => setDraft({ ...draft, gender: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {(draft.gender === 'unknown' || fieldErrors.gender) && (
                <span className="field-error">{fieldErrors.gender ?? '请选择男性或女性后再保存'}</span>
              )}
            </div>

            <FamilyDatePicker
              label="出生日期"
              value={draft.birth}
              onChange={(birth) => setDraft({ ...draft, birth })}
              error={fieldErrors.birth}
            />

            <label className="field check-field">
              <input
                type="checkbox"
                disabled={busyNow}
                checked={draft.deceased}
                onChange={(event) => setDraft({
                  ...draft,
                  deceased: event.target.checked,
                  death: event.target.checked ? draft.death : undefined,
                })}
              />
              <span>已故</span>
            </label>

            {draft.deceased && (
              <FamilyDatePicker
                label="去世日期"
                value={draft.death}
                onChange={(death) => setDraft({ ...draft, death })}
                error={fieldErrors.death}
                optional
              />
            )}

            <label className="field">
              <span className="field-label">籍贯地址</span>
              <input
                type="text"
                disabled={busyNow}
                placeholder="例如：湖南省衡阳市"
                value={draft.ancestralHome}
                onChange={(event) => setDraft({ ...draft, ancestralHome: event.target.value })}
              />
              {fieldErrors.ancestralHome && <span className="field-error">{fieldErrors.ancestralHome}</span>}
            </label>

            <label className="field">
              <span className="field-label">职业 <span className="field-hint">选填</span></span>
              <input
                type="text"
                disabled={busyNow}
                placeholder="例如：教师、经商、务农"
                value={draft.occupation}
                onChange={(event) => setDraft({ ...draft, occupation: event.target.value })}
              />
            </label>

            <section className="person-extra-fields">
              <button
                type="button"
                className="person-extra-toggle"
                aria-expanded={detailsOpen}
                aria-controls="person-extra-fields-panel"
                onClick={() => setDetailsOpen((open) => !open)}
              >
                补充资料
              </button>
              {detailsOpen && (
                <div id="person-extra-fields-panel" className="person-extra-fields-panel">
                  <label className="field">
                    <span className="field-label">个人简介 <span className="field-hint">选填，用于详情页阅读</span></span>
                    <textarea
                      className="short-biography"
                      disabled={busyNow}
                      value={draft.biography}
                      placeholder="例如：性格、专长、为人处事，或一两句让后人快速认识他的介绍。"
                      onChange={(event) => setDraft({ ...draft, biography: event.target.value })}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">人生主要经历 <span className="field-hint">选填，可详细记录</span></span>
                    <textarea
                      className="life-experiences"
                      disabled={busyNow}
                      value={draft.notes}
                      placeholder="例如：求学、工作、迁居、重要成就与家族记忆…"
                      onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    />
                    {fieldErrors.notes && <span className="field-error">{fieldErrors.notes}</span>}
                  </label>
                </div>
              )}
            </section>
          </fieldset>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={requestCloseWhenIdle} disabled={busyNow}>取消</button>
          <button type="submit" className="primary" disabled={busyNow}>{busyNow ? '保存中' : '保存人物'}</button>
        </div>
      </form>
    </div>
  )
}
