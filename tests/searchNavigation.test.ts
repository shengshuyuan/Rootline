import { describe, expect, it } from 'vitest'
import { buildFlowGraph } from '../src/components/canvas/graphAdapter'
import { expandCollapsedPathToPerson, findCollapsingAncestors } from '../src/domain'
import { fourGenerationTree } from '../src/fixtures'

describe('search navigation through collapsed branches', () => {
  it('finds every collapsed ancestor that can hide the target', () => {
    const collapsed = new Set(['p1', 'p3', 'p10', 'p14', 'p17'])

    expect([...findCollapsingAncestors(fourGenerationTree, 'p19', collapsed)].sort()).toEqual([
      'p1',
      'p10',
      'p14',
      'p3',
    ])
  })

  it('treats either spouse as a collapsing ancestor of their family unit', () => {
    const collapsed = new Set(['p5', 'p11', 'p17'])

    expect([...findCollapsingAncestors(fourGenerationTree, 'p20', collapsed)].sort()).toEqual([
      'p11',
      'p5',
    ])
  })

  it('reveals the target without expanding unrelated branches', () => {
    const collapsed = new Set(['p1', 'p3', 'p10', 'p14', 'p17'])

    expect([...expandCollapsedPathToPerson(fourGenerationTree, 'p19', collapsed)]).toEqual(['p17'])
  })

  it('returns a fresh unchanged collapse state for an unknown target', () => {
    const collapsed = new Set(['p1', 'p17'])
    const next = expandCollapsedPathToPerson(fourGenerationTree, 'missing', collapsed)

    expect(next).not.toBe(collapsed)
    expect(next).toEqual(collapsed)
  })
})

describe('flow graph visibility metadata', () => {
  it('reports the number of people hidden by collapsed family units', () => {
    const graph = buildFlowGraph(fourGenerationTree, 'p9', new Set(['p14']))

    expect(graph.hiddenPersonCount).toBe(1)
    expect(graph.nodes.some((node) => node.id === 'p19')).toBe(false)
  })
})
