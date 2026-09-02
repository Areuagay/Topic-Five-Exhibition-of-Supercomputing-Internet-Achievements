<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import { formatDuration, formatNumber, statusText } from '~/composables/useFormat'

const route = useRoute()
const domain = String(route.params.domain)

const { getRuns, getIndex, getScenarios } = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) {
  appStore.setIndex(indexData.value.domains, indexData.value.clusters)
}

const { data: runs } = await useAsyncData(`runs-${domain}`, () => getRuns(domain), { default: () => [] })
const { data: scenarios } = await useAsyncData(`scenarios-${domain}`, () => getScenarios(domain), { default: () => [] })

const domainInfo = computed(() => appStore.domains.find((d) => d.domain === domain))

const keyword = ref('')
const statusFilter = ref('')
const scenarioFilter = ref(String(route.query.scenario ?? ''))

watch(
  () => route.query.scenario,
  (v) => {
    scenarioFilter.value = String(v ?? '')
  },
)

const statusOptions = computed(() => {
  const set = new Set<string>()
  for (const r of runs.value ?? []) set.add(r.status)
  return [...set]
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return (runs.value ?? []).filter((r) => {
    if (statusFilter.value && r.status !== statusFilter.value) return false
    if (scenarioFilter.value && r.scenario_id !== scenarioFilter.value) return false
    if (kw) {
      const hay = `${r.run_id} ${r.scenario_name} ${r.job_id} ${r.cluster_name}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const statusCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const r of runs.value ?? []) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }
  return counts
})

const statusStatCards = computed(() => {
  const order = ['running', 'success', 'failed', 'stopped', 'pending', 'queued']
  const items: { status: string; count: number }[] = []
  for (const s of order) {
    if (counts(s) > 0) items.push({ status: s, count: counts(s) })
  }
  return items
  function counts(s: string): number {
    return statusCounts.value[s] ?? 0
  }
})

function progressType(p: number): 'success' | 'exception' | 'warning' {
  if (p >= 100) return 'success'
  if (p < 30) return 'warning'
  return 'success'
}

function runRowClassName({ row }: { row: { status?: string } }): string {
  return `run-row-status-${row.status || 'unknown'}`
}
</script>

<template>
  <section class="run-page">
    <section class="run-surface">
        <DomainSurfaceHeader
          :title="domainInfo?.name ?? domain"
        />

      <ScenarioSelector
        :scenarios="scenarios ?? []"
        model-value=""
        :domain="domain"
        runs-active
      />

      <div class="run-workspace">
        <section class="run-record-panel">
          <section class="run-status-strip" aria-label="运行状态统计">
              <div class="run-status-heading">
                <h2>运行记录</h2>
              </div>

            <dl class="run-status-list">
              <div
                v-for="item in statusStatCards"
                :key="item.status"
                class="run-status-item"
                :class="`is-${item.status}`"
              >
                <dt>{{ statusText(item.status) }}</dt>
                <dd>{{ item.count }}<small>条</small></dd>
              </div>
            </dl>
          </section>

          <div class="run-filter-bar" role="search" aria-label="筛选运行记录">
            <label class="run-filter-field run-search-field">
              <span>关键词</span>
              <el-input
                v-model="keyword"
                name="run-search"
                aria-label="搜索运行记录"
                autocomplete="off"
                placeholder="Run ID、场景、Job ID 或集群…"
                clearable
              >
                <template #prefix>
                  <span class="run-search-icon" aria-hidden="true" />
                </template>
              </el-input>
            </label>

            <label class="run-filter-field run-status-filter">
              <span>状态</span>
              <el-select
                v-model="statusFilter"
                name="run-status"
                aria-label="按状态筛选"
                placeholder="全部状态"
                clearable
              >
                <el-option v-for="s in statusOptions" :key="s" :label="statusText(s)" :value="s" />
              </el-select>
            </label>

            <label class="run-filter-field run-scenario-filter">
              <span>应用场景</span>
              <el-select
                v-model="scenarioFilter"
                name="run-scenario"
                aria-label="按场景筛选"
                placeholder="全部场景"
                clearable
              >
                <el-option
                  v-for="sc in scenarios ?? []"
                  :key="sc.id"
                  :label="sc.name"
                  :value="sc.id"
                />
              </el-select>
            </label>

            <p
              class="run-filter-result"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>{{ filtered.length }}</strong> 条记录
            </p>
          </div>

          <section class="run-table-region" aria-label="运行记录列表">
            <el-table
              :data="filtered"
              :row-class-name="runRowClassName"
              stripe
              size="default"
              empty-text="未找到匹配的运行记录"
            >
        <el-table-column label="Run ID" min-width="170">
          <template #default="{ row }">
            <NuxtLink
              v-if="row.has_detail"
              class="run-table-link mono"
              :to="`/domains/${domain}/runs/${row.run_id}`"
              translate="no"
            >
              {{ row.run_id }}
            </NuxtLink>
            <span v-else class="mono muted" translate="no">{{ row.run_id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="scenario_name" label="场景" min-width="150" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusBadge :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="进度" width="160">
          <template #default="{ row }">
            <el-progress
              :percentage="row.progress"
              :status="row.status === 'failed' ? 'exception' : progressType(row.progress)"
              :stroke-width="10"
            />
          </template>
        </el-table-column>
        <el-table-column prop="cluster_name" label="集群" min-width="140" show-overflow-tooltip />
        <el-table-column prop="job_id" label="Job ID" width="110" class-name="mono" />
        <el-table-column label="耗时" width="110">
          <template #default="{ row }">{{ formatDuration(row.elapsed_seconds) }}</template>
        </el-table-column>
        <el-table-column label="核时" width="100">
          <template #default="{ row }">{{ formatNumber(row.core_hours) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <NuxtLink
              v-if="row.has_detail"
              class="run-table-link run-detail-link"
              :to="`/domains/${domain}/runs/${row.run_id}`"
            >
              详情
            </NuxtLink>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
            </el-table>
          </section>
        </section>
      </div>
    </section>
  </section>
</template>

<style scoped>
.run-page {
  width: 100%;
  min-width: 0;
}

.run-surface {
  overflow: hidden;
  border: 1px solid var(--scnet-divider);
  border-radius: 12px;
  background: #f5f7fa;
  box-shadow: 0 2px 8px rgba(31, 45, 61, 0.045);
}

.run-table-link:focus-visible {
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: 3px;
}

.run-workspace {
  padding: clamp(24px, 2.6vw, 40px);
}

.run-record-panel {
  overflow: hidden;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
}

.run-status-strip {
  display: flex;
  min-width: 0;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}

.run-status-heading {
  flex: 0 0 190px;
  padding: 28px 32px;
}

.run-status-heading h2 {
  margin: 0;
  color: var(--scnet-text);
    font-size: 19px;
  font-weight: 650;
  line-height: 1.35;
}

.run-status-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  flex: 1 1 auto;
  margin: 0;
}

.run-status-item {
  position: relative;
  min-width: 0;
  display: grid;
  align-content: center;
  gap: 5px;
  padding: 24px clamp(14px, 1.4vw, 24px);
  border-left: 1px solid var(--scnet-divider);
  font-variant-numeric: tabular-nums;
}

.run-status-item::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 2px;
  height: 24px;
  background: #8f9bab;
  transform: translateY(-50%);
}

.run-status-item.is-running::before { background: #0b5bd3; }
.run-status-item.is-success::before { background: #2f9b59; }
.run-status-item.is-failed::before { background: #d94a4a; }
.run-status-item.is-stopped::before,
.run-status-item.is-pending::before,
.run-status-item.is-queued::before { background: #c17a18; }

.run-status-item dt {
  overflow: hidden;
  color: var(--scnet-text-secondary);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-status-item dd {
  margin: 0;
  color: var(--scnet-text);
  font-family: var(--scnet-font-mono);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.15;
}

.run-status-item dd small {
  margin-left: 4px;
  color: var(--scnet-text-muted);
  font-family: var(--scnet-font-sans);
  font-size: 12px;
  font-weight: 400;
}

.run-filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 22px 32px;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fbfcfe;
}

.run-filter-field {
  min-width: 0;
  display: grid;
  gap: 7px;
}

.run-filter-field > span {
  color: var(--scnet-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.run-search-field { width: min(360px, 32vw); }
.run-status-filter { width: 160px; }
.run-scenario-filter { width: 230px; }

.run-filter-field :deep(.el-input__wrapper),
.run-filter-field :deep(.el-select__wrapper) {
  min-height: 44px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #d7dee8 inset;
}

.run-filter-field :deep(.el-input__wrapper:hover),
.run-filter-field :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px #a9b8cc inset;
}

.run-filter-field :deep(.el-input__wrapper.is-focus),
.run-filter-field :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--scnet-primary) inset;
}

.run-search-icon {
  position: relative;
  width: 14px;
  height: 14px;
  display: inline-block;
  border: 1.5px solid #718096;
  border-radius: 50%;
}

.run-search-icon::after {
  content: '';
  position: absolute;
  right: -4px;
  bottom: -3px;
  width: 6px;
  height: 1.5px;
  border-radius: 2px;
  background: #718096;
  transform: rotate(45deg);
  transform-origin: center;
}

.run-filter-result {
  margin: 0 0 10px auto;
  color: var(--scnet-text-muted);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.run-filter-result strong {
  color: var(--scnet-text);
  font-family: var(--scnet-font-mono);
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
}

.run-table-region {
  overflow-x: auto;
  background: #fff;
  overscroll-behavior-inline: contain;
}

.run-table-region :deep(.el-table) {
  min-width: 1180px;
  color: var(--scnet-text-secondary);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.run-table-region :deep(.el-table::before) {
  display: none;
}

.run-table-region :deep(.el-table th.el-table__cell) {
  height: 48px;
  padding: 0;
  background: #f7f9fc;
  color: var(--scnet-text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.run-table-region :deep(.el-table td.el-table__cell) {
  height: 56px;
  padding: 0;
  border-bottom-color: var(--scnet-divider);
  transition: background-color 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.run-table-region :deep(.el-table .cell) {
  padding: 0 16px;
  line-height: 1.45;
}

.run-table-region :deep(.el-table__row:hover > td.el-table__cell) {
  background: #f7f9fc;
}

.run-table-region :deep(.el-table__body tr.run-row-status-running:hover > td.el-table__cell) {
  background: #f2f6fc;
}

.run-table-region :deep(.el-table__body tr.run-row-status-success:hover > td.el-table__cell) {
  background: #f2f8f4;
}

.run-table-region :deep(.el-table__body tr.run-row-status-failed:hover > td.el-table__cell) {
  background: #fdf3f3;
}

.run-table-region :deep(.el-table__body tr.run-row-status-queued:hover > td.el-table__cell),
.run-table-region :deep(.el-table__body tr.run-row-status-pending:hover > td.el-table__cell) {
  background: #faf6ef;
}

.run-table-region :deep(.el-table__body tr.run-row-status-stopped:hover > td.el-table__cell) {
  background: #f6f7f9;
}

.run-table-region :deep(td.mono.el-table__cell) {
  color: var(--scnet-text-secondary);
  font-family: var(--scnet-font-mono);
  font-size: 13px;
}

.run-table-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--scnet-primary);
  font-weight: 600;
  text-decoration: none;
  touch-action: manipulation;
}

.run-table-link:hover {
  color: var(--el-color-primary-light-3);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.run-detail-link {
  min-width: 44px;
  justify-content: center;
  font-family: var(--scnet-font-sans);
  font-size: 13px;
}

@media (max-width: 900px) {
  .run-status-strip {
    display: block;
  }

  .run-status-heading {
    padding-bottom: 12px;
  }

  .run-status-list {
    border-top: 1px solid var(--scnet-divider);
  }

  .run-filter-bar {
    flex-wrap: wrap;
  }

  .run-search-field { width: min(100%, 360px); }
  .run-filter-result { width: 100%; margin: 0; }
}

@media (max-width: 760px) {
  .run-workspace {
    padding: 16px;
  }

  .run-record-panel {
    border-radius: 8px;
  }

  .run-status-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .run-status-item:nth-child(odd) {
    border-left: 0;
  }

  .run-status-item:nth-child(n + 3) {
    border-top: 1px solid var(--scnet-divider);
  }

  .run-status-item:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }

  .run-filter-bar {
    display: grid;
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .run-search-field,
  .run-status-filter,
  .run-scenario-filter {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .run-table-region :deep(.el-table td.el-table__cell) {
    transition-duration: 0.01ms;
  }
}
</style>
