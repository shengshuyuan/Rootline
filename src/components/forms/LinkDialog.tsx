import type { FamilyTree, Person } from '../../types'
import type { RelationKind } from '../../types/draft'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'
import { dateText } from '../../utils/dateText'

interface LinkDialogProps {
  tree: FamilyTree
  selectedId: string
  kind: RelationKind
  setKind: (kind: RelationKind) => void
  linkId: string
  setLinkId: (id: string) => void
  close: () => void
  submit: () => void
  formErrors?: string[]
}

/** Who may be linked for a given relation kind (MVP gender rules). */
export function candidatesForRelation(
  tree: FamilyTree,
  selectedId: string,
  kind: RelationKind,
): Person[] {
  const selected = tree.persons.find((person) => person.id === selectedId)
  return tree.persons.filter((person) => {
    if (person.id === selectedId) return false
    if (kind === 'father') return person.gender === 'male'
    if (kind === 'mother') return person.gender === 'female'
    if (kind === 'spouse') {
      if (!selected || selected.gender === 'unknown' || person.gender === 'unknown') return true
      return person.gender !== selected.gender
    }
    return true
  })
}

export function LinkDialog({
  tree,
  selectedId,
  kind,
  setKind,
  linkId,
  setLinkId,
  close,
  submit,
  formErrors = [],
}: LinkDialogProps) {
  // Linking is not persisted until "确认关联", so closing this chooser must not
  // prompt about losing data.  A prompt here also traps users after merely
  // switching the relation type.
  useEscapeClose(close)
  const dialogRef = useDialogFocusTrap<HTMLElement>()
  const candidates = candidatesForRelation(tree, selectedId, kind)
  const linkStillValid = !linkId || candidates.some((person) => person.id === linkId)

  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-body">
          <p className="eyebrow">关系</p>
          <h2 id="link-dialog-title">关联已有人物</h2>

          {formErrors.length > 0 && (
            <div className="form-alert form-alert-error" role="alert">
              <strong>无法建立关系</strong>
              <ul>{formErrors.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}

          <label className="field">
            <span className="field-label">关系类型</span>
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as RelationKind)
                setLinkId('')
              }}
            >
              <option value="father">父亲（仅男性）</option>
              <option value="mother">母亲（仅女性）</option>
              <option value="child">子女</option>
              <option value="spouse">配偶（异性）</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">选择人物</span>
            <select
              value={linkStillValid ? linkId : ''}
              onChange={(event) => setLinkId(event.target.value)}
            >
              <option value="">请选择</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.gender === 'male' ? '男' : person.gender === 'female' ? '女' : '未录'} · {dateText(person.birth)}
                </option>
              ))}
            </select>
            {candidates.length === 0 && (
              <span className="field-error">没有符合该关系角色的可选人物</span>
            )}
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={close}>取消</button>
          <button
            type="button"
            className="primary"
            disabled={!linkId || !linkStillValid || candidates.length === 0}
            onClick={submit}
          >
            确认关联
          </button>
        </div>
      </section>
    </div>
  )
}
