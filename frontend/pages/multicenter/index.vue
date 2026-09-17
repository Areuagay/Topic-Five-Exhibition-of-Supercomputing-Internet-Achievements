<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSlidingHighlight } from '~/composables/useSlidingHighlight'
import { usePreferredReducedMotion } from '@vueuse/core'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import {
  formatBytes,
  formatMs,
  formatNumber,
  formatTimestamp,
} from '~/composables/useFormat'
import type { EChartsCoreOption, Payload } from 'echarts/core'
import type {
  DeploymentMatrix,
  FunctionInfo,
  Invocation,
  Migration,
  MigrationDetail,
  MultiCluster,
  TopoLink,
  Topology,
  TraceDetail,
  Workload,
} from '~/types'

const {
  getClusters,
  getTopology,
  getFunctions,
  getDeploymentMatrix,
  getWorkloads,
  getInvocations,
  getMigrations,
  getInvocationDetail,
  getMigrationDetail,
  getIndex,
} = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) {
  appStore.setIndex(indexData.value.domains, indexData.value.clusters)
}

const [
  { data: clusters }, { data: topology }, { data: functions }, { data: matrix },
  { data: workloads }, { data: invocations }, { data: migrations },
] = await Promise.all([
  useAsyncData<MultiCluster[]>('mc-clusters', () => getClusters(), { default: () => [] }),
  useAsyncData<Topology | null>('mc-topology', () => getTopology(), { default: () => null }),
  useAsyncData<FunctionInfo[]>('mc-functions', () => getFunctions(), { default: () => [] }),
  useAsyncData<DeploymentMatrix | null>('mc-matrix', () => getDeploymentMatrix(), { default: () => null }),
  useAsyncData<Workload[]>('mc-workloads', () => getWorkloads(), { default: () => [] }),
  useAsyncData<Invocation[]>('mc-invocations', () => getInvocations(), { default: () => [] }),
  useAsyncData<Migration[]>('mc-migrations', () => getMigrations(), { default: () => [] }),
])

const route = useRoute()
const router = useRouter()
const validTabNames = new Set(['overview', 'functions', 'invocations', 'workloads'])
const initialTab = typeof route.query.view === 'string' && validTabNames.has(route.query.view)
  ? route.query.view
  : 'overview'
const activeTab = ref(initialTab)
const preferredMotion = usePreferredReducedMotion()
const surface = ref<HTMLElement>()
const inspector = ref<HTMLElement>()
const tabOrder = ['overview', 'functions', 'invocations', 'workloads']
let panelAnimation: Animation | undefined
let inspectorAnimation: Animation | undefined
let motionRevision = 0

// Preserve charts and table state. Only animate composited properties, never page height.
watch(activeTab, async (view, previous) => {
  const revision = ++motionRevision
  const content = surface.value?.querySelector<HTMLElement>('.el-tabs__content')
  panelAnimation?.cancel()
  await nextTick()
  if (revision !== motionRevision || preferredMotion.value === 'reduce' || !content) return
  const panel = content.querySelector<HTMLElement>(`#pane-${view}`)
  const direction = tabOrder.indexOf(view) >= tabOrder.indexOf(previous) ? 1 : -1
  panelAnimation = panel?.animate([
    { opacity: 0.65, transform: `translateX(${direction * 6}px)` },
    { opacity: 1, transform: 'translateX(0)' },
  ], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' })
})

onBeforeUnmount(() => {
  motionRevision++
  panelAnimation?.cancel()
  inspectorAnimation?.cancel()
})

watch(activeTab, (view) => {
  const query = { ...route.query }
  if (view === 'overview') delete query.view
  else query.view = view
  void router.replace({ query })
})

watch(
  () => route.query.view,
  (view) => {
    const nextView = typeof view === 'string' && validTabNames.has(view) ? view : 'overview'
    if (activeTab.value !== nextView) activeTab.value = nextView
  },
)

const clusterNameMap = computed(() => {
  const m = new Map<string, string>()
  for (const c of clusters.value ?? []) m.set(c.id, c.name)
  for (const c of appStore.clusters) if (!m.has(c.id)) m.set(c.id, c.name)
  return m
})
const nameOf = (id: string): string => clusterNameMap.value.get(id) ?? id

/* ============ 拓扑图（ECharts graph） ============ */
const selectedClusterId = ref<string | null>(null)
const selectedLinkKey = ref<string | null>(null)
const topologyResetToken = ref(0)
const topologyChart = ref<{ dispatchAction: (payload: Payload) => void } | null>(null)

const clusterList = computed<MultiCluster[]>(() => clusters.value ?? [])
const topologyLinks = computed<TopoLink[]>(() => topology.value?.links ?? [])
const onlineClusterCount = computed(() => clusterList.value.filter((c) => c.status === 'online').length)
const healthyLinkCount = computed(() => topologyLinks.value.filter((l) => l.status === 'online').length)
const activeJobCount = computed(() => clusterList.value.reduce((sum, c) => sum + Number(c.active_jobs || 0), 0))
const averageLatency = computed(() => {
  if (!topologyLinks.value.length) return 0
  return topologyLinks.value.reduce((sum, link) => sum + Number(link.latency_ms || 0), 0) / topologyLinks.value.length
})

const selectedCluster = computed<MultiCluster | null>(() => {
  const id = selectedClusterId.value
  return clusterList.value.find((cluster) => cluster.id === id) ?? clusterList.value[0] ?? null
})

const selectedLink = computed<TopoLink | null>(() => {
  const key = selectedLinkKey.value
  return topologyLinks.value.find((link) => linkKey(link.source, link.target) === key) ?? null
})

const selectedClusterLinks = computed(() => {
  const id = selectedCluster.value?.id
  if (!id || selectedLink.value) return []
  return topologyLinks.value.filter((link) => link.source === id || link.target === id)
})

const clusterActiveIndex = computed(() => clusterList.value.findIndex(c => c.id === selectedCluster.value?.id))
const { track: clusterTrack, ready: clusterHighlightReady, style: clusterHighlightStyle } = useSlidingHighlight(clusterActiveIndex)
watch([selectedCluster, selectedLink], () => {
  inspectorAnimation?.cancel()
  if (preferredMotion.value === 'reduce') return
  inspectorAnimation = inspector.value?.animate([
    { opacity: 0.7 },
    { opacity: 1 },
  ], { duration: 180, easing: 'ease-out' })
}, { flush: 'post' })

function linkKey(source: string, target: string): string {
  return [source, target].sort().join('::')
}

function statusText(status: string): string {
  const labels: Record<string, string> = {
    online: '在线',
    degraded: '降级',
    offline: '离线',
  }
  return labels[status] ?? status
}

function formatBandwidth(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} Gbps` : `${formatNumber(value)} Mbps`
}

function selectCluster(id: string): void {
  selectedClusterId.value = id
  selectedLinkKey.value = null
  syncTopologySelection(id)
}

function selectLink(link: TopoLink): void {
  selectedLinkKey.value = linkKey(link.source, link.target)
  clearTopologySelection()
  const dataIndex = topologyLinks.value.findIndex(item => linkKey(item.source, item.target) === selectedLinkKey.value)
  const endpoints = (topology.value?.nodes ?? []).flatMap((node, index) =>
    node.id === link.source || node.id === link.target ? [index] : [],
  )
  topologyChart.value?.dispatchAction({ type: 'select', seriesIndex: 0, dataType: 'node', dataIndex: endpoints })
  topologyChart.value?.dispatchAction({ type: 'highlight', seriesIndex: 0, dataType: 'edge', dataIndex })
}

function topologyNodeIndexes(): number[] {
  return (topology.value?.nodes ?? []).map((_, index) => index)
}

function clearTopologySelection(): void {
  const dataIndex = topologyNodeIndexes()
  if (!dataIndex.length) return
  topologyChart.value?.dispatchAction({ type: 'downplay', seriesIndex: 0, dataIndex })
  topologyChart.value?.dispatchAction({ type: 'unselect', seriesIndex: 0, dataIndex })
  const edgeIndexes = topologyLinks.value.map((_, index) => index)
  topologyChart.value?.dispatchAction({ type: 'downplay', seriesIndex: 0, dataType: 'edge', dataIndex: edgeIndexes })
  topologyChart.value?.dispatchAction({ type: 'unselect', seriesIndex: 0, dataType: 'edge', dataIndex: edgeIndexes })
}

function syncTopologySelection(id: string): void {
  const dataIndex = topology.value?.nodes.findIndex((node) => node.id === id) ?? -1
  if (dataIndex < 0) return
  clearTopologySelection()
  topologyChart.value?.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex })
  topologyChart.value?.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex })
}

function handleTopologyClick(params: unknown): void {
  if (!params || typeof params !== 'object') return
  const event = params as { dataType?: string; data?: Record<string, unknown> }
  if (event.dataType === 'node' && typeof event.data?.id === 'string') {
    selectCluster(event.data.id)
    return
  }
  if (
    event.dataType === 'edge'
    && typeof event.data?.source === 'string'
    && typeof event.data?.target === 'string'
  ) {
    const link = topologyLinks.value.find(
      (item) => linkKey(item.source, item.target) === linkKey(String(event.data?.source), String(event.data?.target)),
    )
    if (link) selectLink(link)
  }
}

function resetTopology(): void {
  topologyResetToken.value += 1
  void nextTick(() => {
    if (selectedLink.value) selectLink(selectedLink.value)
    else if (selectedCluster.value) syncTopologySelection(selectedCluster.value.id)
  })
}

const topoOption = computed<EChartsCoreOption | null>(() => {
  const t = topology.value
  if (!t) return null
  const borderColor: Record<string, string> = { online: '#65a87a', degraded: '#bd8435', offline: '#9aa6b5' }
  const fillColor: Record<string, string> = { online: '#f7fbf8', degraded: '#fcf8f1', offline: '#f6f7f9' }
  return {
    animation: preferredMotion.value !== 'reduce',
    animationDuration: 420,
    animationDurationUpdate: 320,
    tooltip: {
      trigger: 'item',
      triggerOn: 'none',
      confine: true,
      backgroundColor: 'rgba(35, 45, 61, 0.96)',
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: '#fff', fontSize: 13, lineHeight: 21 },
      extraCssText: 'border-radius:6px;box-shadow:0 8px 24px rgba(25,35,49,.18);',
      formatter: (params: { dataType?: string; data?: Record<string, unknown> }) => {
        const data = params.data ?? {}
        if (params.dataType === 'edge') {
          const source = String(data.source ?? '')
          const target = String(data.target ?? '')
          return `${nameOf(source)} ↔ ${nameOf(target)}<br/>时延 ${data.latency_ms ?? '-'} ms · 带宽 ${formatBandwidth(Number(data.bandwidth_mbps || 0))}`
        }
        return `${String(data.name ?? '')}<br/>${String(data.architecture ?? '')} · ${statusText(String(data.status ?? ''))}`
      },
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        selectedMode: 'multiple',
        cursor: 'grab',
        label: {
          show: true,
          position: 'bottom',
          distance: 10,
          formatter: (params: { data?: Record<string, unknown> }) => {
            const data = params.data ?? {}
            return `{name|${String(data.name ?? '')}}\n{meta|${String(data.location ?? '')} · ${statusText(String(data.status ?? ''))}}`
          },
          rich: {
            name: { color: '#2f3b50', fontSize: 13, fontWeight: 600, lineHeight: 22 },
            meta: { color: '#7b8799', fontSize: 10.5, lineHeight: 16 },
          },
        },
        edgeLabel: {
          show: true,
          formatter: (params: { data?: Record<string, unknown> }) => `${params.data?.latency_ms ?? '-'} ms`,
          color: '#657286',
          fontSize: 11.5,
          fontFamily: 'Cascadia Mono, Consolas, monospace',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderColor: '#e3e8ee',
          borderWidth: 1,
          borderRadius: 3,
          padding: [2, 4],
        },
        lineStyle: { color: '#aebaca', width: 1.5, opacity: 0.8 },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 2.5, opacity: 1, color: '#0b5bd3' },
        },
        blur: { itemStyle: { opacity: 1 }, label: { opacity: 0.45 }, lineStyle: { opacity: 0.12 } },
        data: t.nodes.map((n) => {
          const cluster = clusterList.value.find((item) => item.id === n.id)
          return {
            id: n.id,
            name: n.name,
            selected: n.id === t.nodes[0]?.id,
            status: n.status,
            location: cluster?.location ?? '',
            architecture: cluster?.architecture ?? '',
            symbol: 'circle',
            symbolSize: 68,
            itemStyle: {
              color: fillColor[n.status] ?? '#f6f7f9',
              borderColor: borderColor[n.status] ?? '#9aa6b5',
              borderWidth: 3,
              shadowBlur: 12,
              shadowColor: 'rgba(45, 66, 92, 0.12)',
              shadowOffsetY: 3,
            },
            select: {
              itemStyle: {
                color: '#f4f8fe',
                borderColor: '#0b5bd3',
                borderWidth: 3,
              },
            },
          }
        }),
        links: t.links.map((l) => ({
          source: l.source,
          target: l.target,
          status: l.status,
          latency_ms: l.latency_ms,
          bandwidth_mbps: l.bandwidth_mbps,
          packet_loss_percent: l.packet_loss_percent,
          select: { disabled: true },
          lineStyle: {
            color: l.status === 'degraded' ? '#c18a41' : '#a9b6c6',
            width: l.status === 'degraded' ? 2.2 : 1.5,
            type: l.status === 'degraded' ? 'dashed' : 'solid',
            opacity: l.status === 'degraded' ? 0.95 : 0.76,
            curveness: 0.06,
          },
        })),
        force: {
          repulsion: 1100,
          edgeLength: [220, 285],
          gravity: 0.04,
          friction: 0.68,
          layoutAnimation: preferredMotion.value !== 'reduce',
        },
      },
    ],
  }
})

/* ============ 部署矩阵 ============ */
const matrixClusters = computed(() => matrix.value?.clusters ?? [])
interface DeploymentCell {
  cluster_id: string
  cluster_name: string
  replicas: number
  status: string
  deployed: boolean
}

interface FunctionDeploymentRow {
  id: string
  name: string
  description: string
  version: string
  runtime: string
  image: string
  status: string
  deployments: DeploymentCell[]
}

const deploymentRows = computed<FunctionDeploymentRow[]>(() => {
  const details = functions.value ?? []
  const matrixFunctions = matrix.value?.functions ?? []
  const detailById = new Map(details.map((fn) => [fn.id, fn]))
  const matrixById = new Map(matrixFunctions.map((fn) => [fn.function_id, fn]))
  const functionIds = [...new Set([
    ...details.map((fn) => fn.id),
    ...matrixFunctions.map((fn) => fn.function_id),
  ])]

  return functionIds.map((id) => {
    const detail = detailById.get(id)
    const matrixFunction = matrixById.get(id)
    const deploymentByCluster = new Map(
      (matrixFunction?.deployments ?? []).map((deployment) => [deployment.cluster_id, deployment]),
    )

    return {
      id,
      name: detail?.name ?? matrixFunction?.function_name ?? id,
      description: detail?.description ?? '',
      version: detail?.version ?? '',
      runtime: detail?.runtime ?? '',
      image: detail?.image ?? '',
      status: detail?.status ?? '',
      deployments: matrixClusters.value.map((cluster) => {
        const deployment = deploymentByCluster.get(cluster.id)
        return {
          cluster_id: cluster.id,
          cluster_name: cluster.name,
          replicas: deployment?.replicas ?? 0,
          status: deployment?.status ?? 'undeployed',
          deployed: Boolean(deployment),
        }
      }),
    }
  })
})

const totalDeploymentReplicas = computed(() => deploymentRows.value.reduce(
  (total, row) => total + row.deployments.reduce((sum, deployment) => sum + deployment.replicas, 0),
  0,
))

function deploymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: '就绪',
    deploying: '部署中',
    offline: '离线',
    undeployed: '未部署',
  }
  return labels[status] ?? status
}

function deploymentStatusClass(status: string): string {
  if (['ready', 'deploying', 'offline'].includes(status)) return `is-${status}`
  return 'is-undeployed'
}

/* ============ 调用追踪 ============ */
const traceVisible = ref(false)
const traceLoading = ref(false)
const trace = ref<TraceDetail | null>(null)
const traceError = ref('')
async function openTrace(inv: Invocation): Promise<void> {
  traceVisible.value = true
  traceLoading.value = true
  traceError.value = ''
  trace.value = null
  try {
    trace.value = await getInvocationDetail(inv.invocation_id)
  } catch (e: unknown) {
    traceError.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    traceLoading.value = false
  }
}

function openTraceRow(row: unknown): void {
  if (row && typeof row === 'object' && 'invocation_id' in row) {
    void openTrace(row as Invocation)
  }
}

function invocationRowClassName({ row }: { row: { status?: string } }): string {
  return `invocation-row-status-${row.status || 'unknown'}`
}

const traceOption = computed(() => {
  const spans = trace.value?.spans ?? []
  if (!spans.length) return null
  return {
    animationDuration: 320,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(67, 91, 124, 0.05)' } },
      confine: true,
      backgroundColor: 'rgba(35, 45, 61, 0.96)',
      borderWidth: 0,
      padding: [9, 11],
      textStyle: { color: '#fff', fontSize: 12, lineHeight: 20 },
      valueFormatter: (value: number) => formatMs(value),
    },
    grid: { left: 118, right: 58, top: 18, bottom: 34 },
    xAxis: {
      type: 'value',
      name: 'ms',
      nameTextStyle: { color: '#8a95a5', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#7c8798', fontSize: 11 },
      splitLine: { lineStyle: { color: '#e8edf3' } },
    },
    yAxis: {
      type: 'category',
      data: spans.map((span) => `#${span.seq} ${span.name}`).reverse(),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#59667a', fontSize: 11.5, width: 104, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: [...spans].reverse().map((span) => ({
          value: span.latency_ms,
          itemStyle: {
            color: span.status === 'failed' ? '#c96767' : span.status === 'running' ? '#5d83b7' : '#5d9a72',
            borderRadius: [0, 3, 3, 0],
          },
        })),
        barWidth: 12,
        showBackground: true,
        backgroundStyle: { color: '#f1f4f7', borderRadius: 3 },
        label: {
          show: true,
          position: 'right',
          color: '#687589',
          fontSize: 10.5,
          formatter: ({ value }: { value: number }) => formatMs(value),
        },
      },
    ],
  }
})

const traceChartHeight = computed(() => {
  const stageCount = trace.value?.spans.length ?? 0
  return `${Math.max(300, stageCount * 54 + 54)}px`
})

/* ============ 工作负载与迁移 ============ */
const workloadList = computed<Workload[]>(() => workloads.value ?? [])
const migrationList = computed<Migration[]>(() => migrations.value ?? [])
const desiredReplicaCount = computed(() => workloadList.value.reduce(
  (total, workload) => total + workload.instances.reduce((sum, instance) => sum + instance.desired_replicas, 0),
  0,
))
const readyReplicaCount = computed(() => workloadList.value.reduce(
  (total, workload) => total + workload.instances.reduce((sum, instance) => sum + instance.ready_replicas, 0),
  0,
))
const activeMigrationCount = computed(() => migrationList.value.filter(
  (migration) => ['migrating', 'running', 'pending', 'queued'].includes(migration.status),
).length)

function workloadCenterState(ready: number, desired: number): string {
  if (desired === 0) return 'is-idle'
  if (ready >= desired) return 'is-ready'
  return 'is-partial'
}

function migrationRowClassName({ row }: { row: Migration }): string {
  return `migration-row-status-${row.status || 'unknown'}`
}

function migrationProgressValue(progress?: number): number {
  return Math.min(100, Math.max(0, Number(progress ?? 0)))
}

function formatMigrationDataSize(sizeInMb?: number): string {
  if (sizeInMb == null) return '-'
  return formatBytes(sizeInMb * 1024 * 1024)
}

function migrationEventClass(status: string): string {
  if (status === 'failed') return 'is-failed'
  if (status === 'success') return 'is-success'
  return 'is-running'
}

/* ============ 迁移详情 ============ */
const migVisible = ref(false)
const migLoading = ref(false)
const migDetail = ref<MigrationDetail | null>(null)
const migError = ref('')
async function openMig(id: string): Promise<void> {
  migVisible.value = true
  migLoading.value = true
  migDetail.value = null
  migError.value = ''
  try {
    migDetail.value = await getMigrationDetail(id)
  } catch (error) {
    migError.value = error instanceof Error ? error.message : '迁移详情加载失败'
  } finally {
    migLoading.value = false
  }
}
</script>

<template>
  <section ref="surface" class="multicenter-surface">
    <header class="multicenter-surface-header">
      <div class="multicenter-heading-row">
        <NuxtLink to="/" class="multicenter-home-link" aria-label="返回主页">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5v-9.7Z" />
          </svg>
          <span>主页</span>
        </NuxtLink>
        <span class="multicenter-heading-divider" aria-hidden="true" />
        <div>
          <h1>函数多中心联调</h1>
        </div>
      </div>
    </header>

    <el-tabs v-model="activeTab" class="multicenter-tabs">
      <!-- ================= 总览 ================= -->
      <el-tab-pane label="总览" name="overview">
        <div class="multicenter-overview">
          <dl class="multicenter-summary" aria-label="多中心运行摘要">
            <div>
              <dt>在线中心</dt>
              <dd>{{ onlineClusterCount }}<span>/ {{ clusterList.length }}</span></dd>
            </div>
            <div>
              <dt>健康链路</dt>
              <dd>{{ healthyLinkCount }}<span>/ {{ topologyLinks.length }}</span></dd>
            </div>
            <div>
              <dt>平均时延</dt>
              <dd>{{ averageLatency.toFixed(1) }}<span>ms</span></dd>
            </div>
            <div>
              <dt>活跃任务</dt>
              <dd>{{ formatNumber(activeJobCount) }}<span>项</span></dd>
            </div>
          </dl>

          <section class="topology-panel" aria-labelledby="topology-title">
            <header class="topology-panel-header">
              <div>
                <div class="topology-title-row">
                  <h2 id="topology-title">中心网络拓扑</h2>
                </div>
              </div>
              <div class="topology-actions">
                <span class="topology-legend is-online"><i aria-hidden="true" />在线链路</span>
                <span class="topology-legend is-degraded"><i aria-hidden="true" />降级链路</span>
                <button type="button" class="topology-reset-button" aria-label="重置拓扑布局" @click="resetTopology">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6" />
                  </svg>
                  重置布局
                </button>
              </div>
            </header>

            <div class="topology-workspace">
              <aside ref="clusterTrack" class="topology-cluster-rail" :class="{ 'has-sliding-highlight': clusterHighlightReady }" aria-label="计算中心列表">
                <div class="cluster-rail-heading">
                  <span>计算中心</span>
                  <strong>{{ clusterList.length }}</strong>
                </div>
                <span class="scnet-sliding-highlight" :class="{ 'is-ready': clusterHighlightReady }" :style="[clusterHighlightStyle, { opacity: selectedLink ? 0 : 1 }]" aria-hidden="true" />
                <button
                  v-for="c in clusterList"
                  :key="c.id"
                  type="button"
                  class="cluster-rail-button"
                  data-highlight-item
                  :class="[
                    `is-${c.status}`,
                    { 'is-active': !selectedLink && selectedCluster?.id === c.id },
                  ]"
                  :aria-pressed="!selectedLink && selectedCluster?.id === c.id"
                  @click="selectCluster(c.id)"
                >
                  <span class="cluster-status-dot" aria-hidden="true" />
                  <span class="cluster-rail-copy">
                    <strong>{{ c.name }}</strong>
                    <small>{{ c.location }} · CPU {{ c.cpu_utilization }}%</small>
                  </span>
                  <span class="cluster-rail-queue">{{ c.active_jobs }}</span>
                </button>
              </aside>

              <div class="topology-stage">
                <div class="topology-canvas">
                  <BaseChart
                    v-if="topoOption"
                    :key="topologyResetToken"
                    ref="topologyChart"
                    :option="topoOption"
                    height="100%"
                    aria-label="四个计算中心及中心间链路的可拖拽网络拓扑图"
                    @chart-click="handleTopologyClick"
                  />
                  <el-empty v-else description="暂无拓扑数据" />
                </div>
                <div v-if="selectedLink" class="topology-link-selection" role="status">
                  <strong>{{ nameOf(selectedLink.source) }} ↔ {{ nameOf(selectedLink.target) }}</strong>
                  <span>时延 {{ selectedLink.latency_ms }} ms · 带宽 {{ formatBandwidth(selectedLink.bandwidth_mbps) }}</span>
                </div>
              </div>

              <aside class="topology-inspector" aria-live="polite">
                <div ref="inspector" class="topology-inspector-body">
                <template v-if="selectedLink">
                  <div class="inspector-heading">
                    <p>链路详情</p>
                    <span :class="`is-${selectedLink.status}`">{{ statusText(selectedLink.status) }}</span>
                  </div>
                  <h3>{{ nameOf(selectedLink.source) }}</h3>
                  <div class="inspector-route" aria-hidden="true">
                    <i />
                    <span />
                    <i />
                  </div>
                  <h3>{{ nameOf(selectedLink.target) }}</h3>
                  <dl class="inspector-metrics">
                    <div><dt>网络时延</dt><dd>{{ selectedLink.latency_ms }}<span>ms</span></dd></div>
                    <div><dt>可用带宽</dt><dd>{{ formatBandwidth(selectedLink.bandwidth_mbps) }}</dd></div>
                    <div><dt>丢包率</dt><dd>{{ selectedLink.packet_loss_percent ?? 0 }}<span>%</span></dd></div>
                  </dl>
                </template>
                <template v-else-if="selectedCluster">
                  <div class="inspector-heading">
                    <p>中心详情</p>
                    <span :class="`is-${selectedCluster.status}`">{{ statusText(selectedCluster.status) }}</span>
                  </div>
                  <h3>{{ selectedCluster.name }}</h3>
                  <p class="inspector-description">
                    {{ selectedCluster.architecture }} · {{ selectedCluster.scheduler }}
                  </p>
                  <div class="inspector-utilization">
                    <div>
                      <span>CPU 利用率</span><strong>{{ selectedCluster.cpu_utilization }}%</strong>
                      <i><b :style="{ width: `${selectedCluster.cpu_utilization}%` }" /></i>
                    </div>
                    <div>
                      <span>内存利用率</span><strong>{{ selectedCluster.memory_utilization }}%</strong>
                      <i><b :style="{ width: `${selectedCluster.memory_utilization}%` }" /></i>
                    </div>
                  </div>
                  <dl class="inspector-facts">
                    <div><dt>计算节点</dt><dd>{{ formatNumber(selectedCluster.total_nodes) }}</dd></div>
                    <div><dt>处理器核</dt><dd>{{ formatNumber(selectedCluster.total_cores) }}</dd></div>
                    <div><dt>加速卡</dt><dd>{{ formatNumber(selectedCluster.gpu_count) }}</dd></div>
                    <div><dt>排队任务</dt><dd>{{ formatNumber(selectedCluster.queue_length) }}</dd></div>
                  </dl>
                  <div class="inspector-links">
                    <p>相连链路</p>
                    <button
                      v-for="link in selectedClusterLinks"
                      :key="linkKey(link.source, link.target)"
                      type="button"
                      @click="selectLink(link)"
                    >
                      <span>{{ nameOf(link.source === selectedCluster.id ? link.target : link.source) }}</span>
                      <strong>{{ link.latency_ms }} ms</strong>
                    </button>
                  </div>
                </template>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <!-- ================= 函数与部署矩阵 ================= -->
      <el-tab-pane label="函数部署" name="functions">
        <section class="function-deployment-section" aria-labelledby="function-deployment-title">
          <header class="deployment-section-header">
            <div>
              <h2 id="function-deployment-title">函数部署</h2>
            </div>
            <p class="deployment-summary" aria-label="函数部署汇总">
              <strong>{{ deploymentRows.length }}</strong> 个函数
              <span aria-hidden="true">·</span>
              <strong>{{ matrixClusters.length }}</strong> 个中心
              <span aria-hidden="true">·</span>
              <strong>{{ totalDeploymentReplicas }}</strong> 个实例
            </p>
          </header>

          <div v-if="deploymentRows.length" class="function-deployment-board">
            <div class="deployment-board-header" aria-hidden="true">
              <span>函数信息</span>
              <div class="deployment-centers">
                <span v-for="cluster in matrixClusters" :key="cluster.id">{{ cluster.name }}</span>
              </div>
            </div>

            <article v-for="row in deploymentRows" :key="row.id" class="deployment-row">
              <div class="deployment-function-info">
                <div class="deployment-function-heading">
                  <div>
                    <h3>{{ row.name }}</h3>
                    <p class="deployment-function-id" translate="no">
                      {{ row.id }}<template v-if="row.version"> · v{{ row.version }}</template>
                    </p>
                  </div>
                  <span
                    v-if="row.status && row.status !== 'ready'"
                    class="deployment-status"
                    :class="deploymentStatusClass(row.status)"
                  >
                    {{ deploymentStatusLabel(row.status) }}
                  </span>
                </div>

                <p v-if="row.description" class="deployment-description">{{ row.description }}</p>

                <div v-if="row.runtime" class="deployment-metadata">
                  <span v-if="row.runtime" translate="no">{{ row.runtime }}</span>
                </div>

                <div v-if="row.image" class="deployment-image">
                  <span>镜像</span>
                  <code :title="row.image" translate="no">{{ row.image }}</code>
                </div>
              </div>

              <div class="deployment-centers" role="list" :aria-label="`${row.name}的中心部署状态`">
                <div
                  v-for="deployment in row.deployments"
                  :key="deployment.cluster_id"
                  class="deployment-cell"
                  :class="deploymentStatusClass(deployment.status)"
                  role="listitem"
                  :aria-label="`${deployment.cluster_name}：${deployment.deployed ? `${deployment.replicas} 个实例，${deploymentStatusLabel(deployment.status)}` : '未部署'}`"
                >
                  <span class="deployment-cluster-name">{{ deployment.cluster_name }}</span>
                  <div v-if="deployment.deployed" class="deployment-replicas">
                    <strong>{{ deployment.replicas }}</strong>
                    <span>实例</span>
                  </div>
                  <div v-else class="deployment-replicas is-empty" aria-hidden="true">—</div>
                  <span
                    v-if="deployment.status !== 'ready'"
                    class="deployment-status"
                    :class="deploymentStatusClass(deployment.status)"
                  >
                    {{ deploymentStatusLabel(deployment.status) }}
                  </span>
                </div>
              </div>
            </article>
          </div>

          <p v-else class="deployment-empty">暂无函数部署数据</p>
        </section>
      </el-tab-pane>

      <!-- ================= 调用追踪 ================= -->
      <el-tab-pane label="调用追踪" name="invocations">
        <section class="invocation-table-region" aria-label="调用追踪列表">
          <el-table
            :data="invocations ?? []"
            :row-class-name="invocationRowClassName"
            stripe
            size="default"
            empty-text="暂无调用追踪记录"
          >
            <el-table-column prop="invocation_id" label="调用 ID" min-width="170" class-name="mono" />
            <el-table-column prop="function_name" label="函数" min-width="150" />
            <el-table-column label="执行中心" min-width="150">
              <template #default="{ row }">{{ nameOf(row.cluster_id) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><StatusBadge :status="row.status" /></template>
            </el-table-column>
            <el-table-column label="总耗时" width="110">
              <template #default="{ row }">{{ formatMs(row.total_latency_ms) }}</template>
            </el-table-column>
            <el-table-column label="开始时间" min-width="150">
              <template #default="{ row }">{{ formatTimestamp(row.start_time) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button class="invocation-trace-button" size="small" type="primary" link @click="openTraceRow(row)">链路追踪</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <!-- ================= 工作负载与迁移 ================= -->
      <el-tab-pane label="负载迁移" name="workloads">
        <div class="workload-migration-section">
          <section class="workload-section" aria-labelledby="workload-section-title">
            <header class="workload-section-heading">
              <div>
                <h2 id="workload-section-title">工作负载</h2>
              </div>
              <p class="workload-readiness">
                就绪实例
                <strong>{{ readyReplicaCount }}</strong>
                <span>/ {{ desiredReplicaCount }}</span>
              </p>
            </header>

            <div v-if="workloadList.length" class="workload-board">
              <article v-for="workload in workloadList" :key="workload.workload_id" class="workload-row">
                <div class="workload-identity">
                  <div class="workload-title-row">
                    <h3>{{ workload.name }}</h3>
                    <StatusBadge :status="workload.status" />
                  </div>
                  <p class="mono" translate="no">{{ workload.workload_id }}</p>
                  <span>{{ workload.instances.filter(instance => instance.desired_replicas > 0).length }} 个中心承载</span>
                </div>

                <div class="workload-center-grid">
                  <div
                    v-for="instance in workload.instances"
                    :key="instance.cluster_id"
                    class="workload-center-cell"
                    :class="workloadCenterState(instance.ready_replicas, instance.desired_replicas)"
                  >
                    <div class="workload-center-heading">
                      <span>{{ nameOf(instance.cluster_id) }}</span>
                      <i aria-hidden="true" />
                    </div>
                    <p class="workload-replica-count">
                      <strong>{{ instance.ready_replicas }}</strong>
                      <span>/ {{ instance.desired_replicas }} 实例</span>
                    </p>
                    <div v-if="instance.desired_replicas > 0" class="workload-resource-pair">
                      <span>CPU {{ instance.cpu_utilization }}%</span>
                      <span>内存 {{ instance.memory_utilization }}%</span>
                    </div>
                    <p v-else class="workload-idle-label">未部署</p>
                  </div>
                </div>
              </article>
            </div>
            <el-empty v-else description="暂无工作负载" />
          </section>

          <section class="migration-section" aria-labelledby="migration-section-title">
            <header class="workload-section-heading">
              <div>
                <h2 id="migration-section-title">迁移记录</h2>
              </div>
              <p class="migration-active-count">
                当前处理中
                <strong>{{ activeMigrationCount }}</strong>
              </p>
            </header>

            <div class="migration-table-region" role="region" aria-label="迁移记录列表">
              <el-table
                :data="migrationList"
                :row-class-name="migrationRowClassName"
                row-key="migration_id"
              >
                <el-table-column prop="migration_id" label="迁移 ID" min-width="190" class-name="mono" />
                <el-table-column prop="workload_id" label="工作负载" min-width="155" class-name="mono" />
                <el-table-column label="迁移路径" min-width="270">
                  <template #default="{ row }">
                    <div class="migration-route-cell">
                      <span>{{ nameOf(row.from_cluster) }}</span>
                      <svg viewBox="0 0 36 12" aria-hidden="true">
                        <path d="M1 6h31m-5-4 5 4-5 4" />
                      </svg>
                      <strong>{{ nameOf(row.to_cluster) }}</strong>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="105">
                  <template #default="{ row }"><StatusBadge :status="row.status" /></template>
                </el-table-column>
                <el-table-column label="进度" min-width="150">
                  <template #default="{ row }">
                    <div class="migration-progress-cell" :class="`is-${row.status}`">
                      <span class="migration-progress-track">
                        <i :style="{ width: `${migrationProgressValue(row.progress)}%` }" />
                      </span>
                      <strong>{{ migrationProgressValue(row.progress) }}%</strong>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="开始时间" min-width="155">
                  <template #default="{ row }">{{ row.start_time ? formatTimestamp(row.start_time) : '尚未开始' }}</template>
                </el-table-column>
                <el-table-column label="操作" width="105" fixed="right">
                  <template #default="{ row }">
                    <el-button class="migration-detail-button" size="small" type="primary" link @click="openMig(row.migration_id)">
                      查看详情
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </section>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 调用链路弹窗 -->
    <el-dialog
      v-model="traceVisible"
      class="trace-detail-dialog"
      transition="mc-dialog"
      title="调用链路追踪"
      width="min(960px, calc(100vw - 40px))"
      align-center
      append-to-body
      destroy-on-close
    >
      <div v-loading="traceLoading" class="trace-detail-shell">
        <template v-if="trace">
          <dl class="trace-summary" aria-label="调用摘要">
            <div>
              <dt>调用 ID</dt>
              <dd class="mono" translate="no">{{ trace.invocation_id }}</dd>
            </div>
            <div>
              <dt>Trace ID</dt>
              <dd class="mono" translate="no">{{ trace.trace_id }}</dd>
            </div>
            <div class="trace-summary-latency">
              <dt>总耗时</dt>
              <dd>{{ formatMs(trace.total_latency_ms) }}</dd>
            </div>
          </dl>

          <div class="trace-detail-grid">
            <section class="trace-chart-panel" aria-labelledby="trace-chart-title">
              <header class="trace-panel-heading">
                <div>
                  <h3 id="trace-chart-title">阶段耗时</h3>
                </div>
                <span>{{ trace.spans.length }} 个阶段</span>
              </header>
              <div class="trace-chart-canvas">
                <BaseChart
                  v-if="traceOption"
                  :option="traceOption"
                  :height="traceChartHeight"
                  aria-label="调用链路各阶段耗时对比"
                />
                <el-empty v-else class="trace-panel-empty" description="暂无阶段数据" />
              </div>
            </section>

            <section class="trace-stage-panel" aria-labelledby="trace-stage-title">
              <header class="trace-panel-heading">
                <div>
                  <h3 id="trace-stage-title">执行阶段</h3>
                </div>
              </header>
              <ol class="trace-stage-list">
                <li
                  v-for="span in trace.spans"
                  :key="span.seq"
                  class="trace-stage-item"
                  :class="`is-${span.status}`"
                >
                  <span class="trace-stage-index" aria-hidden="true">{{ span.seq }}</span>
                  <div class="trace-stage-copy">
                    <div class="trace-stage-title-row">
                      <strong>{{ span.name }}</strong>
                      <StatusBadge :status="span.status" />
                    </div>
                    <p class="trace-stage-meta">
                      <span class="mono" translate="no">{{ span.component }}</span>
                      <span>{{ nameOf(span.cluster_id ?? '') }}</span>
                    </p>
                  </div>
                  <strong class="trace-stage-latency">{{ formatMs(span.latency_ms) }}</strong>
                </li>
              </ol>
            </section>
          </div>
        </template>
        <el-empty v-else-if="traceError" class="trace-empty" :description="traceError" />
      </div>
    </el-dialog>

    <!-- 迁移事件弹窗 -->
    <el-dialog
      v-model="migVisible"
      class="migration-detail-dialog"
      transition="mc-dialog"
      title="迁移事件详情"
      width="min(920px, calc(100vw - 40px))"
      align-center
      append-to-body
      destroy-on-close
    >
      <div v-loading="migLoading" class="migration-detail-shell">
        <template v-if="migDetail">
          <header class="migration-detail-summary">
            <div>
              <span>迁移任务</span>
              <strong class="mono" translate="no">{{ migDetail.migration_id }}</strong>
            </div>
            <div>
              <span>工作负载</span>
              <strong class="mono" translate="no">{{ migDetail.workload_id }}</strong>
            </div>
            <div class="migration-summary-status">
              <span>当前状态</span>
              <StatusBadge :status="migDetail.status" />
            </div>
            <div class="migration-summary-progress">
              <span>迁移进度</span>
              <strong>{{ migrationProgressValue(migDetail.progress) }}%</strong>
            </div>
          </header>

          <div class="migration-detail-grid">
            <section class="migration-route-overview" aria-labelledby="migration-route-title">
              <header class="migration-detail-section-heading">
                <div>
                  <h3 id="migration-route-title">迁移概览</h3>
                </div>
              </header>

              <div class="migration-route-card">
                <div class="migration-route-endpoint">
                  <span>源中心</span>
                  <strong>{{ nameOf(migDetail.from_cluster) }}</strong>
                </div>
                <div class="migration-route-divider" aria-hidden="true" />
                <div class="migration-route-endpoint">
                  <span>目标中心</span>
                  <strong>{{ nameOf(migDetail.to_cluster) }}</strong>
                </div>
              </div>

              <dl class="migration-facts">
                <div>
                  <dt>迁移副本</dt>
                  <dd>{{ migDetail.transferred_replicas ?? '-' }}</dd>
                </div>
                <div>
                  <dt>数据量</dt>
                  <dd>{{ formatMigrationDataSize(migDetail.total_size_mb) }}</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{{ migDetail.start_time ? formatTimestamp(migDetail.start_time, true) : '尚未开始' }}</dd>
                </div>
                <div>
                  <dt>结束时间</dt>
                  <dd>{{ migDetail.end_time ? formatTimestamp(migDetail.end_time, true) : '进行中' }}</dd>
                </div>
              </dl>

              <div class="migration-reason-block">
                <h4>迁移原因</h4>
                <p>{{ migDetail.reason || '暂无迁移原因说明' }}</p>
              </div>
            </section>

            <section class="migration-event-panel" aria-labelledby="migration-event-title">
              <header class="migration-detail-section-heading">
                <div>
                  <h3 id="migration-event-title">执行进度</h3>
                </div>
                <span>{{ migDetail.events?.length ?? 0 }} 个阶段</span>
              </header>

              <ol v-if="migDetail.events?.length" class="migration-event-list">
                <li
                  v-for="ev in migDetail.events"
                  :key="ev.seq ?? ev.name"
                  class="migration-event-item"
                  :class="migrationEventClass(ev.status)"
                >
                  <span class="migration-event-marker" aria-hidden="true">{{ ev.seq }}</span>
                  <div>
                    <time>{{ formatTimestamp(ev.timestamp, true) }}</time>
                    <strong>{{ ev.name ?? ev.event }}</strong>
                    <p>{{ ev.detail ?? ev.message ?? '暂无阶段说明' }}</p>
                  </div>
                </li>
              </ol>
              <el-empty v-else class="migration-event-empty" description="暂无迁移事件" />
            </section>
          </div>
        </template>
        <el-empty v-else-if="migError" :description="migError" />
      </div>
    </el-dialog>
  </section>
</template>

<style scoped>
.multicenter-surface {
  min-height: calc(100vh - 28px);
  overflow: hidden;
  border: 1px solid var(--scnet-divider);
  border-radius: 8px;
  background: #f5f7fa;
}

.multicenter-surface-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 28px;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}

.multicenter-heading-row,
.multicenter-home-link,
.topology-title-row,
.topology-actions,
.topology-legend,
.topology-reset-button,
.cluster-rail-heading,
.cluster-rail-button,
.inspector-heading {
  display: flex;
  align-items: center;
}

.multicenter-heading-row { gap: 20px; min-width: 0; }
.multicenter-heading-row > div { min-width: 0; }

.multicenter-home-link {
  flex: 0 0 auto;
  gap: 7px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 5px;
  color: #586579;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 180ms cubic-bezier(0.22, 1, 0.36, 1), color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.multicenter-home-link svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.multicenter-home-link:hover { background: var(--scnet-primary-soft); color: var(--scnet-primary); }
.multicenter-heading-divider { width: 1px; height: 38px; background: var(--scnet-divider); }

.multicenter-heading-row h1 {
  margin: 0;
  color: #253044;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.35;
  text-wrap: balance;
}

.topology-legend i,
.cluster-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3f9a63;
}

.multicenter-tabs { --mc-tab-padding: 22px; background: #f5f7fa; }
.multicenter-tabs :deep(.el-tabs__header) { margin: 0; padding: 0 28px; background: #fff; }
.multicenter-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background: var(--scnet-divider); }
.multicenter-tabs :deep(.el-tabs__item) {
  height: 46px;
  padding: 0 var(--mc-tab-padding);
  color: #657287;
  font-size: 13px;
  font-weight: 500;
}
/* Override Element Plus's first/last tab padding reset for a balanced hover surface. */
.multicenter-tabs.el-tabs--top :deep(.el-tabs__header .el-tabs__item) { padding-inline: var(--mc-tab-padding); }
.multicenter-tabs :deep(.el-tabs__item.is-active) { color: var(--scnet-primary); font-weight: 600; }
.multicenter-tabs :deep(.el-tabs__active-bar) { height: 2px; }
.multicenter-tabs :deep(.el-tabs__content) { overflow: visible; padding: 22px; }
.multicenter-tabs :deep(.el-tabs__item) { border-radius: 6px 6px 0 0; transition: color 200ms ease, background-color 200ms ease; }
.multicenter-tabs :deep(.el-tabs__item:hover) { color: var(--scnet-primary); background: #f2f7ff; }
.multicenter-tabs :deep(.el-tabs__item:focus-visible) { outline: 2px solid #8db4eb; outline-offset: -3px; }
.topology-cluster-rail.has-sliding-highlight .cluster-rail-button.is-active { background: transparent; border-color: transparent; }
.topology-cluster-rail.has-sliding-highlight .cluster-rail-button.is-active::before { display: none; }
.topology-cluster-rail .scnet-sliding-highlight { border-left: 3px solid var(--scnet-primary); }
.topology-cluster-rail .cluster-rail-button:hover { background: rgb(11 91 211 / 5%); }

@media (prefers-reduced-motion: no-preference) {
  .multicenter-surface-header { animation: scnet-reveal 320ms var(--scnet-hover-easing) backwards; }
  .multicenter-tabs :deep(.el-tabs__active-bar) { transition: transform 300ms var(--scnet-hover-easing), width 300ms var(--scnet-hover-easing); }
  .inspector-utilization b { transition: width 360ms var(--scnet-hover-easing); }
  .inspector-links button { transition: background-color 200ms ease, padding 200ms var(--scnet-hover-easing); }
  .inspector-links button:hover { padding-inline: 7px; background: #f2f7ff; }
  .topology-reset-button svg { transition: transform 320ms var(--scnet-hover-easing); }
  .topology-reset-button:hover svg { transform: rotate(-35deg); }
  .topology-reset-button:active, .cluster-rail-button:active { transform: translateY(1px); }
}

.invocation-table-region {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid #e1e6ec;
  border-radius: 7px;
  background: #fff;
  overscroll-behavior-inline: contain;
}

.invocation-table-region :deep(.el-table) {
  min-width: 980px;
  color: var(--scnet-text-secondary);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.invocation-table-region :deep(.el-table::before) { display: none; }

.invocation-table-region :deep(.el-table th.el-table__cell) {
  height: 48px;
  padding: 0;
  background: #f7f9fc;
  color: var(--scnet-text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.invocation-table-region :deep(.el-table td.el-table__cell) {
  height: 56px;
  padding: 0;
  border-bottom-color: var(--scnet-divider);
  transition: background-color var(--scnet-hover-duration) var(--scnet-hover-easing);
}

.invocation-table-region :deep(.el-table .cell) {
  padding: 0 16px;
  line-height: 1.45;
}

.invocation-table-region :deep(.el-table__row:hover > td.el-table__cell) { background: var(--scnet-hover-bg); }
.invocation-table-region :deep(.el-table__body tr.invocation-row-status-running:hover > td.el-table__cell) { background: var(--scnet-hover-bg); }
.invocation-table-region :deep(.el-table__body tr.invocation-row-status-success:hover > td.el-table__cell) { background: var(--scnet-hover-success-bg); }
.invocation-table-region :deep(.el-table__body tr.invocation-row-status-failed:hover > td.el-table__cell) { background: var(--scnet-hover-danger-bg); }
.invocation-table-region :deep(.el-table__body tr.invocation-row-status-queued:hover > td.el-table__cell),
.invocation-table-region :deep(.el-table__body tr.invocation-row-status-pending:hover > td.el-table__cell) { background: var(--scnet-hover-warning-bg); }
.invocation-table-region :deep(.el-table__body tr.invocation-row-status-stopped:hover > td.el-table__cell) { background: var(--scnet-hover-neutral-bg); }

.invocation-table-region :deep(td.mono.el-table__cell) {
  color: var(--scnet-text-secondary);
  font-family: var(--scnet-font-mono);
  font-size: 13px;
}

.invocation-trace-button { min-height: 36px; font-weight: 600; }

:global(.trace-detail-dialog) {
  height: min(680px, calc(100vh - 40px));
  max-height: min(680px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
}

:global(.trace-detail-dialog .el-dialog__header) {
  flex: 0 0 auto;
  margin: 0;
  padding: 18px 22px;
  border-bottom: 1px solid var(--scnet-divider);
}

:global(.trace-detail-dialog .el-dialog__title) {
  color: #273449;
  font-size: 19px;
  font-weight: 650;
}

:global(.trace-detail-dialog .el-dialog__headerbtn) {
  top: 12px;
  right: 14px;
  width: 42px;
  height: 42px;
}

:global(.trace-detail-dialog .el-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow: hidden;
  padding: 0;
  color: var(--scnet-text-secondary);
}

.trace-detail-shell {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f6f8fb;
}

.trace-summary {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) 160px;
  margin: 0;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}

.trace-summary > div {
  min-width: 0;
  padding: 16px 20px;
}

.trace-summary > div + div { border-left: 1px solid var(--scnet-divider); }
.trace-summary dt { color: #7f8b9d; font-size: 13px; font-weight: 600; }
.trace-summary dd {
  margin: 5px 0 0;
  overflow: hidden;
  color: #3b485c;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-summary-latency dd {
  color: var(--scnet-primary);
  font-family: var(--scnet-font-mono);
  font-size: 24px;
  line-height: 1.1;
}

.trace-detail-grid {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  margin: 16px;
  overflow: hidden;
  border: 1px solid #dfe5ec;
  border-radius: 7px;
  background: #fff;
}

.trace-chart-panel,
.trace-stage-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.trace-chart-panel { border-right: 1px solid var(--scnet-divider); }

.trace-panel-heading {
  min-height: 62px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px 11px;
  border-bottom: 1px solid var(--scnet-divider);
}

.trace-panel-heading h3 { margin: 0; color: #344156; font-size: 16px; font-weight: 650; }
.trace-panel-heading > span {
  flex: 0 0 auto;
  color: #788598;
  font-family: var(--scnet-font-mono);
  font-size: 13px;
}

.trace-chart-canvas,
.trace-stage-list {
  min-height: 0;
  flex: 1;
  overscroll-behavior: contain;
  scrollbar-color: #cbd3dd transparent;
  scrollbar-width: thin;
}

.trace-chart-canvas {
  overflow-y: auto;
  padding: 8px 8px 2px 0;
}
.trace-chart-canvas :deep(.base-chart) { min-height: 100%; }

.trace-stage-list {
  margin: 0;
  overflow-y: auto;
  padding: 4px 10px 8px;
  list-style: none;
}

.trace-stage-item {
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 70px;
  padding: 10px 8px;
  border-bottom: 1px solid #edf0f4;
}

.trace-stage-item:last-child { border-bottom: 0; }

.trace-stage-index {
  width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9e0e8;
  border-radius: 50%;
  background: #f8fafc;
  color: #6f7d90;
  font-family: var(--scnet-font-mono);
  font-size: 11px;
}

.trace-stage-item.is-running .trace-stage-index { border-color: #c8d7ea; background: #f2f6fc; color: #527caf; }
.trace-stage-item.is-success .trace-stage-index { border-color: #cfe2d5; background: #f2f8f4; color: #538868; }
.trace-stage-item.is-failed .trace-stage-index { border-color: #ead0d0; background: #fdf3f3; color: #ad5d5d; }

.trace-stage-copy { min-width: 0; }
.trace-stage-title-row { min-width: 0; display: flex; align-items: center; gap: 7px; }
.trace-stage-title-row > strong {
  min-width: 0;
  color: #3b485c;
  font-size: 13.5px;
  font-weight: 620;
  overflow-wrap: anywhere;
}

.trace-stage-title-row :deep(.status-badge) { flex: 0 0 auto; }
.trace-stage-meta {
  min-width: 0;
  display: grid;
  gap: 2px;
  margin: 6px 0 0;
  color: #8a95a5;
  font-size: 11.5px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.trace-stage-latency {
  color: #536176;
  font-family: var(--scnet-font-mono);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.trace-panel-empty,
.trace-empty { flex: 1; }

.workload-migration-section {
  min-width: 0;
  display: grid;
  gap: 30px;
}

.workload-section,
.migration-section {
  min-width: 0;
  display: grid;
  gap: 14px;
}

.workload-section-heading {
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 1px 2px 0;
}

.workload-section-heading h2 {
  margin: 0;
  color: #27354a;
  font-size: 20px;
  font-weight: 650;
  line-height: 1.4;
}

.workload-readiness,
.migration-active-count {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 0;
  color: #788597;
  font-size: 12px;
  white-space: nowrap;
}

.workload-readiness strong,
.migration-active-count strong {
  color: #3a485d;
  font-family: var(--scnet-font-mono);
  font-size: 16px;
  font-weight: 650;
}

.workload-readiness span { color: #97a1af; font-family: var(--scnet-font-mono); }

.workload-board {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e0e5eb;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 5px 16px rgb(35 52 75 / 3.5%);
}

.workload-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(245px, 0.62fr) minmax(0, 1.38fr);
}

.workload-row + .workload-row { border-top: 1px solid #e5e9ee; }

.workload-identity {
  min-width: 0;
  padding: 20px 22px;
  border-right: 1px solid #e5e9ee;
  background: #fcfdfe;
}

.workload-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.workload-title-row h3 {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  color: #2f3d53;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workload-title-row :deep(.status-badge) { flex: 0 0 auto; }
.workload-identity > p {
  overflow: hidden;
  margin: 7px 0 0;
  color: #748195;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workload-identity > span { display: block; margin-top: 13px; color: #929cab; font-size: 11px; }

.workload-center-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
}

.workload-center-cell {
  min-width: 0;
  min-height: 112px;
  padding: 17px 16px;
  background: #fff;
}

.workload-center-cell + .workload-center-cell { border-left: 1px solid #edf0f3; }
.workload-center-cell.is-idle { background: #fafbfc; }
.workload-center-cell.is-partial { background: #fdfbf7; }

.workload-center-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workload-center-heading span {
  min-width: 0;
  overflow: hidden;
  color: #657286;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workload-center-heading i {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #5e9b72;
}
.workload-center-cell.is-idle .workload-center-heading i { background: #a9b2bf; }
.workload-center-cell.is-partial .workload-center-heading i { background: #b47a31; }

.workload-replica-count {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 13px 0 0;
  color: #7c8899;
  font-size: 10.5px;
}
.workload-replica-count strong {
  color: #344258;
  font-family: var(--scnet-font-mono);
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
}
.workload-resource-pair { display: flex; flex-wrap: wrap; gap: 5px 10px; margin-top: 10px; color: #8a95a5; font-size: 10.5px; }
.workload-idle-label { margin: 14px 0 0; color: #9aa4b2; font-size: 11px; }

.migration-table-region {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e0e5eb;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 5px 16px rgb(35 52 75 / 3.5%);
}

.migration-table-region :deep(.el-table) {
  --el-table-border-color: #e6eaf0;
  --el-table-header-bg-color: #f7f9fb;
  --el-table-row-hover-bg-color: #f7f9fc;
  color: #4c596d;
  font-size: 13px;
}
.migration-table-region :deep(.el-table::before),
.migration-table-region :deep(.el-table__inner-wrapper::before) { display: none; }
.migration-table-region :deep(.el-table th.el-table__cell) {
  height: 45px;
  padding: 0;
  background: #f7f9fb;
  color: #738095;
  font-size: 12px;
  font-weight: 600;
}
.migration-table-region :deep(.el-table td.el-table__cell) { height: 62px; padding: 0; }
.migration-table-region :deep(.el-table .cell) { padding: 0 16px; line-height: 1.45; }
.migration-table-region :deep(td.mono.el-table__cell) { color: #5e6c81; font-family: var(--scnet-font-mono); font-size: 12px; }
.migration-table-region :deep(.el-table__body tr.migration-row-status-migrating:hover > td.el-table__cell),
.migration-table-region :deep(.el-table__body tr.migration-row-status-running:hover > td.el-table__cell) { background: var(--scnet-hover-bg); }
.migration-table-region :deep(.el-table__body tr.migration-row-status-success:hover > td.el-table__cell) { background: var(--scnet-hover-success-bg); }
.migration-table-region :deep(.el-table__body tr.migration-row-status-failed:hover > td.el-table__cell) { background: var(--scnet-hover-danger-bg); }
.migration-table-region :deep(.el-table__body tr.migration-row-status-pending:hover > td.el-table__cell),
.migration-table-region :deep(.el-table__body tr.migration-row-status-queued:hover > td.el-table__cell) { background: var(--scnet-hover-warning-bg); }
.migration-table-region :deep(.el-table__body tr.migration-row-status-stopped:hover > td.el-table__cell) { background: var(--scnet-hover-neutral-bg); }

.migration-route-cell { min-width: 0; display: flex; align-items: center; gap: 8px; color: #7b8798; }
.migration-route-cell span,
.migration-route-cell strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.migration-route-cell strong { color: #435168; font-weight: 600; }
.migration-route-cell svg { flex: 0 0 auto; width: 30px; fill: none; stroke: #a2adba; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.4; }

.migration-progress-cell { display: grid; grid-template-columns: minmax(58px, 1fr) 38px; align-items: center; gap: 8px; }
.migration-progress-track { height: 6px; overflow: hidden; border-radius: 3px; background: #edf1f5; }
.migration-progress-track i { display: block; height: 100%; border-radius: inherit; background: var(--scnet-primary); transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1); }
.migration-progress-cell.is-success .migration-progress-track i { background: var(--scnet-success); }
.migration-progress-cell.is-failed .migration-progress-track i { background: var(--scnet-danger); }
.migration-progress-cell.is-pending .migration-progress-track i,
.migration-progress-cell.is-queued .migration-progress-track i { background: #92632e; }
.migration-progress-cell.is-stopped .migration-progress-track i { background: #8995a5; }
.migration-progress-cell strong { color: #69768a; font-family: var(--scnet-font-mono); font-size: 11.5px; font-weight: 600; }
.migration-detail-button { min-height: 36px; font-weight: 600; }

:global(.migration-detail-dialog) {
  height: min(680px, calc(100vh - 40px));
  max-height: min(680px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
}
:global(.migration-detail-dialog .el-dialog__header) {
  flex: 0 0 auto;
  margin: 0;
  padding: 18px 22px;
  border-bottom: 1px solid var(--scnet-divider);
}
:global(.migration-detail-dialog .el-dialog__title) { color: #273449; font-size: 19px; font-weight: 650; }
:global(.migration-detail-dialog .el-dialog__headerbtn) { top: 12px; right: 14px; width: 42px; height: 42px; }
:global(.migration-detail-dialog .el-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow: hidden;
  padding: 0;
  color: var(--scnet-text-secondary);
}

.migration-detail-shell {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f6f8fb;
}

.migration-detail-summary {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) 128px 126px;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}
.migration-detail-summary > div { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 15px 18px; }
.migration-detail-summary > div + div { border-left: 1px solid var(--scnet-divider); }
.migration-detail-summary span { color: #7f8b9c; font-size: 12px; font-weight: 600; }
.migration-detail-summary strong { overflow: hidden; color: #3b485c; font-size: 14px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.migration-summary-status :deep(.status-badge) { align-self: flex-start; }
.migration-summary-progress strong { color: var(--scnet-primary); font-family: var(--scnet-font-mono); font-size: 22px; line-height: 1; }

.migration-detail-grid {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(340px, 0.9fr) minmax(0, 1.1fr);
  margin: 16px;
  overflow: hidden;
  border: 1px solid #dfe5ec;
  border-radius: 7px;
  background: #fff;
}
.migration-route-overview,
.migration-event-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.migration-route-overview { overflow-y: auto; border-right: 1px solid var(--scnet-divider); scrollbar-color: #cbd3dd transparent; scrollbar-width: thin; }

.migration-detail-section-heading {
  min-height: 62px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px 11px;
  border-bottom: 1px solid var(--scnet-divider);
}
.migration-detail-section-heading h3 { margin: 0; color: #344156; font-size: 16px; font-weight: 650; }
.migration-detail-section-heading > span { color: #788598; font-family: var(--scnet-font-mono); font-size: 13px; }

.migration-route-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
  align-items: stretch;
  column-gap: 18px;
  margin: 18px 18px 0;
  padding: 16px 17px;
  border: 1px solid #e3e8ee;
  border-radius: 6px;
  background: #fafbfd;
}
.migration-route-endpoint {
  min-width: 0;
  padding: 1px 0;
}
.migration-route-card span { display: block; color: #7f8b9b; font-size: 11.5px; line-height: 1.4; }
.migration-route-card strong { display: block; overflow-wrap: anywhere; margin-top: 6px; color: #354359; font-size: 14px; font-weight: 650; line-height: 1.45; }
.migration-route-divider {
  width: 1px;
  min-height: 44px;
  background: #dde3ea;
}

.migration-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 16px 18px 0; border: 1px solid #e5e9ee; border-radius: 6px; }
.migration-facts > div { min-width: 0; padding: 12px 13px; }
.migration-facts > div:nth-child(odd) { border-right: 1px solid var(--scnet-divider); }
.migration-facts > div:nth-child(-n + 2) { border-bottom: 1px solid var(--scnet-divider); }
.migration-facts dt { color: #8994a4; font-size: 10.5px; }
.migration-facts dd { margin: 4px 0 0; overflow-wrap: anywhere; color: #46546a; font-size: 12px; font-weight: 600; line-height: 1.45; }

.migration-reason-block { margin: 16px 18px 20px; padding: 13px 14px; border-radius: 6px; background: #f4f7fa; }
.migration-reason-block h4 { margin: 0; color: #69768a; font-size: 11px; font-weight: 650; }
.migration-reason-block p { margin: 6px 0 0; color: #536176; font-size: 12.5px; line-height: 1.65; overflow-wrap: anywhere; }

.migration-event-list {
  min-height: 0;
  flex: 1;
  margin: 0;
  overflow-y: auto;
  padding: 5px 16px 14px;
  list-style: none;
  overscroll-behavior: contain;
  scrollbar-color: #cbd3dd transparent;
  scrollbar-width: thin;
}
.migration-event-item { position: relative; min-width: 0; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 11px; padding: 15px 0 17px; }
.migration-event-item + .migration-event-item { border-top: 1px solid #edf0f3; }
.migration-event-marker { position: relative; z-index: 1; width: 25px; height: 25px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #cdd9e7; border-radius: 50%; background: #f3f7fc; color: #587eaf; font-family: var(--scnet-font-mono); font-size: 10.5px; }
.migration-event-item.is-success .migration-event-marker { border-color: #cfe2d5; background: #f2f8f4; color: #538868; }
.migration-event-item.is-failed .migration-event-marker { border-color: #ead0d0; background: #fdf3f3; color: #ad5d5d; }
.migration-event-item time { display: block; color: #929cab; font-family: var(--scnet-font-mono); font-size: 10.5px; }
.migration-event-item strong { display: block; margin-top: 5px; color: #39475c; font-size: 13.5px; font-weight: 650; line-height: 1.45; }
.migration-event-item p { margin: 6px 0 0; color: #788597; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.migration-event-empty { flex: 1; }

.multicenter-overview { display: grid; gap: 18px; }

.multicenter-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border: 1px solid #e2e7ed;
  border-radius: 7px;
  background: #fff;
}

.multicenter-summary > div { position: relative; min-width: 0; padding: 17px 22px; }
.multicenter-summary > div:not(:last-child)::after {
  position: absolute;
  top: 17px;
  right: 0;
  bottom: 17px;
  width: 1px;
  background: var(--scnet-divider);
  content: '';
}
.multicenter-summary dt { color: #7d899a; font-size: 12px; }
.multicenter-summary dd {
  margin: 3px 0 0;
  color: #28354a;
  font-size: 23px;
  font-weight: 650;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.multicenter-summary dd span { margin-left: 5px; color: #8a96a7; font-size: 12px; font-weight: 450; }

.topology-panel {
  overflow: hidden;
  border: 1px solid #dde3ea;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 4px 16px rgb(45 61 82 / 5%);
}

.topology-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 72px;
  padding: 14px 18px 14px 22px;
  border-bottom: 1px solid var(--scnet-divider);
}
.topology-title-row { gap: 10px; }
.topology-panel-header h2 { margin: 0; color: #28354a; font-size: 19px; font-weight: 650; }
.topology-panel-header p { margin: 3px 0 0; color: #8a95a5; font-size: 12px; }
.topology-actions { flex-wrap: wrap; justify-content: flex-end; gap: 14px; }
.topology-legend { gap: 6px; color: #687589; font-size: 11px; }
.topology-legend i { width: 6px; height: 6px; }
.topology-legend.is-degraded i { background: #bd8435; }

.topology-reset-button {
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #dce2e9;
  border-radius: 5px;
  background: #fff;
  color: #5c697d;
  cursor: pointer;
  font-size: 12px;
  transition: border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms cubic-bezier(0.22, 1, 0.36, 1), color 180ms cubic-bezier(0.22, 1, 0.36, 1);
  touch-action: manipulation;
}
.topology-reset-button svg {
  width: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
.topology-reset-button:hover { border-color: #abc2e2; background: #f6f9fd; color: var(--scnet-primary); }

.topology-workspace {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr) 282px;
  min-height: 520px;
  background: #fbfcfe;
}

.topology-cluster-rail {
  position: relative;
  z-index: 2;
  padding: 18px 14px;
  border-right: 1px solid var(--scnet-divider);
  background: #fff;
}
.cluster-rail-heading { justify-content: space-between; padding: 0 6px 11px; color: #7b8798; font-size: 11px; }
.cluster-rail-heading strong {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 9px;
  background: #eef2f6;
  color: #667488;
  font-size: 10px;
  text-align: center;
}
.cluster-rail-button {
  position: relative;
  width: 100%;
  gap: 9px;
  min-height: 58px;
  margin-bottom: 5px;
  padding: 9px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #4f5d70;
  cursor: pointer;
  text-align: left;
  transition: border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms cubic-bezier(0.22, 1, 0.36, 1);
  touch-action: manipulation;
}
.cluster-rail-button:hover { background: #f6f8fb; }
.cluster-rail-button.is-active { border-color: #d6e2f2; background: #f3f7fc; }
.cluster-rail-button.is-active::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: -1px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--scnet-primary);
  content: '';
}
.cluster-rail-button.is-degraded .cluster-status-dot { background: #bd8435; }
.cluster-rail-button.is-offline .cluster-status-dot { background: #8b97a7; }
.cluster-rail-copy { min-width: 0; flex: 1; }
.cluster-rail-copy strong,
.cluster-rail-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cluster-rail-copy strong { color: #334057; font-size: 12.5px; font-weight: 600; }
.cluster-rail-copy small { margin-top: 2px; color: #8994a4; font-size: 10.5px; }
.cluster-rail-queue {
  min-width: 28px;
  padding: 2px 5px;
  border-radius: 4px;
  background: #eef2f6;
  color: #6f7c8e;
  font-family: var(--scnet-font-mono);
  font-size: 10px;
  text-align: center;
}

.topology-stage { position: relative; min-width: 0; overflow: hidden; }
.topology-link-selection {
  position: absolute;
  z-index: 1;
  right: 18px;
  bottom: 18px;
  left: 18px;
  width: fit-content;
  max-width: calc(100% - 36px);
  margin-inline: auto;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(35, 45, 61, 0.96);
  color: #fff;
  box-shadow: 0 8px 24px rgb(25 35 49 / 16%);
  pointer-events: none;
  font-size: 13px;
  line-height: 1.7;
}
.topology-link-selection strong, .topology-link-selection span { display: block; }
.topology-link-selection strong { font-weight: 600; }
.topology-inspector-body { min-height: 480px; }
.topology-canvas {
  height: clamp(520px, 58vh, 680px);
  min-height: 520px;
  background-color: #fbfcfe;
  background-image: radial-gradient(circle, #dce4ed 0.7px, transparent 0.8px);
  background-size: 18px 18px;
  user-select: none;
}
.topology-inspector {
  position: relative;
  z-index: 2;
  min-width: 0;
  padding: 20px;
  border-left: 1px solid var(--scnet-divider);
  background: #fff;
}
.inspector-heading { justify-content: space-between; margin-bottom: 14px; }
.inspector-heading p { margin: 0; color: #7c8899; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
.inspector-heading span {
  padding: 2px 7px;
  border-radius: 9px;
  background: #eef7f1;
  color: #3f8156;
  font-size: 10px;
}
.inspector-heading span.is-degraded { background: #faf3e9; color: #99641f; }
.inspector-heading span.is-offline { background: #f1f3f6; color: #69778a; }
.topology-inspector h3 { margin: 0; color: #2d3a50; font-size: 15px; font-weight: 650; line-height: 1.45; }
.inspector-description { min-height: 38px; margin: 5px 0 19px; color: #8894a4; font-size: 11.5px; line-height: 1.65; }

.inspector-utilization { display: grid; gap: 15px; padding: 15px 0 18px; border-top: 1px solid var(--scnet-divider); }
.inspector-utilization > div { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px 10px; }
.inspector-utilization span { color: #788597; font-size: 11px; }
.inspector-utilization strong { color: #46546a; font-family: var(--scnet-font-mono); font-size: 11px; font-weight: 600; }
.inspector-utilization i { grid-column: 1 / -1; display: block; height: 4px; overflow: hidden; border-radius: 2px; background: #edf1f5; }
.inspector-utilization b { display: block; height: 100%; border-radius: inherit; background: #5a88c5; }

.inspector-facts,
.inspector-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border: 1px solid #e5e9ee; border-radius: 6px; }
.inspector-facts > div,
.inspector-metrics > div { min-width: 0; padding: 10px; }
.inspector-facts > div:nth-child(odd),
.inspector-metrics > div:nth-child(odd) { border-right: 1px solid var(--scnet-divider); }
.inspector-facts > div:nth-child(-n + 2),
.inspector-metrics > div:not(:last-child) { border-bottom: 1px solid var(--scnet-divider); }
.inspector-facts dt,
.inspector-metrics dt { color: #8a95a4; font-size: 10px; }
.inspector-facts dd,
.inspector-metrics dd { overflow: hidden; margin: 3px 0 0; color: #3b495f; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.inspector-metrics { grid-template-columns: 1fr; margin-top: 20px; }
.inspector-metrics > div:nth-child(odd) { border-right: 0; }
.inspector-metrics dd { font-size: 18px; }
.inspector-metrics dd span { margin-left: 3px; color: #8994a4; font-size: 10px; font-weight: 450; }

.inspector-links { margin-top: 18px; }
.inspector-links > p { margin: 0 0 6px; color: #8490a1; font-size: 10px; }
.inspector-links button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 0 3px;
  border: 0;
  border-bottom: 1px solid #f0f2f5;
  background: transparent;
  color: #667387;
  cursor: pointer;
  font-size: 11px;
  text-align: left;
  touch-action: manipulation;
}
.inspector-links button:hover span { color: var(--scnet-primary); }
.inspector-links strong { color: #4c5a6e; font-family: var(--scnet-font-mono); font-size: 10px; font-weight: 500; }
.inspector-route { display: grid; grid-template-columns: 7px 1fr 7px; align-items: center; margin: 12px 0; }
.inspector-route i { width: 7px; height: 7px; border: 2px solid #5e86bc; border-radius: 50%; background: #fff; }
.inspector-route span { height: 1px; background: linear-gradient(90deg, #5e86bc, #b4bfcc); }

.function-deployment-section {
  min-width: 0;
  display: grid;
  gap: 16px;
}

.deployment-section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 2px 2px 0;
}

.deployment-section-header h2 {
  margin: 0;
  color: #26344a;
  font-size: 20px;
  font-weight: 650;
  line-height: 1.4;
  text-wrap: balance;
}

.deployment-summary {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  color: #7a8798;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.deployment-summary strong {
  color: #3d4b60;
  font-family: var(--scnet-font-mono);
  font-size: 17px;
  font-weight: 600;
}

.function-deployment-board {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e1e6ec;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(28, 42, 61, 0.035);
}

.deployment-board-header,
.deployment-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(300px, 0.72fr) minmax(0, 1.28fr);
}

.deployment-board-header {
  min-height: 44px;
  align-items: stretch;
  border-bottom: 1px solid #e3e8ee;
  background: #f8fafc;
  color: #738095;
  font-size: 12px;
  font-weight: 600;
}

.deployment-board-header > span {
  display: flex;
  align-items: center;
  padding: 0 24px;
  border-right: 1px solid #e3e8ee;
}

.deployment-centers {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.deployment-board-header .deployment-centers > span {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  text-align: center;
}

.deployment-board-header .deployment-centers > span + span {
  border-left: 1px solid #e3e8ee;
}

.deployment-row + .deployment-row {
  border-top: 1px solid #e3e8ee;
}

.deployment-function-info {
  min-width: 0;
  padding: 20px 24px;
  border-right: 1px solid #e3e8ee;
}

.deployment-function-heading {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.deployment-function-heading > div {
  min-width: 0;
}

.deployment-function-heading h3 {
  margin: 0;
  color: #27354a;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.45;
  text-wrap: balance;
}

.deployment-function-id {
  overflow: hidden;
  margin: 3px 0 0;
  color: #7d8999;
  font-family: var(--scnet-font-mono);
  font-size: 11.5px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deployment-description {
  display: -webkit-box;
  overflow: hidden;
  margin: 12px 0 0;
  color: #687588;
  font-size: 13px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.deployment-metadata {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 13px;
}

.deployment-metadata span {
  padding: 3px 7px;
  border: 1px solid #dfe5eb;
  border-radius: 4px;
  background: #f8fafb;
  color: #667488;
  font-family: var(--scnet-font-mono);
  font-size: 10.5px;
  line-height: 1.35;
}

.deployment-image {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 11px;
}

.deployment-image > span {
  color: #8a95a4;
  font-size: 11px;
}

.deployment-image code {
  min-width: 0;
  overflow: hidden;
  color: #627087;
  font-family: var(--scnet-font-mono);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deployment-row > .deployment-centers {
  align-items: stretch;
}

.deployment-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 18px 12px;
  background: #fff;
  text-align: center;
}

.deployment-cell + .deployment-cell {
  border-left: 1px solid #edf0f3;
}

.deployment-cell.is-ready { background: #fbfdfb; }
.deployment-cell.is-deploying { background: #fdfbf7; }
.deployment-cell.is-offline { background: #fdfafa; }
.deployment-cell.is-undeployed { background: #fafbfc; }

.deployment-cluster-name {
  display: none;
  color: #718095;
  font-size: 11px;
  font-weight: 600;
}

.deployment-replicas {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: #768397;
  font-size: 10.5px;
}

.deployment-replicas strong {
  color: #35445a;
  font-family: var(--scnet-font-mono);
  font-size: 21px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.deployment-replicas.is-empty {
  color: #a3acb8;
  font-family: var(--scnet-font-mono);
  font-size: 18px;
}

.deployment-status {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
}

.deployment-status::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}

.deployment-status.is-ready { background: #edf6f0; color: #3e8157; }
.deployment-status.is-deploying { background: #faf2e6; color: #946322; }
.deployment-status.is-offline { background: #f8eeee; color: #965353; }
.deployment-status.is-undeployed { background: #f0f2f5; color: #778497; }

.deployment-empty {
  margin: 0;
  padding: 56px 24px;
  border: 1px dashed #d9e0e8;
  border-radius: 7px;
  background: #fafbfc;
  color: #7f8b9b;
  font-size: 13px;
  text-align: center;
}

.mr-8 {
  margin-right: 8px;
}

.multicenter-home-link:focus-visible,
.topology-reset-button:focus-visible,
.cluster-rail-button:focus-visible,
.inspector-links button:focus-visible,
.migration-detail-button:focus-visible {
  outline: 2px solid rgb(11 91 211 / 34%);
  outline-offset: 2px;
}

@media (max-width: 1100px) {
  .topology-workspace { grid-template-columns: 220px minmax(0, 1fr); }
  .topology-inspector {
    grid-column: 1 / -1;
    border-top: 1px solid var(--scnet-divider);
    border-left: 0;
  }
  .topology-inspector-body {
    display: grid;
    grid-template-columns: minmax(220px, 0.8fr) minmax(280px, 1.2fr);
    min-height: 500px;
    align-content: start;
    gap: 18px 28px;
  }
  .inspector-heading,
  .topology-inspector-body > h3,
  .inspector-description { grid-column: 1; }
  .inspector-utilization,
  .inspector-facts,
  .inspector-metrics { grid-column: 2; }
  .inspector-links { grid-column: 1 / -1; }
}

@media (max-width: 900px) {
  .workload-row { grid-template-columns: 1fr; }
  .workload-identity { border-right: 0; border-bottom: 1px solid #e5e9ee; }
  .workload-center-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workload-center-cell:nth-child(2n + 1) { border-left: 0; }
  .workload-center-cell:nth-child(n + 3) { border-top: 1px solid #edf0f3; }
  .deployment-section-header { align-items: flex-start; flex-direction: column; gap: 10px; }
  .deployment-board-header { display: none; }
  .deployment-row { grid-template-columns: 1fr; }
  .deployment-function-info { border-right: 0; border-bottom: 1px solid #e3e8ee; }
  .deployment-row > .deployment-centers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .deployment-cell { align-items: flex-start; min-height: 112px; padding: 16px 18px; text-align: left; }
  .deployment-cell + .deployment-cell { border-left: 1px solid #edf0f3; }
  .deployment-cell:nth-child(2n + 1) { border-left: 0; }
  .deployment-cell:nth-child(n + 3) { border-top: 1px solid #edf0f3; }
  .deployment-cluster-name { display: block; }
}

@media (max-width: 720px) {
  .multicenter-surface-header { align-items: flex-start; padding: 18px; }
  .multicenter-heading-row { gap: 10px; }
  .multicenter-heading-divider { display: none; }
  .multicenter-heading-row h1 { font-size: 20px; }
  .multicenter-home-link span { display: none; }
  .multicenter-tabs :deep(.el-tabs__header) { padding: 0 12px; }
  .multicenter-tabs { --mc-tab-padding: 12px; }
  .multicenter-tabs :deep(.el-tabs__content) { padding: 12px; }
  .multicenter-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .multicenter-summary > div:nth-child(2)::after { display: none; }
  .multicenter-summary > div:nth-child(-n + 2) { border-bottom: 1px solid var(--scnet-divider); }
  .topology-panel-header { align-items: flex-start; flex-direction: column; }
  .topology-actions { width: 100%; justify-content: flex-start; }
  .topology-workspace { grid-template-columns: 1fr; }
  .topology-cluster-rail { order: 2; border-top: 1px solid var(--scnet-divider); border-right: 0; }
  .topology-stage { order: 1; }
  .topology-inspector { order: 3; grid-column: 1; display: block; }
  .topology-inspector-body { display: block; min-height: 480px; }
  .topology-canvas { height: clamp(430px, 64vh, 560px); min-height: 430px; }
  :global(.trace-detail-dialog) {
    width: calc(100vw - 24px) !important;
    height: calc(100vh - 24px);
    max-height: calc(100vh - 24px);
  }
  .trace-summary { grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr); }
  .trace-summary-latency { grid-column: 1 / -1; border-top: 1px solid var(--scnet-divider); border-left: 0 !important; }
  .trace-detail-grid { grid-template-columns: 1fr; margin: 10px; overflow-y: auto; }
  .trace-chart-panel { min-height: 300px; border-right: 0; border-bottom: 1px solid var(--scnet-divider); }
  .trace-stage-panel { min-height: 320px; }
  .trace-stage-list { overflow-y: visible; }
  :global(.migration-detail-dialog) {
    width: calc(100vw - 24px) !important;
    height: calc(100vh - 24px);
    max-height: calc(100vh - 24px);
  }
  .migration-detail-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .migration-detail-summary > div:nth-child(3) { border-top: 1px solid var(--scnet-divider); border-left: 0; }
  .migration-detail-summary > div:nth-child(4) { border-top: 1px solid var(--scnet-divider); }
  .migration-detail-grid { display: block; margin: 10px; overflow-y: auto; }
  .migration-route-overview { overflow-y: visible; border-right: 0; border-bottom: 1px solid var(--scnet-divider); }
  .migration-event-panel { min-height: 340px; }
  .migration-event-list { overflow-y: visible; }
}

@media (max-width: 520px) {
  .workload-section-heading { align-items: flex-start; flex-direction: column; gap: 9px; }
  .workload-center-grid { grid-template-columns: 1fr; }
  .workload-center-cell + .workload-center-cell,
  .workload-center-cell:nth-child(2n + 1) { border-left: 0; }
  .workload-center-cell:nth-child(n + 2) { border-top: 1px solid #edf0f3; }
  .deployment-summary { flex-wrap: wrap; white-space: normal; }
  .deployment-function-info { padding: 18px; }
  .deployment-row > .deployment-centers { grid-template-columns: 1fr; }
  .deployment-cell + .deployment-cell,
  .deployment-cell:nth-child(2n + 1) { border-left: 0; }
  .deployment-cell:nth-child(n + 2) { border-top: 1px solid #edf0f3; }
}

@media (prefers-reduced-motion: reduce) {
  .multicenter-home-link,
  .topology-reset-button,
  .cluster-rail-button { transition-duration: 0.01ms; }
}
</style>
