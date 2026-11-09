import type { ELK, ElkNode, ElkPoint } from 'elkjs/lib/elk-api'

export const DAG_NODE_WIDTH = 256
export const DAG_NODE_HEIGHT = 96
export const DAG_NODE_GAP = 88
export const DAG_LAYER_GAP = 112
const PADDING = 48

export interface DagLayoutInput { id: string; height?: number }
export interface DagConnection { source: string; target: string }
export interface DagPort { id: string; y: number }
export interface DagPosition {
  id: string; x: number; y: number; width: number; height: number
  inputs: DagPort[]; outputs: DagPort[]
}
export interface DagRoute extends DagConnection {
  id: string; sourceHandle: string; targetHandle: string; points: ElkPoint[]; path: string
}
export interface DagLayout { nodes: DagPosition[]; edges: DagRoute[]; width: number; height: number }

let engine: Promise<ELK> | undefined
function getEngine(): Promise<ELK> {
  // Lazy-loaded once; progress polling never reloads or reruns the layout engine.
  engine ??= import('elkjs/lib/elk.bundled.js').then(({ default: Elk }) => new Elk()).catch(error => {
    engine = undefined
    throw error
  })
  return engine
}

/** Round only the corners of the obstacle-free orthogonal route. */
export function roundedDagPath(points: ElkPoint[], radius = 8): string {
  if (!points.length) return ''
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1], corner = points[i], after = points[i + 1]
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y)
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y)
    if (!incoming || !outgoing) continue
    const r = Math.min(radius, incoming / 2, outgoing / 2)
    const start = { x: corner.x + (before.x - corner.x) * r / incoming, y: corner.y + (before.y - corner.y) * r / incoming }
    const end = { x: corner.x + (after.x - corner.x) * r / outgoing, y: corner.y + (after.y - corner.y) * r / outgoing }
    path += ` L ${start.x} ${start.y} Q ${corner.x} ${corner.y} ${end.x} ${end.y}`
  }
  const end = points[points.length - 1]
  return `${path} L ${end.x} ${end.y}`
}

/** Center each uninterrupted branch between its split and join, keeping ELK's routing corridors. */
function centerBranches(layout: DagLayout): DagLayout {
  const byId = new Map(layout.nodes.map(node => [node.id, node]))
  const incoming = new Map(layout.nodes.map(node => [node.id, layout.edges.filter(edge => edge.target === node.id)]))
  const outgoing = new Map(layout.nodes.map(node => [node.id, layout.edges.filter(edge => edge.source === node.id)]))
  const isInterior = (id: string) => incoming.get(id)?.length === 1 && outgoing.get(id)?.length === 1
  let centered = layout
  for (const split of layout.nodes.filter(node => !isInterior(node.id))) {
    for (const first of outgoing.get(split.id) ?? []) {
      const branch: DagPosition[] = []
      const seen = new Set<string>()
      let id = first.target
      while (isInterior(id) && !seen.has(id)) {
        seen.add(id)
        branch.push(byId.get(id)!)
        id = outgoing.get(id)![0].target
      }
      const join = byId.get(id)
      if (!branch.length || !join || seen.has(id)) continue
      const left = Math.min(...branch.map(node => node.x))
      const right = Math.max(...branch.map(node => node.x + node.width))
      const shift = (split.x + split.width + join.x - left - right) / 2
      if (Math.abs(shift) < .01) continue
      // A complex neighboring branch may occupy the ideal position. Move only
      // as far as the existing node and edge clearances allow.
      for (const fraction of [1, .75, .5, .25]) {
        const dx = shift * fraction
        const candidate: DagLayout = {
          ...centered,
          nodes: centered.nodes.map(node => seen.has(node.id) ? { ...node, x: node.x + dx } : node),
          edges: centered.edges.map(edge => {
            const sourceMoves = seen.has(edge.source), targetMoves = seen.has(edge.target)
            if (!sourceMoves && !targetMoves) return edge
            const points = edge.points.map((point, index) => ({ ...point, x: point.x + (
              (sourceMoves && targetMoves) || (sourceMoves && index === 0) || (targetMoves && index === edge.points.length - 1) ? dx : 0
            ) }))
            return { ...edge, points, path: roundedDagPath(points) }
          }),
        }
        if (clearBranchPositions(candidate)) { centered = candidate; break }
      }
    }
  }
  return centered
}

function clearBranchPositions(layout: DagLayout): boolean {
  for (const a of layout.nodes) for (const b of layout.nodes) {
    if (a.id === b.id) continue
    if (a.x < b.x + b.width + 16 && a.x + a.width + 16 > b.x && a.y < b.y + b.height + 16 && a.y + a.height + 16 > b.y) return false
  }
  for (const edge of layout.edges) {
    const points = edge.points
    if (points[1].x - points[0].x < 16 || points.at(-1)!.x - points.at(-2)!.x < 16) return false
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      for (const node of layout.nodes) {
        const gap = node.id === edge.source || node.id === edge.target ? 0 : 16
        const left = node.x - gap, right = node.x + node.width + gap
        const top = node.y - gap, bottom = node.y + node.height + gap
        if (a.x === b.x
          ? a.x > left + .01 && a.x < right - .01 && Math.max(a.y, b.y) > top + .01 && Math.min(a.y, b.y) < bottom - .01
          : a.y > top + .01 && a.y < bottom - .01 && Math.max(a.x, b.x) > left + .01 && Math.min(a.x, b.x) < right - .01) return false
      }
    }
  }
  return true
}

export async function layoutDag(nodes: DagLayoutInput[], connections: DagConnection[]): Promise<DagLayout> {
  if (!nodes.length) return { nodes: [], edges: [], width: 0, height: 0 }
  const ids = new Set(nodes.map(node => node.id))
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
  const edges = [...new Map(connections.filter(edge => ids.has(edge.source) && ids.has(edge.target))
    .map(edge => [JSON.stringify([edge.source, edge.target]), edge])).values()]
    .sort((a, b) => compare(a.source, b.source) || compare(a.target, b.target))
    .map((edge, index) => ({ ...edge, id: `dependency-${index}`, sourceHandle: `out-${index}`, targetHandle: `in-${index}` }))
  const graph: ElkNode = {
    id: 'workflow',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': `[top=${PADDING},left=${PADDING},bottom=${PADDING},right=${PADDING}]`,
      'elk.spacing.nodeNode': String(DAG_NODE_GAP),
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '20',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(DAG_LAYER_GAP),
      'elk.layered.spacing.edgeNodeBetweenLayers': '32',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.mergeEdges': 'false',
      'elk.randomSeed': '1',
    },
    children: [...nodes].sort((a, b) => compare(a.id, b.id)).map(node => ({
      id: node.id, width: DAG_NODE_WIDTH, height: node.height ?? DAG_NODE_HEIGHT,
      layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
      ports: [
        ...edges.filter(edge => edge.target === node.id).map(edge => ({ id: edge.targetHandle, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } })),
        ...edges.filter(edge => edge.source === node.id).map(edge => ({ id: edge.sourceHandle, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } })),
      ],
    })),
    edges: edges.map(edge => ({ id: edge.id, sources: [edge.sourceHandle], targets: [edge.targetHandle] })),
  }
  const result = await (await getEngine()).layout(graph)
  const routed = new Map(result.edges?.map(edge => [edge.id, edge]))
  return centerBranches({
    width: result.width ?? 0, height: result.height ?? 0,
    nodes: (result.children ?? []).map(node => ({
      id: node.id, x: node.x ?? 0, y: node.y ?? 0, width: node.width!, height: node.height!,
      inputs: (node.ports ?? []).filter(port => port.id.startsWith('in-')).map(port => ({ id: port.id, y: port.y ?? node.height! / 2 })),
      outputs: (node.ports ?? []).filter(port => port.id.startsWith('out-')).map(port => ({ id: port.id, y: port.y ?? node.height! / 2 })),
    })),
    edges: edges.map(edge => {
      const section = routed.get(edge.id)?.sections?.[0]
      if (!section) throw new Error('工作流连线路径生成失败')
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      return { ...edge, points, path: roundedDagPath(points) }
    }),
  })
}

/** Initial view keeps text readable; explicit fit includes every routed edge. */
export function dagViewport(layout: Pick<DagLayout, 'width' | 'height'>, width: number, height: number, overview = false) {
  const fit = Math.min(width / Math.max(1, layout.width), height / Math.max(1, layout.height), 1.08)
  const zoom = Math.max(overview ? 0.05 : 0.72, fit)
  const align = (available: number, size: number) => size * zoom <= available ? (available - size * zoom) / 2 : 16 - PADDING * zoom
  return { x: align(width, layout.width), y: align(height, layout.height), zoom }
}
