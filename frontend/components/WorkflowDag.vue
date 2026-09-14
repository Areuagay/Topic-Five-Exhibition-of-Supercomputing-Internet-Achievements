<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Handle,
  MarkerType,
  Position,
  VueFlow,
  useVueFlow,
  type Edge,
  type Node,
  type NodeMouseEvent,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import type { WorkflowEdge, WorkflowNode } from '~/types'
import { positionDagPopover } from '~/utils/dag-popover'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const props = defineProps<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>()

interface PositionedNode {
  node: WorkflowNode
  x: number
  y: number
}

interface PopoverPosition {
  left: number
  top: number
  placement: 'top' | 'bottom'
  arrow: number
}

const FLOW_ID = 'run-workflow'
const NODE_WIDTH = 184
const NODE_HEIGHT = 72
const LAYER_GAP = 80
const ROW_GAP = 28
const CANVAS_PADDING = 48
const POPOVER_WIDTH = 280
const POPOVER_FALLBACK_HEIGHT = 124

const frame = ref<HTMLDivElement>()
const popoverElement = ref<HTMLElement>()
const selectedNodeId = ref<string | null>(null)
const popover = ref<PopoverPosition>({ left: 0, top: 0, placement: 'top', arrow: 140 })
const popoverReady = ref(false)
let resizeObserver: ResizeObserver | null = null
let updateFrame = 0

const {
  fitView: flowFitView,
  zoomIn: flowZoomIn,
  zoomOut: flowZoomOut,
  findNode,
  addSelectedNodes,
  removeSelectedElements,
} = useVueFlow(FLOW_ID)

const STATUS_COLORS: Record<string, string> = {
  success: '#32915b',
  running: '#1769d2',
  queued: '#b57820',
  pending: '#9aa6b5',
  failed: '#d64b4b',
  stopped: '#687588',
}

const STATUS_TEXT: Record<string, string> = {
  success: '已完成',
  running: '运行中',
  queued: '排队中',
  pending: '等待执行',
  failed: '失败',
  stopped: '已停止',
}

const graphLabel = computed(
  () => `工作流 DAG，共 ${props.nodes.length} 个节点、${props.edges.length} 条连接`,
)
const selectedNode = computed(
  () => props.nodes.find((node) => node.id === selectedNodeId.value) ?? null,
)
const selectedNodeColor = computed(
  () => STATUS_COLORS[selectedNode.value?.status ?? 'pending'] ?? STATUS_COLORS.pending,
)

function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status
}

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.pending
}

function clampedProgress(progress?: number): number {
  return Math.min(100, Math.max(0, progress ?? 0))
}

function nodeMeta(node: WorkflowNode): string {
  const status = statusText(node.status)
  return node.progress != null ? `${status} · ${node.progress}%` : status
}

function computeLayeredLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): PositionedNode[] {
  const ids = new Set(nodes.map((node) => node.id))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const ranks = new Map(nodes.map((node) => [node.id, 0]))

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    outgoing.get(edge.source)?.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
  const visited = new Set<string>()
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor]
    visited.add(id)
    const rank = ranks.get(id) ?? 0
    for (const target of outgoing.get(id) ?? []) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, rank + 1))
      const nextIndegree = (indegree.get(target) ?? 1) - 1
      indegree.set(target, nextIndegree)
      if (nextIndegree === 0) queue.push(target)
    }
  }

  const lastRank = Math.max(0, ...ranks.values())
  for (const node of nodes) {
    if (!visited.has(node.id)) ranks.set(node.id, lastRank + 1)
  }

  const layers = new Map<number, WorkflowNode[]>()
  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0
    const layer = layers.get(rank) ?? []
    layer.push(node)
    layers.set(rank, layer)
  }

  const maxLayerSize = Math.max(1, ...Array.from(layers.values(), (layer) => layer.length))
  const layoutHeight = maxLayerSize * NODE_HEIGHT + (maxLayerSize - 1) * ROW_GAP
  const positioned: PositionedNode[] = []

  for (const [rank, layer] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    const layerHeight = layer.length * NODE_HEIGHT + (layer.length - 1) * ROW_GAP
    const startY = CANVAS_PADDING + (layoutHeight - layerHeight) / 2
    layer.forEach((node, index) => {
      positioned.push({
        node,
        x: CANVAS_PADDING + rank * (NODE_WIDTH + LAYER_GAP),
        y: startY + index * (NODE_HEIGHT + ROW_GAP),
      })
    })
  }

  return positioned
}

const flowNodes = computed<Node<WorkflowNode>[]>(() =>
  computeLayeredLayout(props.nodes, props.edges).map(({ node, x, y }) => ({
    id: node.id,
    type: 'workflow',
    position: { x, y },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: node,
    draggable: false,
    connectable: false,
    selectable: true,
    focusable: true,
    deletable: false,
    ariaLabel: `${node.name}，${nodeMeta(node)}`,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  })),
)

const flowEdges = computed<Edge[]>(() => {
  const ids = new Set(props.nodes.map((node) => node.id))
  return props.edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge, index) => ({
      id: `${edge.source}-${edge.target}-${index}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      selectable: false,
      focusable: false,
      deletable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: '#aebaca',
      },
      style: { stroke: '#aebaca', strokeWidth: 1.4 },
    }))
})

function schedulePopoverUpdate(): void {
  if (!selectedNodeId.value) return
  cancelAnimationFrame(updateFrame)
  updateFrame = requestAnimationFrame(updatePopoverPosition)
}

function updatePopoverPosition(): void {
  if (!frame.value || !selectedNodeId.value) return
  const nodeElement = frame.value.querySelector<HTMLElement>(
    `.vue-flow__node[data-id="${CSS.escape(selectedNodeId.value)}"]`,
  )
  if (!nodeElement) { clearSelection(); return }

  const nodeRect = nodeElement.getBoundingClientRect()
  const frameRect = frame.value.getBoundingClientRect()
  const popoverHeight = popoverElement.value?.offsetHeight ?? POPOVER_FALLBACK_HEIGHT
  const originX = frameRect.left + frame.value.clientLeft, originY = frameRect.top + frame.value.clientTop
  const position = positionDagPopover(
    { width: frame.value.clientWidth, height: frame.value.clientHeight },
    { left:nodeRect.left-originX, right:nodeRect.right-originX, top:nodeRect.top-originY, bottom:nodeRect.bottom-originY },
    popoverElement.value?.offsetWidth ?? Math.min(POPOVER_WIDTH,frame.value.clientWidth-24), popoverHeight,
  )
  if (!position) { clearSelection(); return }
  popover.value = position
  popoverReady.value = true

  if (!popoverElement.value) void nextTick(schedulePopoverUpdate)
}

function handleNodeClick({ node }: NodeMouseEvent): void {
  if (selectedNodeId.value === node.id) {
    clearSelection()
    return
  }

  selectedNodeId.value = node.id
  popoverReady.value = false
  void nextTick(schedulePopoverUpdate)
}

function handleCanvasKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.target as HTMLElement | null
  const nodeElement = target?.closest<HTMLElement>('.vue-flow__node[data-id]')
  const id = nodeElement?.dataset.id
  if (!id) return
  event.preventDefault()

  if (selectedNodeId.value === id) {
    clearSelection()
    return
  }

  removeSelectedElements()
  const node = findNode(id)
  if (node) addSelectedNodes([node])
  selectedNodeId.value = id
  popoverReady.value = false
  void nextTick(schedulePopoverUpdate)
}

function clearSelection(): void {
  popoverReady.value = false
  selectedNodeId.value = null
  removeSelectedElements()
}

function fitView(): void {
  void flowFitView({ padding: '36px', minZoom: 0.42, maxZoom: 1.08, duration: 220 })
}

function zoomIn(): void {
  void flowZoomIn({ duration: 160 })
}

function zoomOut(): void {
  void flowZoomOut({ duration: 160 })
}

function handleCanvasWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  if (event.deltaY < 0) zoomIn()
  else zoomOut()
  schedulePopoverUpdate()
}

function handleNodesInitialized(): void {
  requestAnimationFrame(fitView)
}

watch(
  () => [props.nodes, props.edges],
  () => {
    if (selectedNodeId.value && !props.nodes.some((node) => node.id === selectedNodeId.value)) {
      clearSelection()
    }
    void nextTick(() => requestAnimationFrame(fitView))
  },
  { deep: true },
)

onMounted(() => {
  if (frame.value) {
    resizeObserver = new ResizeObserver(schedulePopoverUpdate)
    resizeObserver.observe(frame.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cancelAnimationFrame(updateFrame)
})
</script>

<template>
  <section class="dag-viewer" aria-labelledby="dag-viewer-title">
    <header class="dag-toolbar">
      <div class="dag-toolbar-copy">
        <h2 id="dag-viewer-title">工作流 DAG</h2>
        <span>Ctrl/⌘ + 滚轮缩放</span>
      </div>
      <div class="dag-controls" role="toolbar" aria-label="工作流视图控制">
        <button type="button" class="dag-control-button" aria-label="缩小工作流" @click="zoomOut">
          <span aria-hidden="true">−</span>
        </button>
        <button type="button" class="dag-control-button" aria-label="放大工作流" @click="zoomIn">
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" class="dag-control-button dag-fit-button" aria-label="适应工作流视图" @click="fitView">
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path d="M7 3H3v4M13 3h4v4M7 17H3v-4m10 4h4v-4" />
          </svg>
          <span>适应视图</span>
        </button>
      </div>
    </header>

    <div v-if="nodes.length" class="dag-canvas-shell">
      <div
        ref="frame"
        class="dag-canvas-frame"
        tabindex="0"
        aria-label="工作流 DAG 画布"
        @keydown="handleCanvasKeydown"
        @keydown.esc="clearSelection"
        @wheel.capture="handleCanvasWheel"
      >
        <VueFlow
          :id="FLOW_ID"
          class="dag-flow"
          :nodes="flowNodes"
          :edges="flowEdges"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :edges-updatable="false"
          :elements-selectable="true"
          :zoom-on-scroll="false"
          :zoom-on-pinch="true"
          :pan-on-drag="true"
          :prevent-scrolling="false"
          :min-zoom="0.35"
          :max-zoom="1.8"
          :elevate-nodes-on-select="false"
          fit-view-on-init
          @node-click="handleNodeClick"
          @pane-click="clearSelection"
          @nodes-initialized="handleNodesInitialized"
          @viewport-change="schedulePopoverUpdate"
        >
          <Background variant="lines" :gap="20" :line-width="1" color="#edf1f5" />
          <template #node-workflow="{ data, selected }">
            <article class="workflow-node" :class="{ 'is-selected': selected }">
              <Handle type="target" :position="Position.Left" :connectable="false" />
              <span class="workflow-node-accent" :style="{ backgroundColor: statusColor(data.status) }" aria-hidden="true" />
              <strong>{{ data.name }}</strong>
              <div class="workflow-node-meta">
                <span class="workflow-node-status" :style="{ backgroundColor: statusColor(data.status) }" aria-hidden="true" />
                <span>{{ nodeMeta(data) }}</span>
              </div>
              <span class="workflow-node-progress" aria-hidden="true">
                <i :style="{ width: `${clampedProgress(data.progress)}%`, backgroundColor: statusColor(data.status) }" />
              </span>
              <Handle type="source" :position="Position.Right" :connectable="false" />
            </article>
          </template>
        </VueFlow>

        <Transition name="dag-popover" mode="out-in">
          <aside
            v-if="selectedNode"
            :key="selectedNode.id"
            ref="popoverElement"
            class="dag-node-popover nodrag nopan nowheel"
            :data-placement="popover.placement"
            :style="{ left: `${popover.left}px`, top: `${popover.top}px`, '--arrow-left': `${popover.arrow}px`, visibility: popoverReady ? 'visible' : 'hidden' }"
            aria-live="polite"
          >
            <div class="dag-node-popover-heading">
              <span class="dag-node-popover-marker" :style="{ backgroundColor: selectedNodeColor }" aria-hidden="true" />
              <div>
                <span>节点详情</span>
                <strong class="dag-node-popover-title">{{ selectedNode.name }}</strong>
              </div>
            </div>
            <dl class="dag-node-popover-facts">
              <div><dt>状态</dt><dd>{{ statusText(selectedNode.status) }}</dd></div>
              <div><dt>进度</dt><dd>{{ selectedNode.progress != null ? `${selectedNode.progress}%` : '—' }}</dd></div>
              <div><dt>节点标识</dt><dd translate="no">{{ selectedNode.id }}</dd></div>
            </dl>
          </aside>
        </Transition>
      </div>

      <div class="sr-only">
        <p>{{ graphLabel }}</p>
        <ul><li v-for="node in nodes" :key="node.id">{{ node.name }}，{{ nodeMeta(node) }}</li></ul>
        <ul><li v-for="(edge, index) in edges" :key="`${edge.source}-${edge.target}-${index}`">{{ edge.source }} 连接至 {{ edge.target }}</li></ul>
      </div>
    </div>

    <div v-else class="dag-empty" role="status">暂无工作流数据</div>
  </section>
</template>

<style scoped>
.dag-viewer { min-width: 0; }

.dag-toolbar {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 20px;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}

.dag-toolbar-copy { min-width: 0; }
.dag-toolbar-copy h2 {
  margin: 0;
  display: block;
  color: var(--scnet-text);
  font-size: 19px;
  font-weight: 650;
  line-height: 1.35;
  text-wrap: balance;
}
.dag-toolbar-copy span {
  display: block;
  margin-top: 3px;
  color: var(--scnet-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.dag-controls { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.dag-control-button {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid #d5dde8;
  border-radius: 6px;
  background: #fff;
  color: #526074;
  font-family: var(--scnet-font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  transition: border-color 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.dag-control-button:hover { border-color: #9eb7da; background: #f6f9fd; color: var(--scnet-primary); }
.dag-control-button:focus-visible,
.dag-canvas-frame:focus-visible { outline: 2px solid var(--el-color-primary-light-3); outline-offset: 2px; }
.dag-fit-button svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }

.dag-canvas-shell { min-width: 0; padding: 16px; background: #fbfcfe; }
.dag-canvas-frame {
  position: relative;
  width: 100%;
  height: 390px;
  overflow: hidden;
  border: 1px solid #e0e6ee;
  border-radius: 8px;
  background: #fbfcfe;
}
.dag-flow {
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}
.dag-flow:active { cursor: grabbing; }
.dag-flow :deep(.vue-flow__pane) { cursor: inherit; }
.dag-flow :deep(.vue-flow__node) { width: 184px; height: 72px; border: 0; background: transparent; box-shadow: none; }
.dag-flow :deep(.vue-flow__node:focus-visible) { outline: 2px solid #72a8e6; outline-offset: 4px; border-radius: 8px; }
.dag-flow :deep(.vue-flow__handle) { width: 1px; height: 1px; min-width: 1px; min-height: 1px; border: 0; opacity: 0; pointer-events: none; }

.workflow-node {
  position: relative;
  width: 184px;
  height: 72px;
  overflow: hidden;
  padding: 13px 18px 10px;
  border: 1px solid #d4dde8;
  border-radius: 8px;
  background: #fff;
  color: #253044;
  transition: background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), border-color 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.workflow-node.is-selected { border-color: #d4dde8; background: #f3f7fc; box-shadow: 0 4px 14px rgb(30 83 142 / 10%); }
.workflow-node-accent { position: absolute; top: -1px; bottom: -1px; left: -1px; width: 5px; border-radius: 8px 0 0 8px; }
.workflow-node > strong { display: block; overflow: hidden; color: inherit; font-size: 13px; font-weight: 650; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.workflow-node-meta { min-width: 0; display: flex; align-items: center; gap: 7px; margin-top: 7px; color: #758195; font-size: 11px; line-height: 1.3; }
.workflow-node-meta > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workflow-node-status { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; }
.workflow-node-progress { position: absolute; right: 18px; bottom: 7px; left: 18px; height: 3px; overflow: hidden; border-radius: 2px; background: #edf1f5; }
.workflow-node-progress i { display: block; height: 100%; border-radius: inherit; }

.dag-node-popover {
  position: absolute;
  z-index: 20;
  width: min(280px, calc(100% - 24px));
  padding: 12px;
  border: 1px solid #d9e2ed;
  border-radius: 10px;
  background: rgb(255 255 255 / 98%);
  box-shadow: 0 18px 40px rgb(33 55 85 / 13%), 0 3px 10px rgb(33 55 85 / 8%);
  color: var(--scnet-text);
}
.dag-node-popover[data-placement='top'] { transform: translate(-50%, -100%); transform-origin: bottom center; }
.dag-node-popover[data-placement='bottom'] { transform: translate(-50%, 0); transform-origin: top center; }
.dag-node-popover::after { position: absolute; left: var(--arrow-left, 50%); width: 10px; height: 10px; border-right: 1px solid #d9e2ed; border-bottom: 1px solid #d9e2ed; background: #fff; content: ''; }
.dag-node-popover[data-placement='top']::after { bottom: -6px; transform: translateX(-50%) rotate(45deg); }
.dag-node-popover[data-placement='bottom']::after { top: -6px; transform: translateX(-50%) rotate(225deg); }
.dag-node-popover-heading { min-width: 0; display: grid; grid-template-columns: 4px minmax(0, 1fr); align-items: center; gap: 11px; }
.dag-node-popover-marker { width: 4px; height: 42px; border-radius: 4px; }
.dag-node-popover-heading span:not(.dag-node-popover-marker) { color: #718096; font-size: 12px; font-weight: 550; line-height: 1.3; }
.dag-node-popover-title { display: block; margin-top: 2px; overflow: hidden; color: #253044; font-size: 16px; font-weight: 680; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.dag-node-popover-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 8px 0 0; padding-top: 8px; border-top: 1px solid #edf1f5; }
.dag-node-popover-facts dt,
.dag-node-popover-facts dd { margin: 0; }
.dag-node-popover-facts dt { color: #7b8798; font-size: 12px; font-weight: 500; line-height: 1.3; }
.dag-node-popover-facts dd { margin-top: 4px; overflow: hidden; color: #344156; font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }

.dag-popover-enter-active { transition: opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
.dag-popover-leave-active { transition: opacity 150ms cubic-bezier(0.7, 0, 0.84, 0), transform 150ms cubic-bezier(0.7, 0, 0.84, 0); }
.dag-popover-enter-from,
.dag-popover-leave-to { opacity: 0; }
.dag-node-popover[data-placement='top'].dag-popover-enter-from,
.dag-node-popover[data-placement='top'].dag-popover-leave-to { transform: translate(-50%, calc(-100% + 8px)) scale(0.98); }
.dag-node-popover[data-placement='bottom'].dag-popover-enter-from,
.dag-node-popover[data-placement='bottom'].dag-popover-leave-to { transform: translate(-50%, -8px) scale(0.98); }

.dag-empty { min-height: 240px; display: grid; place-items: center; color: var(--scnet-text-muted); font-size: 13px; background: #fbfcfe; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; padding: 0; margin: -1px; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 700px) {
  .dag-toolbar { align-items: flex-start; flex-direction: column; padding: 14px 16px; }
  .dag-controls { width: 100%; }
  .dag-fit-button { flex: 1 1 auto; }
  .dag-canvas-shell { padding: 10px; }
  .dag-canvas-frame { height: 340px; }
  .dag-node-popover { padding: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .dag-control-button,
  .workflow-node,
  .dag-popover-enter-active,
  .dag-popover-leave-active { transition-duration: 0.01ms; }
  .dag-node-popover[data-placement='top'].dag-popover-enter-from,
  .dag-node-popover[data-placement='top'].dag-popover-leave-to { transform: translate(-50%, -100%); }
  .dag-node-popover[data-placement='bottom'].dag-popover-enter-from,
  .dag-node-popover[data-placement='bottom'].dag-popover-leave-to { transform: translate(-50%, 0); }
}
</style>
