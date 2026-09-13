import { Handle, Position } from '@xyflow/react'
import type { Person } from '../../types'
import { dateText } from '../../utils/dateText'
import { JUNCTION_SIZE, PERSON_NODE_HEIGHT, PERSON_NODE_WIDTH } from '../../domain/layout/familyLayout'

export function PersonNode({ data }: { data: { person: Person; center: boolean; selected?: boolean } }) {
  const person = data.person
  const genderLabel = person.gender === 'male' ? '男' : person.gender === 'female' ? '女' : '待'
  const previewFields = [
    ['出生', dateText(person.birth)],
    ...(person.isDeceased ? [['去世', dateText(person.death)]] : []),
    ['籍贯', person.ancestralHome?.trim() || '未记录'],
    ['职业', person.occupation?.trim() || '未记录'],
  ]

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`查看${person.name}的人物档案`}
      aria-describedby={`person-preview-${person.id}`}
      style={{
        width: PERSON_NODE_WIDTH,
        minHeight: PERSON_NODE_HEIGHT,
        boxSizing: 'border-box',
      }}
      className={[
        'person-card',
        person.isDeceased ? 'is-deceased' : '',
        data.center ? 'is-center' : '',
        data.selected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Centered handles so parent drops share the same geometry. */}
      <Handle type="target" position={Position.Top} id="parent-top" className="family-handle" />
      <Handle type="source" position={Position.Bottom} id="child-bottom" className="family-handle" />
      <Handle type="source" position={Position.Right} id="partner-right" className="family-handle" />
      <Handle type="target" position={Position.Left} id="partner-left" className="family-handle" />
      <span className="person-mark" aria-hidden="true">{person.name.slice(0, 1)}</span>
      <div>
        <strong title={person.name}>{person.name}</strong>
        <small>{dateText(person.birth)}{person.isDeceased ? ' · 已故' : ''}</small>
        {data.selected && <span className="node-selection">已选中</span>}
      </div>
      <div id={`person-preview-${person.id}`} className="person-hover-card" role="tooltip">
        <p>{person.name} · {genderLabel === '待' ? '性别待补充' : genderLabel === '男' ? '男性' : '女性'} · {person.isDeceased ? '已故' : '在世'}</p>
        <dl>
          {previewFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {person.biography?.trim() && <div className="person-hover-experiences"><b>个人简介</b><span>{person.biography}</span></div>}
        {person.notes?.trim() && <div className="person-hover-experiences"><b>人生主要经历</b><span>{person.notes}</span></div>}
      </div>
    </article>
  )
}

export function JunctionNode() {
  return (
    <div
      className="junction"
      aria-hidden="true"
      style={{ width: JUNCTION_SIZE, height: JUNCTION_SIZE }}
    >
      <Handle type="target" position={Position.Top} id="parent-top" className="family-handle" />
      <Handle type="source" position={Position.Bottom} id="child-bottom" className="family-handle" />
      <Handle type="target" position={Position.Left} id="partner-left" className="family-handle" />
      <Handle type="source" position={Position.Right} id="partner-right" className="family-handle" />
    </div>
  )
}

export const familyNodeTypes = {
  person: PersonNode,
  junction: JunctionNode,
}
