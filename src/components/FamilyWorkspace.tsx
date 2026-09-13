import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { createFamilyIndexes, searchPersons, type FamilyViewMode } from '../domain'
import type { FamilyTree } from '../types'
import { dateText } from '../utils/dateText'
import { FamilyCanvas } from './canvas/FamilyCanvas'

interface Props {
  tree: FamilyTree
  graph: { nodes: Node[]; edges: Edge[]; hiddenPersonCount: number }
  selectedId: string | null
  mode: FamilyViewMode
  setMode: (mode: FamilyViewMode) => void
  query: string
  setQuery: (value: string) => void
  onLocate: (id: string) => void
  onSelect: (id: string) => void
  focusPersonId: string | null
  collapsed: ReadonlySet<string>
  onToggleCollapsed: () => void
  onSetCenter: () => void
  onExpandAll: () => void
  onExport: () => void
  editsSinceExport: number
  shareNotice: string | null
  children: ReactNode
}

export function FamilyWorkspace(props: Props) {
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const directoryTrigger = useRef<HTMLButtonElement>(null)
  const indexes = useMemo(() => createFamilyIndexes(props.tree), [props.tree])
  const matches = useMemo(() => props.query.trim() ? searchPersons(props.tree, props.query) : props.tree.persons, [props.tree, props.query])
  const showDirectory = directoryOpen || Boolean(props.query.trim())
  const dismissDirectory = () => {
    setDirectoryOpen(false)
    props.setQuery('')
    directoryTrigger.current?.focus()
  }
  const selected = props.selectedId ? indexes.personById.get(props.selectedId) : undefined
  return (
    <div className={`workspace ${selected ? 'has-selection' : ''}`}>
      <section className="canvas-wrap" aria-label="家谱画布">
        <div className="canvas-heading">
          <div className="canvas-heading-controls">
            <div className="view-toggle" aria-label="族谱视图">
              <button type="button" aria-pressed={props.mode === 'full'} className={props.mode === 'full' ? 'active' : ''} onClick={() => props.setMode('full')}>完整亲缘</button>
              <button type="button" aria-pressed={props.mode === 'lineage'} className={props.mode === 'lineage' ? 'active' : ''} onClick={() => props.setMode('lineage')}>主脉</button>
            </div>
            <button ref={directoryTrigger} type="button" className="directory-trigger" aria-expanded={showDirectory} aria-controls="family-directory" onClick={() => showDirectory ? dismissDirectory() : setDirectoryOpen(true)}>家人名录</button>
          </div>
          <h1>{props.tree.name}</h1>
          <p>{props.tree.persons.length} 位家人<span className="heading-separator">·</span>{props.mode === 'full' ? '完整亲缘' : '父系主脉'}
            {props.graph.hiddenPersonCount > 0 && <span> · 当前隐藏 {props.graph.hiddenPersonCount} 人</span>}
          </p>
          {props.mode === 'lineage' && <p className="lineage-note">亲生父系：保留男女子女，女方后代不在此视图展开。</p>}
        </div>
        {props.shareNotice && <div className="share-notice" role="status">{props.shareNotice}</div>}
        <FamilyCanvas nodes={props.graph.nodes} edges={props.graph.edges} onPersonSelect={props.onSelect} focusPersonId={props.focusPersonId} />
        <div className="canvas-footer">
          <span>本浏览器保存</span><span className="footer-separator">·</span>
          <button type="button" className="text-button" onClick={props.onExport}>{props.editsSinceExport ? '导出备份' : '备份家谱'}</button>
        </div>
        {selected && <details className="canvas-actions toolbar-menu">
          <summary>视图操作</summary>
          <div className="toolbar-menu-panel">
            <p className="menu-heading">{selected.name}</p>
            <button type="button" onClick={props.onToggleCollapsed}>{props.collapsed.has(selected.id) ? '展开子孙' : '折叠子孙'}</button>
            <button type="button" onClick={props.onSetCenter}>设为中心</button>
            <button type="button" disabled={!props.collapsed.size} onClick={props.onExpandAll}>展开全部</button>
          </div>
        </details>}
        {showDirectory && <aside id="family-directory" className="family-directory" aria-label="家人名录" onKeyDown={(event) => { if (event.key === 'Escape') dismissDirectory() }}>
          <div className="directory-head"><div><p className="eyebrow">FAMILY DIRECTORY</p><h2>{props.query.trim() ? '搜索结果' : '家人名录'} <small>{matches.length}</small></h2></div><button type="button" className="text-button" onClick={dismissDirectory}>关闭名录</button></div>
          <div className="directory-list search-results">
            {matches.map((person) => {
              const parent = indexes.parentsByChild.get(person.id)?.[0]
              const parentName = parent && indexes.personById.get(parent.parentId)?.name
              const partnerId = indexes.spouseByPerson.get(person.id)
              const partnerName = partnerId && indexes.personById.get(partnerId)?.name
              return <button type="button" key={person.id} className={`person-link ${props.selectedId === person.id ? 'current' : ''}`} onClick={() => { props.onLocate(person.id); setDirectoryOpen(false) }}>
                <span className="directory-initial" aria-hidden="true">{person.name.slice(0, 1)}</span>
                <span><b>{person.name}</b><small>{dateText(person.birth)} · {parentName ? `父母：${parentName}` : partnerName ? `配偶：${partnerName}` : '亲属待补充'}</small></span>
              </button>
            })}
            {!matches.length && <p className="search-empty">没有找到匹配的家人。试试姓名、籍贯或简介中的文字。</p>}
          </div>
        </aside>}
      </section>
      {selected && <aside className="detail" aria-label="人物档案">{props.children}</aside>}
    </div>
  )
}
