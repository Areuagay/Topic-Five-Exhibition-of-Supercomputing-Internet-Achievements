<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import { formatDuration, formatNumber, statusText } from '~/composables/useFormat'
import type { Run } from '~/types'

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
</script>

<template>
  <div>
    <el-breadcrumb separator="/" class="mb-16">
      <el-breadcrumb-item :to="{ path: '/' }">总览</el-breadcrumb-item>
      <el-breadcrumb-item>{{ domainInfo?.name ?? domain }}</el-breadcrumb-item>
      <el-breadcrumb-item>运行记录</el-breadcrumb-item>
    </el-breadcrumb>

    <div class="page-header">
      <div>
        <h1 class="page-title">{{ domainInfo?.name ?? domain }} · 运行记录</h1>
        <p class="page-subtitle">共 {{ filtered.length }} 条（命中筛选）</p>
      </div>
      <el-button @click="$router.push(`/domains/${domain}/scenarios`)">返回场景</el-button>
    </div>

    <!-- 状态统计 -->
    <div class="stat-grid">
      <div v-for="item in statusStatCards" :key="item.status" class="stat-card">
        <div class="stat-label">{{ statusText(item.status) }}</div>
        <div class="stat-value">
          {{ item.count }}<span class="stat-unit">条</span>
        </div>
      </div>
    </div>

    <!-- 筛选工具栏 -->
    <el-card shadow="never" class="mb-16">
      <div class="flex gap-12 wrap">
        <el-input
          v-model="keyword"
          placeholder="搜索 run_id / 场景 / job_id / 集群"
          clearable
          style="width: 280px"
        >
          <template #prefix>🔍</template>
        </el-input>
        <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 140px">
          <el-option v-for="s in statusOptions" :key="s" :label="statusText(s)" :value="s" />
        </el-select>
        <el-select v-model="scenarioFilter" placeholder="场景" clearable style="width: 200px">
          <el-option
            v-for="sc in scenarios ?? []"
            :key="sc.id"
            :label="sc.name"
            :value="sc.id"
          />
        </el-select>
      </div>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never">
      <el-table :data="filtered" border stripe size="default" :empty-text="'无匹配记录'">
        <el-table-column label="Run ID" min-width="170">
          <template #default="{ row }">
            <el-link
              v-if="row.has_detail"
              type="primary"
              :underline="false"
              @click="$router.push(`/domains/${domain}/runs/${row.run_id}`)"
            >
              <span class="mono">{{ row.run_id }}</span>
            </el-link>
            <span v-else class="mono muted">{{ row.run_id }}</span>
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
        <el-table-column prop="job_id" label="Job ID" width="100" class-name="mono" />
        <el-table-column label="耗时" width="110">
          <template #default="{ row }">{{ formatDuration(row.elapsed_seconds) }}</template>
        </el-table-column>
        <el-table-column label="核时" width="100">
          <template #default="{ row }">{{ formatNumber(row.core_hours) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.has_detail"
              size="small"
              type="primary"
              link
              @click="$router.push(`/domains/${domain}/runs/${row.run_id}`)"
            >
              详情
            </el-button>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
