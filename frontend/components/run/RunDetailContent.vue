<script setup lang="ts">
import { computed, ref } from 'vue'
import ResourceState from '~/components/run/ResourceState.vue'
import ScenarioWorkspace from '~/components/run/ScenarioWorkspace.vue'
import ArtifactActions from '~/components/run/ArtifactActions.vue'
import { metricUnit, quantityLabel, unitText } from '~/utils/workspace'
import { getStageLabels } from '~/config/scenario-experience'
import type { Artifact } from '~/types'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatTimestamp,
  levelText,
  statusText,
} from '~/composables/useFormat'

const props = defineProps<{
  domain: string
  runId: string
}>()

const scfMetric = ref<'total_energy' | 'energy_delta'>('total_energy')
const dataDetailsMounted = ref(false)

function mountDataDetails(event: Event): void {
  if ((event.currentTarget as HTMLDetailsElement).open) dataDetailsMounted.value = true
}

const { getRunDetail, getRunWorkflow, getRunMetrics, getRunLogs, getRunArtifacts } = useApi()
const appStore = useAppStore()

// Separate resources: failure in metrics/files must not discard the task summary.
const [summaryRequest, workflowRequest, metricsRequest, logsRequest, artifactsRequest] = await Promise.all([
  useAsyncData(`run-detail-${props.domain}-${props.runId}`, () => getRunDetail(props.domain, props.runId)),
  useAsyncData(`run-workflow-${props.domain}-${props.runId}`, () => getRunWorkflow(props.domain, props.runId), { server: false, lazy: true }),
  useAsyncData(`run-metrics-${props.domain}-${props.runId}`, () => getRunMetrics(props.domain, props.runId), { server: false, lazy: true }),
  useAsyncData(`run-logs-${props.domain}-${props.runId}`, () => getRunLogs(props.domain, props.runId), { server: false, lazy: true }),
  useAsyncData(`run-artifacts-${props.domain}-${props.runId}`, () => getRunArtifacts(props.domain, props.runId), { server: false, lazy: true }),
])
const { data: summary, pending: summaryPending, error: summaryError, refresh: refreshSummary } = summaryRequest
const { data: workflow, pending: workflowPending, error: workflowError, refresh: refreshWorkflow } = workflowRequest
const { data: metrics, pending: metricsPending, error: metricsError, refresh: refreshMetrics } = metricsRequest
const { data: logs, pending: logsPending, error: logsError, refresh: refreshLogs } = logsRequest
const { data: artifacts, pending: artifactsPending, error: artifactsError, refresh: refreshArtifacts } = artifactsRequest
// This view model retains the existing template while ignoring embedded legacy subresources.
const detail = computed(() => summary.value ? {
  ...summary.value,
  workflow: workflow.value ?? { nodes: [], edges: [] },
  metrics: { ...metrics.value, metrics: metrics.value?.metrics ?? [] },
  logs: logs.value ?? { lines: [], next_offset: 0, has_more: false },
  artifacts: artifacts.value ?? [],
} : null)

const clusterName = computed(() => {
  const map = appStore.clusterNameMap
  return (id: string) => map.get(id) ?? id
})

interface ExtraSection {
  key: string
  title: string
  kind: 'line' | 'bar' | 'cluster-progress' | 'kv'
  payload: unknown
}

interface ClusterProgressRow {
  cluster_id: string
  cluster_name?: string
  completed: number
  total: number
  throughput: number
  status: string
}

const EXTRA_TITLES: Record<string, string> = {
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

const ARTIFACT_TYPES: Record<string, string> = {
  dataset: '数据集',
  image: '图像',
  checkpoint: '检查点',
  report: '报告',
  log: '日志',
  model: '模型',
}

/** 工作流阶段中文标签按学科域从配置读取，组件不内嵌学科文案 */
const stageLabels = computed(() => getStageLabels(props.domain))

function stageText(stage?: string): string {
  if (!stage) return '-'
  return stageLabels.value[stage] ?? stage
}

function artifactType(type?: string): string {
  return (type && ARTIFACT_TYPES[type]) || '文件'
}

function clusterProgressPercent(row: ClusterProgressRow): number {
  if (!Number.isFinite(row.total) || row.total <= 0) return 0
  const value = (Number(row.completed) / Number(row.total)) * 100
  return Math.min(100, Math.max(0, Math.round(value)))
}

function toKv(obj: Record<string, unknown>): { label: string; value: unknown }[] {
  return Object.entries(obj).map(([key, value]) => ({
    label: KV_LABELS[key] ?? key,
    value,
  }))
}

const extraSections = computed<ExtraSection[]>(() => {
  const metrics = metricsRequest.data.value
  if (!metrics) return []
  const result: ExtraSection[] = []
  const known = new Set(['progress', 'metrics', 'domain_data', 'units', 'run_id', 'scenario_id', 'source_type', 'execution_mode'])
  for (const key of Object.keys(metrics)) {
    if (known.has(key)) continue
    const value = metrics[key]
    if ((key === 'scf_series' || key === 'energy_series') && Array.isArray(value)) {
      result.push({ key, title: EXTRA_TITLES[key] ?? key, kind: 'line', payload: value })
    } else if (key === 'gpu_metrics' && Array.isArray(value)) {
      result.push({ key, title: EXTRA_TITLES[key] ?? key, kind: 'bar', payload: value })
    } else if (key === 'cluster_progress' && Array.isArray(value)) {
      result.push({ key, title: EXTRA_TITLES[key] ?? key, kind: 'cluster-progress', payload: value })
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result.push({ key, title: EXTRA_TITLES[key] ?? key, kind: 'kv', payload: value })
    }
  }
  return result
})

const domainData = computed<unknown>(() => {
  const run = detail.value
  if (!run) return null
  const metrics = run.metrics as Record<string, unknown> | undefined
  const extra = (run as unknown as Record<string, unknown>).domain_data
  const value = metrics?.domain_data ?? extra
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null
  // Keep provenance in API payloads; omit implementation metadata from the exhibition view.
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['source_type', 'execution_mode'].includes(key)))
})

const domainDataKeyCount = computed(() => {
  const value = domainData.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  return Object.keys(value as Record<string, unknown>).length
})

function isObjectValue(value: unknown): boolean {
  return value !== null && typeof value === 'object'
}

const resourceItems = computed(() => {
  const run = detail.value
  if (!run) return []
  return [
    { label: '计算节点', value: run.nodes != null ? formatNumber(run.nodes) : '-' },
    { label: 'CPU 核数', value: run.cpu_cores != null ? `${formatNumber(run.cpu_cores)} 核` : '-' },
    { label: 'GPU 卡数', value: run.gpu_count != null ? `${formatNumber(run.gpu_count)} 卡` : '-' },
    { label: '内存', value: run.memory_gb != null ? `${formatNumber(run.memory_gb)} GB` : '-' },
    { label: '累计核时', value: run.core_hours != null ? formatNumber(run.core_hours, 1) : '-' },
  ]
})

const taskFacts = computed(() => {
  const run = detail.value
  if (!run) return []
  return [
    { label: '运行集群', value: run.cluster_name || run.cluster_id || '-' },
    { label: 'Job ID', value: run.job_id || '-' },
    { label: '应用场景', value: run.scenario_name || run.scenario_id || '-' },
    { label: '开始时间', value: formatTimestamp(run.start_time) },
    { label: '结束时间', value: run.end_time ? formatTimestamp(run.end_time) : '-' },
    { label: '运行耗时', value: formatDuration(run.elapsed_seconds) },
    { label: '当前阶段', value: stageText(run.current_stage) },
  ]
})

function baseChartStyle(): Record<string, unknown> {
  return {
    color: ['#1769d2', '#5e8fd2', '#b57820'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(37, 48, 68, 0.94)',
      borderWidth: 0,
      textStyle: { color: '#ffffff', fontSize: 12 },
    },
    legend: { bottom: 0, textStyle: { color: '#687588', fontSize: 11 } },
    grid: { left: 58, right: 24, top: 28, bottom: 46 },
  }
}

function lineOption(
  rows: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  yNames?: string[],
): Record<string, unknown> | null {
  if (!rows.length) return null
  return {
    ...baseChartStyle(),
    xAxis: {
      type: 'category',
      data: rows.map((row) => String(row[xKey] ?? '')),
      axisLine: { lineStyle: { color: '#dfe5ed' } },
      axisLabel: { color: '#7d899a' },
    },
    yAxis: {
      type: 'value',
      scale: true,
      splitLine: { lineStyle: { color: '#edf1f5' } },
      axisLabel: { color: '#7d899a' },
    },
    series: yKeys.map((key, index) => ({
      name: quantityLabel(yNames?.[index] ?? key, metricUnit(metrics.value, key)),
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2 },
      data: rows.map((row) => typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : null),
    })),
  }
}

function barOption(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!rows.length) return null
  return {
    ...baseChartStyle(),
    xAxis: {
      type: 'category',
      data: rows.map((row) => String(row.gpu_id ?? '')),
      axisLine: { lineStyle: { color: '#dfe5ed' } },
      axisLabel: { color: '#7d899a' },
    },
    grid: { left: 58, right: 78, top: 42, bottom: 46 },
    yAxis: [{
      type: 'value',
      max: 100,
      splitLine: { lineStyle: { color: '#edf1f5' } },
      axisLabel: { color: '#7d899a' },
    }, {
      type: 'value',
      scale: true,
      position: 'right',
      name: quantityLabel('温度', metricUnit(metrics.value, 'temperature')),
      splitLine: { show: false },
      axisLabel: { color: '#7d899a' },
    }],
    series: [
      { name: quantityLabel('利用率', metricUnit(metrics.value, 'utilization')), type: 'bar', barMaxWidth: 28, data: rows.map((row) => Number(row.utilization ?? 0)) },
      { name: quantityLabel('显存', metricUnit(metrics.value, 'memory_utilization')), type: 'bar', barMaxWidth: 28, data: rows.map((row) => Number(row.memory_utilization ?? 0)) },
      { name: quantityLabel('温度', metricUnit(metrics.value, 'temperature')), type: 'line', yAxisIndex: 1, smooth: true, data: rows.map((row) => typeof row.temperature === 'number' && Number.isFinite(row.temperature) ? row.temperature : null) },
    ],
  }
}

function chartOption(section: ExtraSection): Record<string, unknown> | null {
  const rows = section.payload as Record<string, unknown>[]
  if (section.kind === 'bar') return barOption(rows)
  if (section.key === 'scf_series') {
    const metricName = scfMetric.value === 'total_energy' ? '总能量' : '能量变化'
    const option = lineOption(rows, 'iteration', [scfMetric.value], [metricName])
    if (!option) return null
    const axis = option.yAxis as Record<string, unknown>
    return {
      ...option,
      legend: { show: false },
      grid: { left: 80, right: 24, top: 42, bottom: 36 },
      yAxis: { ...axis, scale: scfMetric.value === 'total_energy', name: quantityLabel(metricName, metricUnit(metrics.value, scfMetric.value)), position: 'left' },
    }
  }
  if (section.key === 'energy_series') {
    return lineOption(rows, 'time', ['kinetic', 'internal', 'hourglass'], ['动能', '内能', '沙漏能'])
  }
  return null
}
</script>

<template>
  <div class="run-detail-workspace">
    <ResourceState v-if="summaryPending || summaryError" :pending="summaryPending" :error="summaryError" label="任务摘要" @retry="refreshSummary()">
      <template #actions><NuxtLink class="summary-back" :to="`/domains/${domain}/runs`">返回运行列表</NuxtLink></template>
    </ResourceState>
    <section v-else-if="!detail" class="run-detail-empty" aria-live="polite">
      <strong>未找到该运行详情</strong>
      <p>该记录可能不存在，或尚未生成可查看的运行数据。</p>
      <NuxtLink :to="`/domains/${domain}/runs`">返回运行列表</NuxtLink>
    </section>

    <article v-else class="run-detail-record">
      <section class="run-overview-panel" aria-label="任务概览">
        <header class="run-record-header">
          <div class="run-record-identity">
            <div class="run-record-id-line">
              <span class="run-record-id mono" translate="no">{{ detail.run_id }}</span>
              <StatusBadge :status="detail.status" />
            </div>
              <p>{{ detail.scenario_name ?? detail.scenario_id }}</p>
          </div>

          <NuxtLink
            class="run-detail-back-link"
            :to="`/domains/${domain}/runs`"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>返回运行记录</span>
          </NuxtLink>
        </header>

        <section class="run-summary-strip" aria-label="运行摘要">
          <div class="run-progress-summary">
            <div class="run-summary-label-row">
              <span>总体进度</span>
              <strong>{{ detail.progress }}%</strong>
            </div>
            <div
              class="run-progress-track"
              role="progressbar"
              aria-label="总体进度"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="detail.progress"
            >
              <span :style="{ width: `${detail.progress}%` }" />
            </div>
          </div>
          <div class="run-summary-item">
            <span>当前阶段</span>
            <strong>{{ stageText(detail.current_stage) }}</strong>
          </div>
          <div class="run-summary-item">
            <span>运行集群</span>
            <strong>{{ detail.cluster_name || detail.cluster_id || '-' }}</strong>
          </div>
          <div class="run-summary-item">
            <span>运行耗时</span>
            <strong>{{ formatDuration(detail.elapsed_seconds) }}</strong>
          </div>
        </section>
      </section>

      <section class="run-workflow-panel" aria-label="工作流与资源消耗">
        <div class="run-dag-section">
          <ResourceState :pending="workflowPending" :error="workflowError" :empty="!detail.workflow.nodes.length" label="工作流" @retry="refreshWorkflow()">
            <WorkflowDag :nodes="detail.workflow.nodes" :edges="detail.workflow.edges" />
          </ResourceState>
        </div>

        <dl class="run-resource-strip" aria-label="资源消耗">
          <div v-for="item in resourceItems" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="run-data-panel" aria-label="运行数据">
        <div class="run-data-layout">
          <div class="run-data-primary">
            <section class="run-detail-section" aria-labelledby="run-metrics-title">
              <div class="run-section-heading">
                <div>
                  <h2 id="run-metrics-title">实时指标</h2>
                </div>
                <span>{{ detail.metrics.metrics.length }} 项</span>
              </div>
              <ResourceState :pending="metricsPending" :error="metricsError" :empty="!detail.metrics.metrics.length" label="运行指标" @retry="refreshMetrics()">
              <dl class="run-metric-grid">
                <div v-for="metric in detail.metrics.metrics" :key="metric.name">
                  <dt>{{ metric.label }}</dt>
                  <dd>
                    {{ formatNumber(metric.value, 2) }}<small v-if="unitText(metric.unit)">{{ unitText(metric.unit) }}</small>
                  </dd>
                </div>
              </dl>
              </ResourceState>
            </section>
          </div>

          <div class="run-data-secondary">
            <section class="run-detail-section" aria-labelledby="run-facts-title">
              <div class="run-section-heading">
                <div>
                  <h2 id="run-facts-title">任务信息</h2>
                </div>
              </div>
              <dl class="run-facts-grid">
                <div v-for="fact in taskFacts" :key="fact.label">
                  <dt>{{ fact.label }}</dt>
                  <dd>{{ fact.value }}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div v-if="extraSections.length" class="run-data-extras">
            <section
              v-for="section in extraSections"
              :key="section.key"
              class="run-detail-section"
              :aria-labelledby="`extra-${section.key}`"
            >
              <div class="run-section-heading">
                <div>
                  <h2 :id="`extra-${section.key}`">{{ section.title }}</h2>
                </div>
              </div>

              <div v-if="section.kind === 'line' || section.kind === 'bar'" class="run-chart-region">
                <div v-if="section.key === 'scf_series'" class="scf-metric-controls" role="group" aria-label="SCF 收敛指标切换">
                  <button type="button" :aria-pressed="scfMetric === 'total_energy'" @click="scfMetric = 'total_energy'">总能量</button>
                  <button type="button" :aria-pressed="scfMetric === 'energy_delta'" @click="scfMetric = 'energy_delta'">能量变化</button>
                </div>
                <BaseChart v-if="chartOption(section)" :option="chartOption(section)!" height="300px" />
                <div v-else class="run-inline-empty">暂无数据</div>
              </div>

              <div
                v-else-if="section.kind === 'cluster-progress'"
                class="run-cluster-progress-list"
                role="list"
                aria-label="各计算中心对接进度"
              >
                <div
                  v-for="row in section.payload as ClusterProgressRow[]"
                  :key="row.cluster_id"
                  class="run-cluster-progress-row"
                  role="listitem"
                >
                  <div class="run-cluster-center">
                    <span>计算中心</span>
                    <strong>{{ row.cluster_name || clusterName(row.cluster_id) }}</strong>
                  </div>

                  <div class="run-cluster-progress-main">
                    <div class="run-cluster-progress-copy">
                      <span>
                        已完成
                        <strong>{{ formatNumber(row.completed) }}</strong>
                        / {{ formatNumber(row.total) }}
                      </span>
                      <b>{{ clusterProgressPercent(row) }}%</b>
                    </div>
                    <div
                      class="run-cluster-progress-track"
                      role="progressbar"
                      :aria-label="`${row.cluster_name || clusterName(row.cluster_id)}对接进度`"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      :aria-valuenow="clusterProgressPercent(row)"
                    >
                      <span :style="{ width: `${clusterProgressPercent(row)}%` }" />
                    </div>
                  </div>

                  <div class="run-cluster-throughput">
                    <span>吞吐量</span>
                    <strong>{{ formatNumber(row.throughput, 1) }}</strong>
                  </div>

                  <div class="run-cluster-status" :class="`is-${row.status}`">
                    <span aria-hidden="true" />
                    {{ statusText(row.status) }}
                  </div>
                </div>
              </div>

              <dl v-else class="run-extra-kv">
                <div v-for="item in toKv(section.payload as Record<string, unknown>)" :key="item.label">
                  <dt>{{ item.label }}</dt>
                  <dd>
                    <DomainDataViewer v-if="isObjectValue(item.value)" :data="item.value" inline />
                    <template v-else>{{ formatNumber(item.value as string | number, 2) }}</template>
                  </dd>
                </div>
              </dl>
            </section>

          </div>
        </div>
      </section>

      <ScenarioWorkspace
        :key="`${domain}-${runId}`"
        :scenario-id="detail.scenario_id"
        :domain="domain"
        :data="metrics?.domain_data"
        :artifacts="artifacts ?? []"
        :artifacts-pending="artifactsPending"
        :artifacts-error="artifactsError"
        @retry-artifacts="refreshArtifacts()"
        :source-type="metrics?.source_type || detail.source_type"
        :pending="metricsPending"
        :error="metricsError"
        @retry="refreshMetrics()"
      />

      <details v-if="domainData" class="run-data-disclosure" @toggle="mountDataDetails">
        <summary>
          <span class="run-data-disclosure-title">查看数据明细</span>
          <span class="run-data-disclosure-meta">{{ domainDataKeyCount }} 组数据</span>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
        </summary>
        <div class="run-domain-data-body">
          <DomainDataViewer v-if="dataDetailsMounted" :data="domainData" />
        </div>
      </details>

      <section class="run-records-panel" aria-label="记录与产物">
        <section class="run-detail-section" aria-labelledby="run-logs-title">
          <div class="run-section-heading">
            <div>
              <h2 id="run-logs-title">运行日志</h2>
            </div>
            <span>{{ detail.logs.lines.length }} 条</span>
          </div>
          <ResourceState :pending="logsPending" :error="logsError" :empty="!detail.logs.lines.length" label="运行日志" @retry="refreshLogs()">
          <div v-if="detail.logs.lines.length" class="run-log-panel" role="log" aria-live="off">
            <div v-for="(line, index) in detail.logs.lines" :key="line.seq ?? index" class="run-log-line">
              <span class="run-log-prompt" aria-hidden="true">›</span>
              <time :datetime="line.timestamp">{{ formatTimestamp(line.timestamp, true) }}</time>
              <span class="run-log-level" :class="`is-${line.level.toLowerCase()}`">
                [{{ levelText(line.level) }}]
              </span>
              <span class="run-log-message">
                <span v-if="line.cluster_id" class="run-log-origin">[{{ clusterName(line.cluster_id) }}]</span>
                <span class="run-log-content">{{ line.message }}</span>
              </span>
            </div>
          </div>
          <div v-else class="run-inline-empty">暂无日志</div>
          </ResourceState>
        </section>

        <section class="run-detail-section run-artifacts-section" aria-labelledby="run-artifacts-title">
          <div class="run-section-heading">
            <div>
              <h2 id="run-artifacts-title">输出产物</h2>
            </div>
            <span>{{ detail.artifacts.length }} 项</span>
          </div>
          <ResourceState :pending="artifactsPending" :error="artifactsError" :empty="!detail.artifacts.length" label="输出产物" @retry="refreshArtifacts()">
          <div class="run-detail-table-region">
            <el-table :data="detail.artifacts" stripe empty-text="暂无输出产物">
              <el-table-column label="类型" width="100">
                <template #default="{ row }">
                  <span class="run-artifact-kind">{{ artifactType(row.type) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="名称" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <span class="mono" translate="no">{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="format" label="格式" width="90" />
              <el-table-column label="大小" width="110">
                <template #default="{ row }">{{ formatBytes(row.size) }}</template>
              </el-table-column>
              <el-table-column prop="storage_path" label="存储路径" min-width="280" show-overflow-tooltip>
                <template #default="{ row }">
                  <span class="mono" translate="no">{{ row.storage_path || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <ArtifactActions :artifact="row as Artifact" :source-type="detail.source_type" />
                </template>
              </el-table-column>
            </el-table>
          </div>
          </ResourceState>
        </section>
      </section>
    </article>
  </div>
</template>

<style scoped>
.summary-back { display:inline-flex; align-items:center; justify-content:center; min-height:44px; box-sizing:border-box; padding:0 16px; border:1px solid #dce3ec; border-radius:6px; background:#fff; color:var(--scnet-text-secondary); font-size:14px; text-decoration:none; }.summary-back:hover { color:var(--scnet-primary); border-color:#a9c3e8; }.summary-back:focus-visible { outline:2px solid var(--scnet-primary); outline-offset:2px; }
.scf-metric-controls { display: flex; gap: 10px; margin-bottom: 16px; }
.scf-metric-controls button { min-height: 44px; padding: 8px 16px; border: 1px solid #dfe3e8; border-radius: 6px; background: #fff; color: var(--scnet-text-secondary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.scf-metric-controls button[aria-pressed="true"] { color: var(--scnet-primary); background: #edf3fd; border-color: #85abe8; }
.scf-metric-controls button:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 2px; }
/* 运行详情采用展示型分层：宏观区域独立，字段内部保持平面化。 */
.run-download-link:focus-visible {
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: -3px;
}

.run-detail-back-link:focus-visible {
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: 2px;
}

.run-detail-workspace {
  min-width: 0;
  padding: clamp(24px, 2.6vw, 40px);
}

.run-detail-empty {
  min-height: 320px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 32px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  text-align: center;
}

.run-detail-empty strong {
  color: var(--scnet-text);
  font-size: 17px;
}

.run-detail-empty p {
  margin: 0;
  color: var(--scnet-text-muted);
  font-size: 13px;
}

.run-detail-empty a {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  color: var(--scnet-primary);
  font-size: 13px;
  font-weight: 600;
}

.run-detail-record {
  min-width: 0;
  display: grid;
  gap: clamp(18px, 1.8vw, 24px);
}

.run-overview-panel,
.run-workflow-panel,
.run-data-panel,
.run-records-panel {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 2px 8px rgb(31 45 61 / 3.5%);
}

.run-record-header {
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 20px 32px;
  border-bottom: 1px solid var(--scnet-divider);
}

.run-record-identity {
  min-width: 0;
}

.run-record-id-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.run-record-id {
  color: var(--scnet-text);
  font-size: 20px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.run-record-identity p {
  margin: 7px 0 0;
  color: var(--scnet-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.run-detail-back-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid #c9d9ec;
  border-radius: 7px;
  background: #f5f8fc;
  color: #3f5f86;
  font-size: 15px;
  font-weight: 600;
  touch-action: manipulation;
  transition:
    border-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
    color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.run-detail-back-link svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.run-detail-back-link:hover {
  border-color: #9ebbe0;
  background: #eaf2fb;
  color: var(--scnet-primary);
}

.run-summary-strip {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(260px, 1.7fr) repeat(3, minmax(130px, 1fr));
  background: #fbfcfe;
}

.run-progress-summary,
.run-summary-item {
  min-width: 0;
  display: grid;
  align-content: center;
  padding: 22px 26px;
  border-left: 1px solid var(--scnet-divider);
}

.run-progress-summary {
  border-left: 0;
}

.run-summary-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.run-summary-label-row span,
.run-summary-item span {
  color: var(--scnet-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.run-summary-label-row strong {
  color: var(--scnet-text);
  font-family: var(--scnet-font-mono);
  font-size: 18px;
  font-weight: 650;
}

.run-progress-track {
  height: 7px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 8px;
  background: #e8edf3;
}

.run-progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--scnet-primary);
}

.run-summary-item strong {
  overflow: hidden;
  margin-top: 5px;
  color: var(--scnet-text);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-dag-section {
  min-width: 0;
  border-bottom: 1px solid var(--scnet-divider);
}

.run-detail-section {
  min-width: 0;
}

.run-data-panel {
  padding: 0;
}

.run-data-layout {
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr;
}

.run-data-primary,
.run-data-secondary,
.run-data-extras {
  min-width: 0;
}

.run-data-primary {
  min-width: 0;
}

.run-data-secondary {
  border-top: 1px solid var(--scnet-divider);
}

.run-data-extras {
  grid-column: 1 / -1;
  border-top: 1px solid var(--scnet-divider);
}

.run-data-extras .run-detail-section + .run-detail-section {
  border-top: 1px solid var(--scnet-divider);
}

.run-data-disclosure {
  min-width: 0;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
}

.run-data-disclosure > summary {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 68px;
  padding: 18px 32px;
  border-radius: 10px;
  list-style: none;
  cursor: pointer;
  transition: var(--scnet-hover-transition);
}

.run-data-disclosure > summary::-webkit-details-marker { display: none; }
.run-data-disclosure > summary:hover { background: var(--scnet-hover-bg); }
.run-data-disclosure > summary:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 3px; }
.run-data-disclosure-title { font-size: 16px; font-weight: 600; color: var(--scnet-text); }
.run-data-disclosure-meta { margin-left: auto; font-size: 13px; color: var(--scnet-text-secondary); }
.run-data-disclosure svg { width: 16px; height: 16px; flex: 0 0 auto; fill: none; stroke: #687588; stroke-width: 1.6; }
.run-data-disclosure[open] > summary { border-bottom: 1px solid var(--scnet-divider); border-radius: 10px 10px 0 0; }
.run-data-disclosure[open] svg { transform: rotate(90deg); }

.run-domain-data-body {
  min-width: 0;
  padding: 22px 32px;
  background: #fff;
}

.run-domain-data-body :deep(.ddv-table-scroll) {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--scnet-divider);
  border-radius: 6px;
}

.run-domain-data-body :deep(.ddv-table) {
  width: 100%;
  font-variant-numeric: tabular-nums;
}

.run-domain-data-body :deep(.ddv > .ddv-object) {
  gap: 20px;
}

@media (min-width: 1100px) {
  .run-domain-data-body > :deep(.ddv > .ddv-object) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px 28px;
    align-items: start;
  }
  .run-domain-data-body > :deep(.ddv > .ddv-object > .ddv-facts) {
    grid-column: 1 / -1;
  }
}

.run-domain-data-body :deep(.ddv-table th) {
  background: #f5f7fa;
}

@media (max-width: 700px) {
  .run-domain-data-body {
    padding: 18px 20px;
  }
  .run-data-disclosure > summary { padding: 18px 20px; gap: 10px; }
}

.run-records-panel .run-detail-section + .run-detail-section {
  border-top: 1px solid var(--scnet-divider);
}

.run-section-heading {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 32px;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}

.run-section-heading h2 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 19px;
  font-weight: 650;
  line-height: 1.35;
}

.run-section-heading > span {
  flex: 0 0 auto;
  color: var(--scnet-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.run-resource-strip {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 0;
  background: #fbfcfe;
}

.run-resource-strip > div {
  min-width: 0;
  padding: 20px 24px;
  border-left: 1px solid var(--scnet-divider);
}

.run-resource-strip > div:first-child {
  border-left: 0;
}

.run-resource-strip dt,
.run-facts-grid dt,
.run-extra-kv dt,
.run-metric-grid dt {
  color: var(--scnet-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.run-resource-strip dt {
  font-size: 13px;
}

.run-resource-strip dd {
  overflow: hidden;
  margin: 5px 0 0;
  color: var(--scnet-text);
  font-family: var(--scnet-font-mono);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-metric-grid,
.run-facts-grid,
.run-extra-kv {
  display: grid;
  margin: 0;
  background: #fff;
}

.run-metric-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 18px 24px 22px;
  background: #fbfcfe;
}

.run-metric-grid > div {
  min-width: 0;
  padding: 16px 18px 17px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.run-metric-grid dd {
  margin: 7px 0 0;
  color: var(--scnet-text);
  font-family: var(--scnet-font-mono);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.run-metric-grid dd small {
  margin-left: 5px;
  color: var(--scnet-text-muted);
  font-family: var(--scnet-font-sans);
  font-size: 12px;
  font-weight: 500;
}

.run-facts-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.run-facts-grid > div,
.run-extra-kv > div {
  min-width: 0;
  padding: 18px 26px;
  border-left: 1px solid var(--scnet-divider);
  border-top: 1px solid var(--scnet-divider);
}

.run-facts-grid > div:nth-child(-n + 3),
.run-extra-kv > div:nth-child(-n + 2) {
  border-top: 0;
}

.run-facts-grid > div:nth-child(3n + 1),
.run-extra-kv > div:nth-child(2n + 1) {
  border-left: 0;
}

.run-facts-grid dd,
.run-extra-kv dd {
  overflow: hidden;
  margin: 6px 0 0;
  color: var(--scnet-text-secondary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-extra-kv {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.run-chart-region {
  min-width: 0;
  padding: 22px 26px;
  background: #fff;
}

.run-cluster-progress-list {
  min-width: 0;
  background: #fbfcfe;
}

.run-cluster-progress-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) minmax(300px, 2.3fr) minmax(100px, 0.55fr) 88px;
  align-items: center;
  gap: 30px;
  padding: 18px 32px;
  border-top: 1px solid var(--scnet-divider);
  background: #fff;
}

.run-cluster-progress-row:first-child {
  border-top: 0;
}

.run-cluster-center,
.run-cluster-throughput {
  min-width: 0;
}

.run-cluster-center > span,
.run-cluster-throughput > span {
  display: block;
  color: var(--scnet-text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.run-cluster-center strong,
.run-cluster-throughput strong {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: var(--scnet-text);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-cluster-throughput strong {
  font-family: var(--scnet-font-mono);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.run-cluster-progress-main {
  min-width: 0;
}

.run-cluster-progress-copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  color: var(--scnet-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.run-cluster-progress-copy strong,
.run-cluster-progress-copy b {
  color: var(--scnet-text-secondary);
  font-family: var(--scnet-font-mono);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.run-cluster-progress-copy b {
  flex: 0 0 auto;
  color: var(--scnet-primary);
  font-size: 13px;
}

.run-cluster-progress-track {
  height: 6px;
  margin-top: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: #e7edf4;
}

.run-cluster-progress-track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--scnet-primary);
}

.run-cluster-status {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 7px;
  color: var(--scnet-text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.run-cluster-status > span {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #9aa6b5;
}

.run-cluster-status.is-running > span { background: var(--scnet-primary); }
.run-cluster-status.is-success > span { background: #2f9b68; }
.run-cluster-status.is-failed > span { background: #cf4e4e; }
.run-cluster-status.is-queued > span,
.run-cluster-status.is-pending > span { background: #9aa6b5; }

.run-detail-table-region {
  min-width: 0;
  overflow-x: auto;
  background: #fff;
  overscroll-behavior-inline: contain;
}

.run-detail-table-region :deep(.el-table) {
  min-width: 760px;
  color: var(--scnet-text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.run-detail-table-region :deep(.el-table::before) {
  display: none;
}

.run-detail-table-region :deep(.el-table th.el-table__cell) {
  height: 48px;
  padding: 0;
  background: #f7f9fc;
  color: var(--scnet-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.run-detail-table-region :deep(.el-table td.el-table__cell) {
  height: 54px;
  padding: 0;
  border-bottom-color: var(--scnet-divider);
}

.run-detail-table-region :deep(.el-table .cell) {
  padding: 0 16px;
  line-height: 1.45;
}

.run-log-panel {
  max-height: 390px;
  overflow: auto;
  padding: 18px 24px 20px;
  background: #293241;
  font-family: var(--scnet-font-mono);
  font-size: 13px;
  line-height: 1.8;
  font-variant-numeric: tabular-nums;
}

.run-log-line {
  display: grid;
  grid-template-columns: 14px 148px 64px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  color: #d6dde7;
}

.run-log-prompt {
  color: #6eafe5;
  font-weight: 700;
  user-select: none;
}

.run-log-line time {
  color: #8997aa;
  font-variant-numeric: tabular-nums;
}

.run-log-level {
  color: #9ba7b8;
  font-weight: 700;
}

.run-log-level.is-info { color: #72b4f3; }
.run-log-level.is-debug { color: #aab4c3; }
.run-log-level.is-warning,
.run-log-level.is-warn { color: #e7be5d; }
.run-log-level.is-error { color: #ff8686; }

.run-log-message {
  min-width: 0;
  word-break: break-word;
}

.run-log-origin {
  margin-right: 10px;
  color: #aebed1;
  font-weight: 600;
  white-space: nowrap;
}

.run-log-content {
  color: #d7dee8;
}

.run-inline-empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--scnet-text-muted);
  font-size: 13px;
  background: #fff;
}

.run-artifact-kind {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid #d6e1ef;
  border-radius: 4px;
  background: #f6f9fd;
  color: #536a88;
  font-size: 11px;
  font-weight: 600;
}

.run-download-link {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--scnet-primary);
  font-size: 13px;
  font-weight: 600;
}

.run-download-link:hover {
  color: var(--el-color-primary-light-3);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.run-unavailable {
  color: var(--scnet-text-muted);
}

.run-artifacts-section {
  border-bottom: 0;
}

@media (max-width: 1000px) {
  .run-data-extras {
    grid-column: auto;
  }

  .run-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .run-summary-item:nth-child(3) {
    border-left: 0;
  }

  .run-summary-item:nth-child(n + 3) {
    border-top: 1px solid var(--scnet-divider);
  }

  .run-resource-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .run-resource-strip > div:nth-child(4) {
    border-left: 0;
  }

  .run-resource-strip > div:nth-child(n + 4) {
    border-top: 1px solid var(--scnet-divider);
  }

  .run-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .run-cluster-progress-row {
    grid-template-columns: minmax(130px, 0.75fr) minmax(240px, 2fr) minmax(90px, 0.5fr) 80px;
    gap: 20px;
    padding-right: 24px;
    padding-left: 24px;
  }

}

@media (max-width: 700px) {
  .run-detail-workspace {
    padding: 16px;
  }

  .run-detail-record {
    border-radius: 8px;
    gap: 14px;
  }

  .run-record-header,
  .run-section-heading {
    padding-right: 20px;
    padding-left: 20px;
  }

  .run-detail-back-link {
    margin-left: auto;
  }

  .run-summary-strip,
  .run-resource-strip,
  .run-metric-grid,
  .run-facts-grid,
  .run-extra-kv {
    grid-template-columns: 1fr;
  }

  .run-data-primary .run-metric-grid {
    grid-template-columns: 1fr;
  }

  .run-progress-summary,
  .run-summary-item,
  .run-resource-strip > div,
  .run-facts-grid > div,
  .run-extra-kv > div {
    border-left: 0;
  }

  .run-summary-item,
  .run-resource-strip > div,
  .run-facts-grid > div,
  .run-extra-kv > div {
    border-top: 1px solid var(--scnet-divider);
  }

  .run-facts-grid > div:nth-child(-n + 3),
  .run-extra-kv > div:nth-child(-n + 2) {
    border-top: 1px solid var(--scnet-divider);
  }

  .run-facts-grid > div:first-child,
  .run-extra-kv > div:first-child {
    border-top: 0;
  }

  .run-log-panel {
    padding: 16px;
  }

  .run-cluster-progress-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 13px 18px;
    padding: 18px 20px;
  }

  .run-cluster-center {
    grid-column: 1;
    grid-row: 1;
  }

  .run-cluster-progress-main {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .run-cluster-throughput {
    grid-column: 1;
    grid-row: 3;
  }

  .run-cluster-status {
    grid-column: 2;
    grid-row: 1;
  }

  .run-log-line {
    grid-template-columns: 14px 1fr auto;
    gap: 2px 8px;
    margin-bottom: 10px;
  }

  .run-log-prompt {
    grid-row: 1 / 3;
  }

  .run-log-message {
    grid-column: 2 / -1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .run-detail-back-link {
    transition-duration: 0.01ms;
  }
}
</style>
