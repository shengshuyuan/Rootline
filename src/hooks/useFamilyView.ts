import { useEffect, useMemo, useState } from 'react'
import { createFamilyIndexes, expandCollapsedPathToPerson, type FamilyViewMode } from '../domain'
import { buildFlowGraph } from '../components/canvas/graphAdapter'
import type { FamilyTree } from '../types'

/** View state never changes the persisted family facts. Selection reuses layout. */
export function useFamilyView(tree: FamilyTree | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<string | undefined>()
  const [mode, setMode] = useState<FamilyViewMode>('full')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null)
  useEffect(() => {
    if (tree && center === undefined) setCenter(tree.rootPersonId)
  }, [tree, center])
  const indexes = useMemo(() => tree ? createFamilyIndexes(tree) : null, [tree])
  const selected = selectedId ? indexes?.personById.get(selectedId) : undefined
  const layout = useMemo(
    () => tree ? buildFlowGraph(tree, center, collapsed, mode) : { nodes: [], edges: [], hiddenPersonCount: 0 },
    [tree, center, collapsed, mode],
  )
  const graph = useMemo(() => ({
    ...layout,
    nodes: layout.nodes.map((node) => node.type === 'person'
      ? { ...node, data: { ...node.data, selected: node.id === selectedId } }
      : node),
  }), [layout, selectedId])

  const locatePerson = (personId: string) => {
    const nextCollapsed = tree ? expandCollapsedPathToPerson(tree, personId, collapsed) : collapsed
    setCollapsed(nextCollapsed)
    const nextLayout = tree ? buildFlowGraph(tree, center, nextCollapsed, mode) : layout
    // A lineage filter can exclude the search target. Show the full family without
    // changing the user's chosen center just to reveal a search result.
    if (!nextLayout.nodes.some((node) => node.id === personId)) setMode('full')
    setSelectedId(personId)
    setFocusPersonId(personId)
    setQuery('')
  }
  return {
    selectedId, setSelectedId, selected, center, setCenter, mode, setMode,
    collapsed, setCollapsed, query, setQuery, focusPersonId, setFocusPersonId,
    graph, locatePerson,
  }
}
