<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WorkflowEdge, WorkflowNode } from '~/types'

const props = defineProps<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>()

const container = ref<HTMLDivElement>()
let graph: import('@antv/x6').Graph | null = null
let GraphCtor: typeof import('@antv/x6').Graph | null = null

const NODE_COLOR: Record<string, string> = {
  success: '#16a34a',
  running: '#1a6dff',
  queued: '#94a3b8',
  pending: '#cbd5e1',
  failed: '#e63946',
  stopped: '#64748b',
}

async function render(): Promise<void> {
  if (!container.value || props.nodes.length === 0) return
  if (!GraphCtor) {
    // 仅客户端加载 X6，避免 SSR 阶段引用 DOM 全局对象
    GraphCtor = (await import('@antv/x6')).Graph
  }
  if (graph) {
    graph.dispose()
    graph = null
  }

  graph = new GraphCtor({
    container: container.value,
    autoResize: true,
    background: { color: '#f8fafc' },
    grid: false,
    interacting: false,
    panning: false,
  })

  const n = props.nodes.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)))
  const rows = Math.ceil(n / cols)
  const nodeW = 150
  const nodeH = 52
  const gapX = 60
  const gapY = 36

  props.nodes.forEach((nd, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    graph!.addNode({
      id: nd.id,
      x: col * (nodeW + gapX) + 40,
      y: row * (nodeH + gapY) + 40,
      width: nodeW,
      height: nodeH,
      attrs: {
        body: {
          rx: 6,
          ry: 6,
          fill: NODE_COLOR[nd.status] ?? '#cbd5e1',
          stroke: 'none',
        },
        label: {
          text: nd.progress != null ? `${nd.name} ${nd.progress}%` : nd.name,
          fill: '#ffffff',
          fontSize: 12,
          textWrap: { width: nodeW - 14, height: nodeH - 8, breakWord: true },
          textVerticalAnchor: 'middle',
          textAnchor: 'middle',
        },
      },
    })
  })

  const ids = new Set(props.nodes.map((x) => x.id))
  props.edges.forEach((e) => {
    if (!ids.has(e.source) || !ids.has(e.target)) return
    graph!.addEdge({
      source: e.source,
      target: e.target,
      attrs: {
        line: {
          stroke: '#94a3b8',
          strokeWidth: 1.5,
          targetMarker: { name: 'block', size: 6 },
        },
      },
    })
  })

  graph.zoomToFit({ padding: 16, maxScale: 1.2, minScale: 0.4 })
}

onMounted(() => {
  void render()
})

watch(
  () => [props.nodes, props.edges],
  () => void render(),
  { deep: true },
)

onBeforeUnmount(() => {
  graph?.dispose()
  graph = null
})
</script>

<template>
  <div ref="container" class="dag-container" />
</template>

<style scoped>
.dag-container {
  width: 100%;
  height: 420px;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  overflow: hidden;
}
</style>
