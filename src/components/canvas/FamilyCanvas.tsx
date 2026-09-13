import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  Controls,
  ReactFlow,
  type Node,
  type FitViewOptions,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { familyNodeTypes } from './nodes'
import type { Edge } from '@xyflow/react'

const fitOptions = (): FitViewOptions => ({
  padding: { top: window.innerHeight > 850 && window.innerWidth > 600 ? '140px' : '16px', bottom: '72px', left: '24px', right: '24px' },
  maxZoom: 1,
})

interface FamilyCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onPersonSelect: (personId: string) => void
  /** A search/navigation request. Focus is deferred until the person node exists. */
  focusPersonId?: string | null
}

export function FamilyCanvas({ nodes, edges, onPersonSelect, focusPersonId }: FamilyCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<ReactFlowInstance | null>(null)
  const lastFitSignature = useRef<string>('')
  const lastFocusedPersonId = useRef<string | null>(null)
  const [flowReady, setFlowReady] = useState(false)
  const personSignature = nodes
    .filter((node) => node.type === 'person')
    .map((node) => node.id)
    .sort()
    .join('|')

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.type === 'person') onPersonSelect(node.id)
  }, [onPersonSelect])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance
    instance.fitView(fitOptions())
    lastFitSignature.current = personSignature
    setFlowReady(true)
  }, [personSignature])

  useEffect(() => {
    const flow = flowRef.current
    if (!flow || !flowReady || !personSignature) return

    if (!focusPersonId) {
      lastFocusedPersonId.current = null
    } else if (focusPersonId !== lastFocusedPersonId.current) {
      const targetNode = nodes.find((node) => node.type === 'person' && node.id === focusPersonId)
      if (targetNode) {
        lastFocusedPersonId.current = focusPersonId
        lastFitSignature.current = personSignature
        void flow.fitView({
          nodes: [targetNode],
          ...fitOptions(),
          minZoom: 0.75,
          maxZoom: 1,
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320,
        })
        return
      }
    }

    if (personSignature === lastFitSignature.current) return
    lastFitSignature.current = personSignature
    void flow.fitView({ ...fitOptions(), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200 })
  }, [flowReady, focusPersonId, personSignature, nodes, edges])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    let width = element.clientWidth
    let height = element.clientHeight
    let windowWidth = window.innerWidth
    let windowHeight = window.innerHeight
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth
      const nextHeight = element.clientHeight
      const flow = flowRef.current
      if (flow && width && height && (windowWidth !== window.innerWidth || windowHeight !== window.innerHeight)) {
        void flow.fitView(fitOptions())
      } else if (flow && width && height) {
        const viewport = flow.getViewport()
        void flow.setViewport({ ...viewport, x: viewport.x + (nextWidth - width) / 2, y: viewport.y + (nextHeight - height) / 2 })
      }
      width = nextWidth
      height = nextHeight
      windowWidth = window.innerWidth
      windowHeight = window.innerHeight
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const onCanvasKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target
    if (!(target instanceof Element)) return
    const personNode = target.closest<HTMLElement>('.react-flow__node-person')
    const personId = personNode?.dataset.id
    if (!personId) return
    event.preventDefault()
    onPersonSelect(personId)
  }, [onPersonSelect])

  return (
    <div ref={containerRef} className="family-canvas">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={familyNodeTypes}
      onNodeClick={onNodeClick}
      onKeyDownCapture={onCanvasKeyDown}
      onInit={onInit}
      fitViewOptions={fitOptions()}
      minZoom={0.2}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: true }}
    >
      <Controls className="canvas-controls" position="bottom-center" showInteractive={false} fitViewOptions={fitOptions()} />
    </ReactFlow>
    </div>
  )
}
