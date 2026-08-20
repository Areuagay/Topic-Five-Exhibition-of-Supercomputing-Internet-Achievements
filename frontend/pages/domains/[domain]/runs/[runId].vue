<script setup lang="ts">
import { computed } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatTimestamp,
  levelText,
} from '~/composables/useFormat'

const route = useRoute()
const domain = String(route.params.domain)
const runId = String(route.params.runId)

const { getRunDetail, getIndex } = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) {
  appStore.setIndex(indexData.value.domains, indexData.value.clusters)
}

const { data: detail } = await useAsyncData(
  `run-detail-${domain}-${runId}`,
  () => getRunDetail(domain, runId),
  { default: () => null },
)

const domainInfo = computed(() => appStore.domains.find((d) => d.domain === domain))
const clusterName = computed(() => {
  const map = appStore.clusterNameMap
  return (id: string) => map.get(id) ?? id
})

/* ============ 域附加指标区块 ============ */
interface ExtraSection {
  key: string
  title: string
  kind: 'line' | 'bar' | 'table' | 'kv'
  payload: unknown
}

const TITLES: Record<string, string> = {
  scf_series: 'SCF 自洽收敛过程',
  gpu_metrics: 'GPU 利用率 / 显存 / 温度',
  energy_series: '碰撞能量曲线',
  cluster_progress: '跨中心对接进度',
  score_summary: '对接分数汇总',
  batch_progress: '批量计算进度',
  cluster_summary: '集群仿真汇总',
}

const KV_LABELS: Record<string, string> = {
  best_score: '最佳分数',
  average_score: '平均分数',
  median_score: '中位分数',
  qualified_count: '合格分子数',
  total_materials: '总材料数',
  completed_materials: '已完成材料',
  converged_materials: '已收敛材料',
  failed_materials: '失败材料',
  materials_per_hour: '每小时材料数',
  qualified_candidates: '合格候选',
  active_uavs: '活跃无人机',
  completed_uavs: '已完成无人机',
  collision_count: '碰撞次数',
  average_formation_error: '平均编队误差',
}

function toKv(obj: Record<string, unknown>): { label: string; value: unknown }[] {
  return Object.entries(obj).map(([k, v]) => ({
    label: KV_LABELS[k] ?? k,
    value: v,
  }))
}

const extraSections = computed<ExtraSection[]>(() => {
  const m = detail.value?.metrics
  if (!m) return []
  const out: ExtraSection[] = []
  const known = new Set(['progress', 'metrics'])
  for (const key of Object.keys(m)) {
    if (known.has(key)) continue
    const val = m[key]
    if ((key === 'scf_series' || key === 'energy_series') && Array.isArray(val)) {
      out.push({ key, title: TITLES[key] ?? key, kind: 'line', payload: val })
    } else if (key === 'gpu_metrics' && Array.isArray(val)) {
      out.push({ key, title: TITLES[key] ?? key, kind: 'bar', payload: val })
    } else if (key === 'cluster_progress' && Array.isArray(val)) {
      out.push({ key, title: TITLES[key] ?? key, kind: 'table', payload: val })
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out.push({ key, title: TITLES[key] ?? key, kind: 'kv', payload: val })
    }
  }
  return out
})

function lineOption(
  rows: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  yNames?: string[],
): Record<string, unknown> | null {
  if (!rows.length) return null
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 60, right: 24, top: 32, bottom: 44 },
    xAxis: { type: 'category', data: rows.map((r) => String(r[xKey] ?? '')) },
    yAxis: { type: 'value' },
    series: yKeys.map((k, i) => ({
      name: yNames?.[i] ?? k,
      type: 'line',
      smooth: true,
      data: rows.map((r) => Number(r[k] ?? 0)),
    })),
  }
}

function barOption(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!rows.length) return null
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 48, right: 24, top: 32, bottom: 44 },
    xAxis: { type: 'category', data: rows.map((r) => String(r.gpu_id ?? '')) },
    yAxis: { type: 'value', max: 100 },
    series: [
      { name: '利用率 %', type: 'bar', data: rows.map((r) => Number(r.utilization ?? 0)) },
      { name: '显存 %', type: 'bar', data: rows.map((r) => Number(r.memory_utilization ?? 0)) },
      { name: '温度 ℃', type: 'line', data: rows.map((r) => Number(r.temperature ?? 0)) },
    ],
  }
}

const chartOption = (s: ExtraSection): Record<string, unknown> | null => {
  const rows = s.payload as Record<string, unknown>[]
  if (s.kind === 'bar') return barOption(rows)
  if (s.key === 'scf_series') {
    return lineOption(rows, 'iteration', ['total_energy', 'energy_delta'], ['总能量', '能量变化'])
  }
  if (s.key === 'energy_series') {
    return lineOption(rows, 'time', ['kinetic', 'internal', 'hourglass'], ['动能', '内能', '沙漏能'])
  }
  return null
}

/* ============ 任务信息 ============ */
const descriptions = computed(() => {
  const d = detail.value
  if (!d) return []
  return [
    { label: '集群', value: d.cluster_name || d.cluster_id || '-' },
    { label: 'Job ID', value: d.job_id || '-' },
    { label: '节点 / CPU / GPU', value: `${d.nodes ?? '-'} / ${d.cpu_cores ?? '-'} 核 / ${d.gpu_count ?? '-'} 卡` },
    { label: '内存', value: d.memory_gb ? `${d.memory_gb} GB` : '-' },
    { label: '核时', value: d.core_hours != null ? formatNumber(d.core_hours) : '-' },
    { label: '开始时间', value: formatTimestamp(d.start_time) },
    { label: '结束时间', value: d.end_time ? formatTimestamp(d.end_time) : '-' },
    { label: '耗时', value: formatDuration(d.elapsed_seconds) },
    { label: '数据来源', value: d.source_type || '-' },
  ]
})

const ARTIFACT_ICONS: Record<string, string> = {
  dataset: '📊',
  image: '🖼️',
  checkpoint: '💾',
  report: '📄',
  log: '📜',
  model: '🧠',
}

function artifactIcon(type?: string): string {
  return (type && ARTIFACT_ICONS[type]) || '📦'
}

function progressStatus(p: number): 'success' | 'exception' {
  if (detail.value?.status === 'failed') return 'exception'
  return p >= 100 ? 'success' : 'success'
}
</script>

<template>
  <div>
    <el-breadcrumb separator="/" class="mb-16">
      <el-breadcrumb-item :to="{ path: '/' }">总览</el-breadcrumb-item>
      <el-breadcrumb-item :to="{ path: `/domains/${domain}/scenarios` }">
        {{ domainInfo?.name ?? domain }}
      </el-breadcrumb-item>
      <el-breadcrumb-item :to="{ path: `/domains/${domain}/runs` }">运行记录</el-breadcrumb-item>
      <el-breadcrumb-item class="mono">{{ runId }}</el-breadcrumb-item>
    </el-breadcrumb>

    <el-empty v-if="!detail" description="未找到该运行详情" />

    <template v-if="detail">
      <!-- 头部 -->
      <div class="page-header">
        <div>
          <h1 class="page-title flex gap-12">
            <span class="mono">{{ detail.run_id }}</span>
            <StatusBadge :status="detail.status" />
            <el-tag v-if="detail.execution_mode === 'simulated' || detail.source_type === 'simulated'" size="small" type="warning" effect="plain">
              模拟数据
            </el-tag>
          </h1>
          <p class="page-subtitle">
            {{ detail.scenario_name ?? detail.scenario_id }} · 当前阶段：{{ detail.current_stage || '-' }}
          </p>
        </div>
        <el-button @click="$router.push(`/domains/${domain}/runs`)">返回列表</el-button>
      </div>

      <!-- 进度 -->
      <el-card shadow="never" class="mb-16">
        <div class="flex-between wrap gap-16">
          <div style="width: 60%; min-width: 260px">
            <div class="flex-between mb-8">
              <span class="muted">总体进度</span>
              <b>{{ detail.progress }}%</b>
            </div>
            <el-progress
              :percentage="detail.progress"
              :status="progressStatus(detail.progress)"
              :stroke-width="16"
            />
          </div>
          <div class="flex gap-16 wrap">
            <div>
              <div class="muted">执行模式</div>
              <b>{{ detail.execution_mode || '-' }}</b>
            </div>
            <div>
              <div class="muted">集群</div>
              <b>{{ detail.cluster_name || detail.cluster_id }}</b>
            </div>
            <div>
              <div class="muted">耗时</div>
              <b>{{ formatDuration(detail.elapsed_seconds) }}</b>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 任务信息 -->
      <h2 class="section-title">任务信息</h2>
      <el-card shadow="never">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item v-for="(item, i) in descriptions" :key="i" :label="item.label">
            {{ item.value }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 实时指标 -->
      <h2 class="section-title">实时指标</h2>
      <MetricCards :metrics="detail.metrics.metrics" />

      <!-- 域附加指标 -->
      <template v-for="s in extraSections" :key="s.key">
        <h2 class="section-title">{{ s.title }}</h2>
        <div v-if="s.kind === 'line' || s.kind === 'bar'" class="chart-box">
          <BaseChart v-if="chartOption(s)" :option="chartOption(s)!" height="300px" />
          <el-empty v-else description="暂无数据" :image-size="60" />
        </div>
        <el-card v-else-if="s.kind === 'table'" shadow="never">
          <el-table :data="s.payload as Record<string, unknown>[]" border size="small" stripe>
            <el-table-column
              v-for="col in Object.keys((s.payload as Record<string, unknown>[])[0] ?? {})"
              :key="col"
              :prop="col"
              :label="col"
              min-width="110"
            />
          </el-table>
        </el-card>
        <el-card v-else-if="s.kind === 'kv'" shadow="never">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item
              v-for="(kv, i) in toKv(s.payload as Record<string, unknown>)"
              :key="i"
              :label="kv.label"
            >
              {{ formatNumber(kv.value, 2) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </template>

      <!-- 工作流 DAG -->
      <h2 class="section-title">工作流 DAG</h2>
      <WorkflowDag :nodes="detail.workflow.nodes" :edges="detail.workflow.edges" />

      <!-- 日志 -->
      <h2 class="section-title">运行日志</h2>
      <div class="log-panel">
        <div v-for="(line, i) in detail.logs.lines" :key="i" class="log-line">
          <span class="log-time">{{ formatTimestamp(line.timestamp, true) }}</span>
          <span :class="`log-level log-level-${line.level}`">{{ levelText(line.level) }}</span>
          <span class="log-msg">
            <el-tag v-if="line.cluster_id" size="small" effect="dark" class="log-cluster">
              {{ clusterName(line.cluster_id) }}
            </el-tag>
            {{ line.message }}
          </span>
        </div>
        <el-empty
          v-if="!detail.logs.lines.length"
          description="暂无日志"
          :image-size="40"
          style="background: transparent"
        />
      </div>

      <!-- 产物 -->
      <h2 class="section-title">输出产物</h2>
      <el-card shadow="never">
        <el-table :data="detail.artifacts" border size="small" stripe>
          <el-table-column label="类型" width="70">
            <template #default="{ row }">{{ artifactIcon(row.type) }}</template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="220" class-name="mono" show-overflow-tooltip />
          <el-table-column prop="format" label="格式" width="90" />
          <el-table-column label="大小" width="100">
            <template #default="{ row }">{{ formatBytes(row.size) }}</template>
          </el-table-column>
          <el-table-column prop="storage_path" label="存储路径" min-width="260" class-name="mono" show-overflow-tooltip />
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="row.download_url" size="small" type="primary" link tag="a" :href="row.download_url" target="_blank">
                下载
              </el-button>
              <span v-else class="muted">-</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.log-cluster {
  margin-right: 8px;
}
</style>
