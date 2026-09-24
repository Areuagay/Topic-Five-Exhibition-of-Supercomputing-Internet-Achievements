<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { canViewResult } from '~/utils/experience-simulation'
import { formatDuration, formatNumber, statusText } from '~/composables/useFormat'
import type { Run } from '~/types'

const props = defineProps<{
  runs: Run[]
  domain: string
  selectedRunId: string
  submittedRunId: string
}>()

const emit = defineEmits<{
  'update:selectedRunId': [value: string]
  inspect: [value: string]
  result: [value: string]
}>()

const statusOrder = ['running', 'success', 'failed', 'stopped', 'queued']
const page = ref(1)
const pageSize = 8
const pageCount = computed(() => Math.max(1, Math.ceil(props.runs.length / pageSize)))
const visibleRuns = computed(() => props.runs.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(pageCount, count => { page.value = Math.min(page.value, count) })
watch(() => props.selectedRunId, id => {
  const index = props.runs.findIndex(run => run.run_id === id)
  if (index >= 0) page.value = Math.floor(index / pageSize) + 1
}, { immediate: true })

const statusCards = computed(() => {
  const counts: Record<string, number> = {}
  for (const run of props.runs) {
    const status = run.status === 'pending' ? 'queued' : run.status
    counts[status] = (counts[status] ?? 0) + 1
  }
  return statusOrder
    .map((status) => ({ status, count: counts[status] ?? 0 }))
})

function rowClass({ row }: { row: Run }): string {
  return `run-row-status-${row.status}${row.run_id === props.selectedRunId ? ' is-current' : ''}`
}

function selectRun(value: string): void {
  emit('update:selectedRunId', value)
}

function progressColor(status: string): string {
  if (status === 'success') return 'var(--scnet-success)'
  if (status === 'failed') return 'var(--scnet-danger)'
  if (status === 'stopped') return '#8995a5'
  if (status === 'queued' || status === 'pending') return '#b98745'
  return 'var(--scnet-primary)'
}

function inspect(value: string): void {
  emit('inspect', value)
}
</script>

<template>
  <div class="exp-monitor">
    <section v-if="statusCards.length" class="exp-status-strip" aria-label="运行状态统计">
      <dl class="exp-status-list">
        <div v-for="item in statusCards" :key="item.status" class="exp-status-item" :class="`is-${item.status}`">
          <dt>{{ statusText(item.status) }}</dt>
          <dd>{{ item.count }}</dd>
        </div>
      </dl>
    </section>

    <div v-if="runs.length" class="exp-table-wrap">
      <el-table
        :data="visibleRuns"
        :style="{ minHeight: `${48 + Math.min(runs.length, pageSize) * 64}px` }"
        row-key="run_id"
        :row-class-name="rowClass"
        size="default"
        @row-click="(row) => selectRun(row.run_id)"
      >
        <el-table-column label="运行记录" min-width="210" class-name="mono"><template #default="{ row }"><div class="run-identity">{{ row.run_id }}<span class="run-origin" :class="{ 'is-runtime': row.run_id === submittedRunId }">{{ row.run_id === submittedRunId ? '当前任务' : row.origin === 'runtime' ? '历史创建' : '预置' }}</span></div></template></el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag
              :class="{ 'queue-status-tag': ['queued', 'pending'].includes(row.status) }"
              :type="row.status === 'success' ? 'success' : row.status === 'running' ? 'primary' : row.status === 'failed' ? 'danger' : 'info'"
              effect="light"
              size="small"
            >
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="160">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.progress) || 0" :stroke-width="6" :color="progressColor(row.status)" />
          </template>
        </el-table-column>
        <el-table-column prop="cluster_name" label="集群" min-width="145"><template #default="{ row }"><div>{{ row.cluster_name }}</div><span class="run-job">Job {{ row.job_id }}</span></template></el-table-column>
        <el-table-column label="耗时" width="110" class-name="mono">
          <template #default="{ row }">{{ formatDuration(row.elapsed_seconds) }}</template>
        </el-table-column>
        <el-table-column label="核时" width="90" class-name="mono">
          <template #default="{ row }">{{ formatNumber(row.core_hours, 1) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" class-name="run-actions-cell">
          <template #default="{ row }">
            <div class="exp-row-actions">
              <button type="button" class="exp-link sc-action sc-action--ghost sc-action--small" @click.stop="inspect(row.run_id)">查看工作流</button>
              <button
                v-if="canViewResult(row as Run)"
                type="button"
                class="exp-link sc-action sc-action--ghost sc-action--small"
                @click.stop="emit('result', row.run_id)"
              >
                查看结果
              </button>
              <span v-else class="result-unavailable">{{ ['running', 'queued', 'pending'].includes(row.status) ? '完成后可查看' : '无结果文件' }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="monitor-pagination">
        <span>共 {{ runs.length }} 条记录</span>
        <nav aria-label="运行记录分页">
          <button type="button" class="sc-action sc-action--small" :disabled="page === 1" aria-label="上一页运行记录" @click="page--">上一页</button>
          <span aria-live="polite">{{ page }} / {{ pageCount }}</span>
          <button type="button" class="sc-action sc-action--small" :disabled="page === pageCount" aria-label="下一页运行记录" @click="page++">下一页</button>
        </nav>
      </div>
    </div>

    <el-empty v-else description="该场景暂无运行记录" :image-size="60" />
  </div>
</template>

<style scoped>
.run-identity { display: flex; align-items: flex-start; flex-direction: column; gap: 5px; }
.run-identity .run-origin { margin-left: 0; }
.run-job { font: 12px var(--scnet-font-mono); color: var(--scnet-text-muted); }
.monitor-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 4px 4px; color: var(--scnet-text-secondary); font-size: 13px; }
.monitor-pagination nav { display: flex; align-items: center; gap: 14px; }
.monitor-pagination nav > span { min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; }
@media (max-width: 600px) {
  .monitor-pagination { flex-wrap: wrap; }
  .monitor-pagination nav { width: 100%; justify-content: space-between; }
}
.run-origin { display: inline-block; margin-left: 8px; padding: 1px 6px; font: 11px var(--scnet-font-sans); background: #f1f4f8; border-radius: 4px; color: #68788f; }
.run-origin.is-runtime { background: #eaf3ff; color: #245da9; }
.result-unavailable { color: #7c899a; font-size: 12px; }
.queue-status-tag {
  --el-tag-text-color: #92632e;
  --el-tag-bg-color: #fff1dc;
  --el-tag-border-color: #ecd4af;
}

.exp-monitor {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.exp-status-strip {
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.exp-status-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  margin: 0;
}

.exp-status-item {
  padding: 12px 16px;
  border-left: 1px solid var(--scnet-divider);
}

.exp-status-item:first-child {
  border-left: 0;
}

.exp-status-item dt {
  font-size: 14px;
  color: var(--scnet-text-muted);
}

.exp-status-item dd {
  margin: 4px 0 0;
  font-family: var(--scnet-font-mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--scnet-text);
}

.exp-status-item.is-running dd {
  color: #1769d2;
}

.exp-status-item.is-success dd {
  color: var(--scnet-success);
}

.exp-status-item.is-failed dd {
  color: var(--scnet-danger);
}
.exp-status-item.is-queued dd, .exp-status-item.is-pending dd { color: #92632e; }
.exp-status-item.is-stopped dd { color: #8995a5; }
.exp-table-wrap :deep(.el-progress__text) { min-width: 48px; font-family: var(--scnet-font-mono); font-variant-numeric: tabular-nums; }

.exp-table-wrap {
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  padding: 8px 12px 12px;
  overflow: hidden;
}

.exp-table-wrap :deep(.el-table) {
  font-size: 14px;
  --el-table-row-hover-bg-color: var(--scnet-hover-bg);
}

.exp-table-wrap :deep(.el-table th.el-table__cell) {
  height: 48px;
  background: #f7f9fc;
  color: var(--scnet-text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.exp-table-wrap :deep(.el-table td.el-table__cell) {
  height: 56px;
  transition: background-color var(--scnet-hover-duration) var(--scnet-hover-easing);
}

.exp-table-wrap :deep(.el-table__row) {
  cursor: pointer;
}

.exp-table-wrap :deep(.run-row-status-success) {
  --el-table-row-hover-bg-color: var(--scnet-hover-success-bg);
}

.exp-table-wrap :deep(.run-row-status-failed) {
  --el-table-row-hover-bg-color: var(--scnet-hover-danger-bg);
}

.exp-table-wrap :deep(.run-row-status-queued),
.exp-table-wrap :deep(.run-row-status-pending) {
  --el-table-row-hover-bg-color: var(--scnet-hover-warning-bg);
}

.exp-table-wrap :deep(.run-row-status-stopped) {
  --el-table-row-hover-bg-color: var(--scnet-hover-neutral-bg);
}

.exp-table-wrap :deep(.el-table__body tr:hover > td.el-table__cell),
.exp-table-wrap :deep(.el-table__body tr.hover-row > td.el-table__cell),
.exp-table-wrap :deep(.el-table__body tr:focus-within > td.el-table__cell) {
  background-color: var(--el-table-row-hover-bg-color);
}

.exp-table-wrap :deep(.el-table .is-current > td.el-table__cell:first-child) {
  box-shadow: inset 3px 0 0 var(--scnet-primary);
  color: var(--scnet-primary);
  font-weight: 600;
}

.exp-table-wrap :deep(.el-table td.mono .cell) {
  font-family: var(--scnet-font-mono);
}

.exp-row-actions {
  display: flex;
  gap: 4px;
}

.exp-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--scnet-primary);
  font-size: 13px;
  cursor: pointer;
}

.exp-link:hover {
  color: var(--el-color-primary-light-3);
}
</style>
