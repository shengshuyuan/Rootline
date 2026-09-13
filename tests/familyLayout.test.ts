import { describe, expect, it } from 'vitest'
import { layoutFamilyTree } from '../src/domain'
import { fourGenerationTree } from '../src/fixtures'

describe('family layout', () => {
  it('places recorded partners on the same row directly beside one another', () => {
    const graph = layoutFamilyTree(fourGenerationTree, { centerId: 'p9', mode: 'full' })
    const positions = new Map(graph.nodes.filter((node) => node.kind === 'person').map((node) => [node.id, node.position]))
    expect(positions.get('p9')?.y).toBe(positions.get('p10')?.y)
    expect(Math.abs(positions.get('p9')!.x - positions.get('p10')!.x)).toBe(220)
    expect(graph.edges.find((edge) => edge.kind === 'partner' && new Set([edge.source, edge.target]).has('p9') && new Set([edge.source, edge.target]).has('p10'))).toBeTruthy()
  })

  it('uses a shared junction for two recorded parents and direct vertical edges for a single parent without spouse', () => {
    const graph = layoutFamilyTree(fourGenerationTree, { centerId: 'p9', mode: 'full' })
    const junction = graph.nodes.find((node) => node.kind === 'junction' && graph.edges.some((edge) => edge.kind === 'junction-to-child' && edge.source === node.id && edge.target === 'p13'))
    expect(junction).toBeTruthy()
    expect(graph.edges.filter((edge) => edge.kind === 'parent-to-junction' && edge.target === junction!.id).map((edge) => edge.source).sort()).toEqual(['p10', 'p9'])
    // p13 has children but no spouse → direct parent-child edges (not a marital junction).
    expect(graph.edges.some((edge) => edge.kind === 'parent-child' && edge.source === 'p13' && edge.target === 'p17')).toBe(true)
    // p12 has spouse p11: even a single recorded parent link hangs under the couple unit.
    expect(graph.edges.some((edge) => edge.kind === 'parent-child' && edge.source === 'p12' && edge.target === 'p20')).toBe(false)
    expect(graph.edges.some((edge) => edge.kind === 'junction-to-child' && edge.target === 'p20')).toBe(true)
  })

  it('creates only one junction-to-child edge per family unit and child', () => {
    const graph = layoutFamilyTree(fourGenerationTree, { centerId: 'p9', mode: 'full' })
    // p13 has both father (p9) and mother (p10) relationships — must not double-draw.
    expect(graph.edges.filter((edge) => edge.kind === 'junction-to-child' && edge.target === 'p13')).toHaveLength(1)
    expect(graph.edges.filter((edge) => edge.kind === 'junction-to-child' && edge.target === 'p14')).toHaveLength(1)

    const counts = new Map<string, number>()
    graph.edges.filter((edge) => edge.kind === 'junction-to-child').forEach((edge) => {
      const key = `${edge.source}->${edge.target}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    for (const [key, count] of counts) {
      expect({ key, count }).toEqual({ key, count: 1 })
    }
  })

  it('hides every descendant of a collapsed person while retaining the person itself', () => {
    const graph = layoutFamilyTree(fourGenerationTree, { centerId: 'p9', mode: 'full', collapsed: new Set(['p9']) })
    expect(graph.visiblePersonIds.has('p9')).toBe(true)
    expect(graph.hiddenPersonIds).toEqual(expect.objectContaining(new Set(['p13', 'p14', 'p17', 'p18', 'p19'])))
    expect(graph.visiblePersonIds.has('p13')).toBe(false)
    expect(graph.edges.some((edge) => edge.source === 'p13' || edge.target === 'p13')).toBe(false)
  })

  it('main lineage keeps biological sons and daughters, but stops at daughters', () => {
    const full = layoutFamilyTree(fourGenerationTree, { centerId: 'p9', mode: 'full' })
    const lineage = layoutFamilyTree(fourGenerationTree, { centerId: 'p9', mode: 'lineage' })
    // Full view still has wife and daughter
    expect(full.visiblePersonIds.has('p14')).toBe(true) // 女儿
    expect(full.visiblePersonIds.has('p10')).toBe(true) // 配偶
    // 主脉: 儿子、女儿均保留；配偶剔除。
    expect(lineage.visiblePersonIds.has('p13')).toBe(true)
    expect(lineage.visiblePersonIds.has('p14')).toBe(true)
    expect(lineage.visiblePersonIds.has('p10')).toBe(false)
    // 女儿的后代也不在主脉
    expect(lineage.visiblePersonIds.has('p19')).toBe(false)
  })

  it('main lineage from father includes every biological child via his own parent edges', () => {
    const stamp = '2026-07-12T00:00:00.000Z'
    const tree = {
      ...fourGenerationTree,
      persons: [
        { ...fourGenerationTree.persons[0], id: 'mom', name: '李开善', gender: 'female' as const },
        { ...fourGenerationTree.persons[1], id: 'dad', name: '盛义明', gender: 'male' as const },
        { ...fourGenerationTree.persons[2], id: 'kid', name: '盛森林', gender: 'male' as const },
        { ...fourGenerationTree.persons[3], id: 'dau', name: '盛女', gender: 'female' as const },
      ],
      parentChildRelationships: [
        {
          id: 'pc-f', parentId: 'dad', childId: 'kid', parentRole: 'father' as const,
          relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp,
        },
        {
          id: 'pc-m', parentId: 'mom', childId: 'kid', parentRole: 'mother' as const,
          relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp,
        },
        {
          id: 'pc-d', parentId: 'dad', childId: 'dau', parentRole: 'father' as const,
          relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp,
        },
      ],
      partnerRelationships: [{
        id: 'pr', person1Id: 'mom', person2Id: 'dad', relationshipType: 'married' as const,
        createdAt: stamp, updatedAt: stamp,
      }],
      rootPersonId: 'dad',
    }
    const lineage = layoutFamilyTree(tree, { centerId: 'dad', mode: 'lineage' })
    expect(lineage.visiblePersonIds.has('dad')).toBe(true)
    expect(lineage.visiblePersonIds.has('kid')).toBe(true)
    expect(lineage.visiblePersonIds.has('mom')).toBe(false)
    expect(lineage.visiblePersonIds.has('dau')).toBe(true)
    // Full still shows everyone
    const full = layoutFamilyTree(tree, { centerId: 'dad', mode: 'full' })
    expect(full.visiblePersonIds.has('mom')).toBe(true)
    expect(full.visiblePersonIds.has('dau')).toBe(true)
  })

  it('stops at a daughter while a son continues the biological main-line branch', () => {
    const stamp = '2026-07-14T00:00:00.000Z'
    const tree = {
      ...fourGenerationTree,
      persons: [
        { ...fourGenerationTree.persons[0], id: 'father', name: '父', gender: 'male' as const },
        { ...fourGenerationTree.persons[1], id: 'son', name: '儿', gender: 'male' as const },
        { ...fourGenerationTree.persons[2], id: 'daughter', name: '女', gender: 'female' as const },
        { ...fourGenerationTree.persons[3], id: 'grandson', name: '孙', gender: 'male' as const },
        { ...fourGenerationTree.persons[4], id: 'daughterChild', name: '外孙', gender: 'male' as const },
      ],
      parentChildRelationships: [
        { id: 'f-s', parentId: 'father', childId: 'son', parentRole: 'father' as const, relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp },
        { id: 'f-d', parentId: 'father', childId: 'daughter', parentRole: 'father' as const, relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp },
        { id: 's-g', parentId: 'son', childId: 'grandson', parentRole: 'father' as const, relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp },
        { id: 'd-c', parentId: 'daughter', childId: 'daughterChild', parentRole: 'mother' as const, relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp },
      ],
      partnerRelationships: [],
      rootPersonId: 'father',
    }
    const lineage = layoutFamilyTree(tree, { centerId: 'father', mode: 'lineage' })
    expect([...lineage.visiblePersonIds]).toEqual(expect.arrayContaining(['father', 'son', 'daughter', 'grandson']))
    expect(lineage.visiblePersonIds.has('daughterChild')).toBe(false)
  })

  it('hangs a child under the marital unit when only one parent is recorded but a spouse is visible', () => {
    // Mother-only parent link + visible father spouse (matches the 李开善/盛义明/盛森林 case).
    const tree = {
      ...fourGenerationTree,
      persons: fourGenerationTree.persons.slice(0, 3).map((person, index) => {
        if (index === 0) return { ...person, id: 'mom', name: '李开善', gender: 'female' as const }
        if (index === 1) return { ...person, id: 'dad', name: '盛义明', gender: 'male' as const }
        return { ...person, id: 'kid', name: '盛森林', gender: 'male' as const }
      }),
      parentChildRelationships: [{
        id: 'only-mom',
        parentId: 'mom',
        childId: 'kid',
        parentRole: 'mother' as const,
        relationshipType: 'biological' as const,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      }],
      partnerRelationships: [{
        id: 'couple',
        person1Id: 'mom',
        person2Id: 'dad',
        relationshipType: 'married' as const,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      }],
      rootPersonId: 'mom',
    }

    const graph = layoutFamilyTree(tree, { centerId: 'mom', mode: 'full' })
    const positions = new Map(graph.nodes.filter((node) => node.kind === 'person').map((node) => [node.id, node.position]))
    const coupleMid = (positions.get('mom')!.x + positions.get('dad')!.x) / 2

    // No direct mother→child edge; use couple junction instead.
    expect(graph.edges.some((edge) => edge.kind === 'parent-child' && edge.target === 'kid')).toBe(false)
    const junction = graph.nodes.find((node) => node.kind === 'junction')
    expect(junction).toBeTruthy()
    expect(graph.edges.filter((edge) => edge.kind === 'parent-to-junction' && edge.target === junction!.id).map((edge) => edge.source).sort()).toEqual(['dad', 'mom'])
    expect(graph.edges.filter((edge) => edge.kind === 'junction-to-child' && edge.target === 'kid')).toHaveLength(1)
    // Child centered under the couple, not stuck under mother only.
    expect(positions.get('kid')!.x).toBeCloseTo(coupleMid, 5)
  })

  it('centers multiple siblings as a group under their parents', () => {
    const stamp = '2026-07-12T00:00:00.000Z'
    const tree = {
      ...fourGenerationTree,
      persons: [
        { ...fourGenerationTree.persons[0], id: 'f', name: '父', gender: 'male' as const },
        { ...fourGenerationTree.persons[1], id: 'm', name: '母', gender: 'female' as const },
        { ...fourGenerationTree.persons[2], id: 'c1', name: '长子', gender: 'male' as const },
        { ...fourGenerationTree.persons[3], id: 'c2', name: '次子', gender: 'male' as const },
        { ...fourGenerationTree.persons[4], id: 'c3', name: '三女', gender: 'female' as const },
      ],
      parentChildRelationships: ['c1', 'c2', 'c3'].flatMap((childId, index) => [
        { id: `pc-f-${index}`, parentId: 'f', childId, parentRole: 'father' as const, relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp },
        { id: `pc-m-${index}`, parentId: 'm', childId, parentRole: 'mother' as const, relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp },
      ]),
      partnerRelationships: [{ id: 'pr', person1Id: 'f', person2Id: 'm', relationshipType: 'married' as const, createdAt: stamp, updatedAt: stamp }],
      rootPersonId: 'f',
    }

    const graph = layoutFamilyTree(tree, { centerId: 'f', mode: 'full' })
    const positions = new Map(graph.nodes.filter((node) => node.kind === 'person').map((node) => [node.id, node.position]))
    const coupleMid = (positions.get('f')!.x + positions.get('m')!.x) / 2
    const siblingMid = (positions.get('c1')!.x + positions.get('c3')!.x) / 2
    expect(siblingMid).toBeCloseTo(coupleMid, 5)
    expect(positions.get('c2')!.x - positions.get('c1')!.x).toBe(220)
    expect(positions.get('c3')!.x - positions.get('c2')!.x).toBe(220)
    // One downward edge per child from the shared junction.
    expect(graph.edges.filter((edge) => edge.kind === 'junction-to-child')).toHaveLength(3)
  })
})
