<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import {
  formatBytes,
  formatMs,
  formatNumber,
  formatTimestamp,
} from '~/composables/useFormat'
import type { Invocation, MigrationDetail, TraceDetail } from '~/types'

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

const { data: clusters } = await useAsyncData('mc-clusters', () => getClusters(), { default: () => [] })
const { data: topology } = await useAsyncData('mc-topology', () => getTopology(), { default: () => null })
const { data: functions } = await useAsyncData('mc-functions', () => getFunctions(), { default: () => [] })
const { data: matrix } = await useAsyncData('mc-matrix', () => getDeploymentMatrix(), { default: () => null })
const { data: workloads } = await useAsyncData('mc-workloads', () => getWorkloads(), { default: () => [] })
const { data: invocations } = await useAsyncData('mc-invocations', () => getInvocations(), { default: () => [] })
const { data: migrations } = await useAsyncData('mc-migrations', () => getMigrations(), { default: () => [] })

const activeTab = ref('overview')

const clusterNameMap = computed(() => {
  const m = new Map<string, string>()
  for (const c of clusters.value ?? []) m.set(c.id, c.name)
  for (const c of appStore.clusters) if (!m.has(c.id)) m.set(c.id, c.name)
  return m
})
const nameOf = (id: string): string => clusterNameMap.value.get(id) ?? id

/* ============ 拓扑图（ECharts graph） ============ */
const topoOption = computed(() => {
  const t = topology.value
  if (!t) return null
  const color: Record<string, string> = { online: '#16a34a', degraded: '#f59e0b', offline: '#94a3b8' }
  return {
    tooltip: {},
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        label: { show: true, position: 'bottom', fontSize: 12 },
        edgeSymbol: ['none', 'arrow'],
        edgeLabel: {
          show: true,
          formatter: (p: { data: { latency_ms?: number; bandwidth_mbps?: number } }) =>
            `${p.data.latency_ms ?? '-'}ms`,
          fontSize: 10,
        },
        data: t.nodes.map((n) => ({
          id: n.id,
          name: n.name,
          symbolSize: 46,
          itemStyle: { color: color[n.status] ?? '#94a3b8' },
        })),
        links: t.links.map((l) => ({
          source: l.source,
          target: l.target,
          latency_ms: l.latency_ms,
          bandwidth_mbps: l.bandwidth_mbps,
          lineStyle: { color: color[l.status] ?? '#94a3b8', width: 2 },
        })),
        force: { repulsion: 360, edgeLength: 160 },
      },
    ],
  }
})

/* ============ 部署矩阵 ============ */
const matrixClusters = computed(() => matrix.value?.clusters ?? [])
const matrixRows = computed(() => {
  const rows: { function_name: string; function_id: string; cells: Record<string, string> }[] = []
  for (const fn of matrix.value?.functions ?? []) {
    const cells: Record<string, string> = {}
    for (const dep of fn.deployments) {
      cells[dep.cluster_id] = `${dep.replicas} 实例 / ${dep.status}`
    }
    rows.push({ function_name: fn.function_name, function_id: fn.function_id, cells })
  }
  return rows
})

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

const traceOption = computed(() => {
  const spans = trace.value?.spans ?? []
  if (!spans.length) return null
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 120, right: 40, top: 12, bottom: 32 },
    xAxis: { type: 'value', name: 'ms' },
    yAxis: {
      type: 'category',
      data: spans.map((s) => `#${s.seq} ${s.name}`).reverse(),
    },
    series: [
      {
        type: 'bar',
        data: [...spans].reverse().map((s) => ({
          value: s.latency_ms,
          itemStyle: { color: s.status === 'success' ? '#16a34a' : '#e63946' },
        })),
        barWidth: 14,
      },
    ],
  }
})

/* ============ 迁移详情 ============ */
const migVisible = ref(false)
const migLoading = ref(false)
const migDetail = ref<MigrationDetail | null>(null)
async function openMig(id: string): Promise<void> {
  migVisible.value = true
  migLoading.value = true
  migDetail.value = null
  try {
    migDetail.value = await getMigrationDetail(id)
  } finally {
    migLoading.value = false
  }
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">函数多中心联调</h1>
        <p class="page-subtitle">四中心资源状态 · 函数部署矩阵 · 跨中心调用链路 · 工作负载扩缩容与迁移</p>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- ================= 总览 ================= -->
      <el-tab-pane label="总览" name="overview">
        <div class="card-grid">
          <el-card v-for="c in clusters ?? []" :key="c.id" shadow="hover" class="cluster-card">
            <div class="flex-between mb-8">
              <div>
                <div class="cluster-name">{{ c.name }}</div>
                <div class="muted">{{ c.location }} · {{ c.architecture }} · {{ c.scheduler }}</div>
              </div>
              <StatusBadge :status="c.status" />
            </div>
            <div class="util-row">
              <span class="muted">CPU 利用率</span>
              <el-progress
                :percentage="Number(c.cpu_utilization) || 0"
                :stroke-width="10"
                :color="Number(c.cpu_utilization) > 85 ? '#e63946' : '#1a6dff'"
              />
            </div>
            <div class="util-row">
              <span class="muted">内存利用率</span>
              <el-progress
                :percentage="Number(c.memory_utilization) || 0"
                :stroke-width="10"
                :color="Number(c.memory_utilization) > 85 ? '#e63946' : '#1a6dff'"
              />
            </div>
            <div class="flex gap-16 mt-8">
              <span class="muted">节点 {{ formatNumber(c.total_nodes) }}</span>
              <span class="muted">核 {{ formatNumber(c.total_cores) }}</span>
              <span class="muted">GPU {{ formatNumber(c.gpu_count) }}</span>
            </div>
            <div class="flex gap-16 mt-8">
              <span class="muted">活跃任务 {{ formatNumber(c.active_jobs) }}</span>
              <span class="muted">排队 {{ formatNumber(c.queue_length) }}</span>
            </div>
          </el-card>
        </div>

        <h2 class="section-title">中心间网络拓扑</h2>
        <div class="chart-box">
          <BaseChart v-if="topoOption" :option="topoOption" height="420px" />
          <el-empty v-else description="暂无拓扑数据" />
        </div>
      </el-tab-pane>

      <!-- ================= 函数与部署矩阵 ================= -->
      <el-tab-pane label="函数部署" name="functions">
        <div class="card-grid">
          <el-card v-for="fn in functions ?? []" :key="fn.id" shadow="hover">
            <div class="flex-between mb-8">
              <div>
                <div class="fn-name">{{ fn.name }}</div>
                <div class="muted mono">{{ fn.id }} · v{{ fn.version }}</div>
              </div>
              <StatusBadge :status="fn.status" />
            </div>
            <p class="muted fn-desc">{{ fn.description }}</p>
            <div class="flex gap-8 wrap">
              <el-tag size="small" effect="plain">{{ fn.runtime }}</el-tag>
              <el-tag size="small" effect="plain" type="info" class="mono">{{ fn.image }}</el-tag>
            </div>
          </el-card>
        </div>

        <h2 class="section-title">部署矩阵</h2>
        <el-card shadow="never">
          <el-table :data="matrixRows" border size="small">
            <el-table-column prop="function_name" label="函数" min-width="160" />
            <el-table-column
              v-for="c in matrixClusters"
              :key="c.id"
              :label="c.name"
              min-width="150"
            >
              <template #default="{ row }">
                <span class="muted">{{ row.cells[c.id] ?? '-' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ================= 调用追踪 ================= -->
      <el-tab-pane label="调用追踪" name="invocations">
        <el-card shadow="never">
          <el-table :data="invocations ?? []" border stripe size="default">
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
                <el-button size="small" type="primary" link @click="openTrace(row)">链路追踪</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ================= 工作负载与迁移 ================= -->
      <el-tab-pane label="负载迁移" name="workloads">
        <h2 class="section-title">工作负载</h2>
        <el-card shadow="never">
          <el-table :data="workloads ?? []" border stripe size="small">
            <el-table-column prop="workload_id" label="Workload ID" min-width="150" class-name="mono" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><StatusBadge :status="row.status" /></template>
            </el-table-column>
            <el-table-column label="实例分布" min-width="260">
              <template #default="{ row }">
                <el-tag
                  v-for="ins in row.instances"
                  :key="ins.cluster_id"
                  size="small"
                  effect="plain"
                  class="mr-8"
                >
                  {{ nameOf(ins.cluster_id) }}：{{ ins.ready_replicas }}/{{ ins.desired_replicas }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <h2 class="section-title">迁移记录</h2>
        <el-card shadow="never">
          <el-table :data="migrations ?? []" border stripe size="small">
            <el-table-column prop="migration_id" label="迁移 ID" min-width="170" class-name="mono" />
            <el-table-column prop="workload_id" label="Workload" min-width="140" class-name="mono" />
            <el-table-column label="迁移路径" min-width="220">
              <template #default="{ row }">
                {{ nameOf(row.from_cluster) }} → {{ nameOf(row.to_cluster) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><StatusBadge :status="row.status" /></template>
            </el-table-column>
            <el-table-column label="进度" width="110">
              <template #default="{ row }">
                <el-progress
                  :percentage="row.progress ?? 0"
                  :stroke-width="8"
                  :status="row.status === 'failed' ? 'exception' : undefined"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="openMig(row.migration_id)">
                  事件详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 调用链路弹窗 -->
    <el-dialog v-model="traceVisible" title="调用链路追踪" width="760px">
      <div v-loading="traceLoading">
        <template v-if="trace">
          <el-descriptions :column="3" border size="small" class="mb-16">
            <el-descriptions-item label="调用 ID" class-name="mono">{{ trace.invocation_id }}</el-descriptions-item>
            <el-descriptions-item label="Trace ID" class-name="mono">{{ trace.trace_id }}</el-descriptions-item>
            <el-descriptions-item label="总耗时">{{ formatMs(trace.total_latency_ms) }}</el-descriptions-item>
          </el-descriptions>
          <div class="chart-box mb-16">
            <p class="chart-title">各阶段耗时</p>
            <BaseChart v-if="traceOption" :option="traceOption" height="280px" />
          </div>
          <el-table :data="trace.spans" border size="small" stripe>
            <el-table-column prop="seq" label="序号" width="60" />
            <el-table-column prop="component" label="组件" width="130" />
            <el-table-column prop="name" label="阶段" min-width="150" />
            <el-table-column label="集群" width="130">
              <template #default="{ row }">{{ nameOf(row.cluster_id) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }"><StatusBadge :status="row.status" /></template>
            </el-table-column>
            <el-table-column label="耗时" width="100">
              <template #default="{ row }">{{ formatMs(row.latency_ms) }}</template>
            </el-table-column>
          </el-table>
        </template>
        <el-empty v-else-if="traceError" :description="traceError" />
      </div>
    </el-dialog>

    <!-- 迁移事件弹窗 -->
    <el-dialog v-model="migVisible" title="迁移事件详情" width="760px">
      <div v-loading="migLoading">
        <template v-if="migDetail">
          <el-descriptions :column="3" border size="small" class="mb-16">
            <el-descriptions-item label="迁移 ID" class-name="mono">{{ migDetail.migration_id }}</el-descriptions-item>
            <el-descriptions-item label="路径">
              {{ nameOf(migDetail.from_cluster) }} → {{ nameOf(migDetail.to_cluster) }}
            </el-descriptions-item>
            <el-descriptions-item label="状态"><StatusBadge :status="migDetail.status" /></el-descriptions-item>
            <el-descriptions-item label="迁移副本">{{ migDetail.transferred_replicas ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="数据量">{{ formatBytes(migDetail.total_size_mb) }}</el-descriptions-item>
            <el-descriptions-item label="原因">{{ migDetail.reason || '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-timeline>
            <el-timeline-item
              v-for="ev in migDetail.events ?? []"
              :key="ev.seq ?? ev.name"
              :timestamp="formatTimestamp(ev.timestamp, true)"
              placement="top"
              :type="ev.status === 'failed' ? 'danger' : ev.status === 'success' ? 'success' : 'primary'"
            >
              <b>{{ ev.event ?? ev.name }}</b>
              <p class="muted">{{ ev.detail ?? ev.message }}</p>
            </el-timeline-item>
          </el-timeline>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.cluster-name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.util-row {
  margin-bottom: 8px;
}

.fn-name {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.fn-desc {
  margin: 4px 0 12px;
  line-height: 1.6;
}

.mr-8 {
  margin-right: 8px;
}
</style>
