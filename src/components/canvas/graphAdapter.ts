import type { Edge, Node } from '@xyflow/react'
import { createFamilyIndexes, layoutFamilyTree, type FamilyViewMode } from '../../domain'
import type { FamilyTree, Person } from '../../types'

export interface PersonNodeData {
  person: Person
  center: boolean
  selected: boolean
}

/**
 * Map domain layout → React Flow.
 * Family blood lines use orthogonal `step` edges (borderRadius 0) so both
 * parents drop to the same bar height; partners stay straight.
 */
export function buildFlowGraph(
  tree: FamilyTree,
  center?: string,
  collapsed: ReadonlySet<string> = new Set(),
  mode: FamilyViewMode = 'full',
  selectedId?: string | null,
): { nodes: Node[]; edges: Edge[]; hiddenPersonCount: number } {
  const layout = layoutFamilyTree(tree, { centerId: center, collapsed, mode })
  const { personById } = createFamilyIndexes(tree)

  const nodes: Node[] = layout.nodes.map((node) => {
    if (node.kind === 'junction') {
      return {
        id: node.id,
        type: 'junction',
        position: node.position,
        data: {},
        draggable: false,
        selectable: false,
      }
    }
    const person = personById.get(node.personId!)!
    return {
      id: node.id,
      type: 'person',
      position: node.position,
      data: {
        person,
        center: node.id === center,
        selected: node.id === selectedId,
      } satisfies PersonNodeData,
      draggable: false,
      focusable: false,
    }
  })

  const edges: Edge[] = layout.edges.map((edge) => {
    const isPartner = edge.kind === 'partner'
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      // Orthogonal step paths keep the two parent drops level; smoothstep wiggled.
      type: isPartner ? 'straight' : 'step',
      pathOptions: isPartner ? undefined : { borderRadius: 0, offset: 0 },
      style: {
        stroke: '#87958e',
        strokeWidth: 1.25,
        strokeDasharray: undefined,
      },
      label: isPartner ? '配偶' : undefined,
    }
  })

  return { nodes, edges, hiddenPersonCount: layout.hiddenPersonIds.size }
}
