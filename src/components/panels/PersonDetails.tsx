import { useEffect, useMemo, useState } from 'react'
import type { FamilyTree, ParentChildRelationship, PartnerRelationship, Person } from '../../types'
import type { RelationKind } from '../../types/draft'
import { dateText } from '../../utils/dateText'
import { PersonReader } from './PersonReader'
import { RelationsList } from './RelationsList'

interface PersonDetailsProps {
  tree: FamilyTree
  person?: Person
  parents?: ParentChildRelationship[]
  children?: ParentChildRelationship[]
  spouse?: PartnerRelationship[]
  collapsed: boolean
  hasCollapsedBranches: boolean
  onClose: () => void
  onPick: (personId: string) => void
  onRemoveParentChild: (relationshipId: string) => void
  onRemovePartner: (relationshipId: string) => void
  onEdit: () => void
  onAddRelation: (kind: Exclude<RelationKind, 'standalone'>) => void
  onLinkExisting: () => void
  onToggleCollapsed: () => void
  onSetCenter: () => void
  onExpandAll: () => void
  onDelete: () => void
  busy?: boolean
}

type DetailTab = 'profile' | 'relations'

interface ReaderState {
  title: string
  content: string
}

function present(value: string | undefined): string {
  return value?.trim() || '未记录'
}

function clip(value: string | undefined): string {
  const text = value?.trim()
  if (!text) return '未记录'
  return text.length > 86 ? `${text.slice(0, 86)}...` : text
}

export function PersonDetails({
  tree,
  person,
  parents = [],
  children = [],
  spouse = [],
  onClose,
  onPick,
  onRemoveParentChild,
  onRemovePartner,
  onEdit,
  onAddRelation,
  onLinkExisting,
  onDelete,
  busy = false,
}: PersonDetailsProps) {
  const [tab, setTab] = useState<DetailTab>('profile')
  const [relationsOpen, setRelationsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [reader, setReader] = useState<ReaderState | null>(null)

  useEffect(() => {
    setTab('profile')
    setRelationsOpen(false)
    setMoreOpen(false)
    setReader(null)
  }, [person?.id])

  const totalRelations = useMemo(
    () => parents.length + children.length + spouse.length,
    [parents.length, children.length, spouse.length],
  )

  if (!person) {
    return (
      <div className="detail-empty">
        <h2>选择一位人物</h2>
        <p>点击画布上的人物节点查看档案。</p>
      </div>
    )
  }

  const biography = person.biography?.trim()
  const notes = person.notes?.trim()

  return (
    <>
      <div className="detail-head person-inspector-head">
        <div>
          <p className="eyebrow">人物档案</p>
          <h2>{person.name}</h2>
          <span>
            {person.gender === 'unknown' ? '性别待补充' : person.gender === 'male' ? '男性' : '女性'}
            {' · '}
            {person.isDeceased ? '已故' : '在世'}
          </span>
        </div>
        <div className="person-inspector-tools">
          <button type="button" aria-expanded={moreOpen} aria-controls="person-more-menu" onClick={() => setMoreOpen((open) => !open)}>
            更多
          </button>
          <button type="button" aria-label="关闭详情" onClick={onClose}>关闭</button>
        </div>
      </div>

      {moreOpen && (
        <div id="person-more-menu" className="person-more-menu">
          <button type="button" className="danger" disabled={busy} onClick={onDelete}>删除人物</button>
        </div>
      )}

      <div className="person-tabs" role="tablist" aria-label="人物详情">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'profile'}
          className={tab === 'profile' ? 'active' : ''}
          onClick={() => setTab('profile')}
        >
          资料
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'relations'}
          className={tab === 'relations' ? 'active' : ''}
          onClick={() => setTab('relations')}
        >
          亲属 {totalRelations}
        </button>
      </div>

      <div className="person-tab-panel">
        {tab === 'profile' ? (
          <>
            <div className="info-grid person-profile-facts">
              <span>出生</span><b>{dateText(person.birth)}</b>
              {person.isDeceased && <><span>去世</span><b>{dateText(person.death)}</b></>}
              <span>籍贯</span><b>{present(person.ancestralHome)}</b>
              <span>职业</span><b>{present(person.occupation)}</b>
            </div>
            <div className="profile-reading person-profile-reading">
              <section>
                <span>个人简介</span>
                <p>{clip(person.biography)}</p>
                {biography && (
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setReader({ title: '个人简介', content: biography })}
                  >
                    阅读全文
                  </button>
                )}
              </section>
              <section>
                <span>人生主要经历</span>
                <p>{clip(person.notes)}</p>
                {notes && (
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setReader({ title: '人生主要经历', content: notes })}
                  >
                    阅读全文
                  </button>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="person-relations-panel">
            <RelationsList compact writeDisabled={busy} title="父母" relationships={parents} tree={tree} selectedId={person.id} onPick={onPick} onRemove={onRemoveParentChild} />
            <RelationsList compact writeDisabled={busy} title="子女" relationships={children} tree={tree} selectedId={person.id} onPick={onPick} onRemove={onRemoveParentChild} />
            <RelationsList compact writeDisabled={busy} title="配偶" relationships={spouse} tree={tree} selectedId={person.id} onPick={onPick} onRemove={onRemovePartner} />
          </div>
        )}
      </div>

      <div className="detail-actions person-inspector-actions">
        <button type="button" className="primary" disabled={busy} onClick={onEdit}>编辑资料</button>
        <button
          type="button"
          disabled={busy}
          aria-expanded={relationsOpen}
          aria-controls="add-relative-panel"
          onClick={() => setRelationsOpen((open) => !open)}
        >
          添加亲属
        </button>
      </div>

      {relationsOpen && (
        <div id="add-relative-panel" className="add-relative-panel">
          <button type="button" disabled={busy} onClick={() => onAddRelation('father')}>添加父亲</button>
          <button type="button" disabled={busy} onClick={() => onAddRelation('mother')}>添加母亲</button>
          <button type="button" disabled={busy} onClick={() => onAddRelation('child')}>添加子女</button>
          {spouse.length === 0 && <button type="button" disabled={busy} onClick={() => onAddRelation('spouse')}>添加配偶</button>}
          <button type="button" disabled={busy} onClick={onLinkExisting}>关联已有人物</button>
        </div>
      )}

      {reader && (
        <PersonReader
          title={reader.title}
          personName={person.name}
          content={reader.content}
          onClose={() => setReader(null)}
        />
      )}
    </>
  )
}
