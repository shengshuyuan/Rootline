import { layoutFamilyTree, PERSON_NODE_HEIGHT, PERSON_NODE_WIDTH } from '../domain'
import type { FamilyTree, Person } from '../types'
import { dateText } from '../utils/dateText'

const PADDING = 56
const HEADER_HEIGHT = 92
const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!)

function personColor(person: Person) {
  if (person.gender === 'male') return { fill: '#edf6ff', stroke: '#b8d8f2', mark: '#377ba5', markFill: '#d9ecfb' }
  if (person.gender === 'female') return { fill: '#fff0f3', stroke: '#f0c2cd', mark: '#a44b67', markFill: '#f9dce4' }
  return { fill: '#fff7e8', stroke: '#ead29e', mark: '#956f22', markFill: '#f5ebca' }
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, kind: string) {
  if (kind === 'partner') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  const middle = (from.y + to.y) / 2
  return `M ${from.x} ${from.y} V ${middle} H ${to.x} V ${to.y}`
}

/**
 * Build a self-contained, whole-tree PNG rather than a screenshot of the
 * current viewport. Sharing deliberately ignores the selected person, main
 * lineage mode, and local collapsed branches: a recipient should receive the
 * complete family framework.
 */
export async function createFamilyShareImage(tree: FamilyTree): Promise<Blob> {
  const layout = layoutFamilyTree(tree, { mode: 'full' })
  const points = new Map(layout.nodes.map((node) => [node.id, node.position]))
  const people = layout.nodes.filter((node) => node.kind === 'person')
  if (!people.length) throw new Error('当前视图没有可分享的人物')

  const minX = Math.min(...people.map((node) => node.position.x))
  const maxX = Math.max(...people.map((node) => node.position.x + PERSON_NODE_WIDTH))
  const minY = Math.min(...people.map((node) => node.position.y))
  const maxY = Math.max(...people.map((node) => node.position.y + PERSON_NODE_HEIGHT))
  const width = Math.max(920, maxX - minX + PADDING * 2)
  const height = Math.max(360, maxY - minY + PADDING * 2 + HEADER_HEIGHT)
  const translateX = PADDING - minX
  const translateY = PADDING + HEADER_HEIGHT - minY

  const edges = layout.edges.map((edge) => {
    const source = points.get(edge.source)!
    const target = points.get(edge.target)!
    const sourcePoint = edge.kind === 'partner'
      ? { x: source.x + PERSON_NODE_WIDTH / 2, y: source.y + PERSON_NODE_HEIGHT / 2 }
      : { x: source.x + (edge.kind === 'parent-to-junction' ? PERSON_NODE_WIDTH / 2 : 5), y: source.y + (edge.kind === 'parent-to-junction' || edge.kind === 'parent-child' ? PERSON_NODE_HEIGHT : 5) }
    const targetPoint = edge.kind === 'partner'
      ? { x: target.x + PERSON_NODE_WIDTH / 2, y: target.y + PERSON_NODE_HEIGHT / 2 }
      : { x: target.x + (edge.kind === 'junction-to-child' || edge.kind === 'parent-child' ? PERSON_NODE_WIDTH / 2 : 5), y: target.y + (edge.kind === 'parent-to-junction' ? 5 : 0) }
    return `<path d="${edgePath(sourcePoint, targetPoint, edge.kind)}" fill="none" stroke="${edge.kind === 'partner' ? '#b77b69' : '#9a9288'}" stroke-width="${edge.kind === 'partner' ? 2 : 1.5}" ${edge.kind === 'partner' ? 'stroke-dasharray="5 4"' : ''}/>`
  }).join('')

  const cards = people.map((node) => {
    const person = tree.persons.find((candidate) => candidate.id === node.personId)!
    const palette = personColor(person)
    const gender = person.gender === 'male' ? '男' : person.gender === 'female' ? '女' : '待'
    const subline = `${dateText(person.birth)}${person.isDeceased ? ' · 已故' : ''}`
    return `<g transform="translate(${node.position.x},${node.position.y})">
      <rect width="${PERSON_NODE_WIDTH}" height="${PERSON_NODE_HEIGHT}" rx="10" fill="${palette.fill}" stroke="${palette.stroke}"/>
      <circle cx="22" cy="32" r="13" fill="${palette.markFill}"/><text x="22" y="36" text-anchor="middle" font-size="11" font-weight="700" fill="${palette.mark}">${gender}</text>
      <text x="43" y="28" font-size="14" font-weight="700" fill="#29241f">${escapeXml(person.name)}</text>
      <text x="43" y="47" font-size="10" fill="#766d63">${escapeXml(subline)}</text>
    </g>`
  }).join('')

  const viewLabel = '完整家谱分享图'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f4f8f4"/>
    <text x="${PADDING}" y="42" font-family="Noto Sans SC, PingFang SC, sans-serif" font-size="24" font-weight="700" fill="#29241f">${escapeXml(tree.name)}</text>
    <text x="${PADDING}" y="68" font-family="Noto Sans SC, PingFang SC, sans-serif" font-size="13" fill="#70685f">${viewLabel} · 共 ${people.length} 人 · 族源 Rootline</text>
    <g transform="translate(${translateX},${translateY})" font-family="Noto Sans SC, PingFang SC, sans-serif">${edges}${cards}</g>
  </svg>`
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.src = svgUrl
    await image.decode()
    const scale = Math.min(2, 4096 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(width * scale))
    canvas.height = Math.max(1, Math.floor(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器不支持图片生成')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('图片生成失败')
    return png
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export async function shareImageOrDownload(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'image/png' })
  const share = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  if (share.share && (!share.canShare || share.canShare({ files: [file] }))) {
    try {
      await share.share({ title, text: `${title} · 族源 Rootline`, files: [file] })
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return true
    }
  }
  downloadBlob(blob, filename)
  return false
}
