import type { FamilyTree, ParentChildRelationship, PartnerRelationship } from '../../types'

type RelationRecord = ParentChildRelationship | PartnerRelationship

interface RelationsListProps {
  title: string
  relationships: RelationRecord[]
  tree: FamilyTree
  selectedId: string
  onPick: (personId: string) => void
  onRemove: (relationshipId: string) => void
  compact?: boolean
  writeDisabled?: boolean
}

function otherPersonId(relationship: RelationRecord, selectedId: string): string {
  if ('parentId' in relationship) {
    return relationship.parentId === selectedId ? relationship.childId : relationship.parentId
  }
  return relationship.person1Id === selectedId ? relationship.person2Id : relationship.person1Id
}

export function RelationsList({
  title,
  relationships,
  tree,
  selectedId,
  onPick,
  onRemove,
  compact = false,
  writeDisabled = false,
}: RelationsListProps) {
  return (
    <section className={`relation-list ${compact ? 'relation-list-compact' : ''}`}>
      <header className="relation-list-header">
        <span>{title}</span>
        <b>{relationships.length}</b>
      </header>
      {relationships.length === 0 ? (
        <em>未记录</em>
      ) : (
        <div className="relation-items">
          {relationships.map((relationship) => {
            const personId = otherPersonId(relationship, selectedId)
            const person = tree.persons.find((candidate) => candidate.id === personId)
            return (
              <div key={relationship.id} className="relation-row">
                <button type="button" className="relation-name" onClick={() => onPick(personId)}>
                  {person?.name ?? '未知人物'}
                </button>
                <button
                  type="button"
                  className="unlink"
                  disabled={writeDisabled}
                  onClick={() => {
                    if (window.confirm(`解除与「${person?.name ?? '此人'}」的这条关系？人物资料将保留。`)) onRemove(relationship.id)
                  }}
                  aria-label={`解除与 ${person?.name ?? '此人'} 的关系`}
                >
                  解除
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
