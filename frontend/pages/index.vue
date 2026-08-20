<script setup lang="ts">
import { computed } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import { formatNumber, formatPercent } from '~/composables/useFormat'
import type { MultiCluster } from '~/types'

const { getIndex, getClusters } = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
const { data: clusters } = await useAsyncData('clusters', () => getClusters(), { default: () => [] })

const ICONS: Record<string, string> = {
  geo: '🌍', llm: '🤖', auto: '🚗', uav: '🚁', drug: '💊', dft: '⚛️', multi: '🔗',
}

const domains = computed(() => indexData.value?.domains ?? [])
const multiClusters = computed(() => clusters.value ?? [])

const statCards = computed(() => [
  {
    label: '学科应用域',
    value: domains.value.filter((d) => d.domain !== 'multicenter').length,
    unit: '个',
  },
  {
    label: '应用场景',
    value: domains.value.reduce((s, d) => s + (d.scenario_count ?? 0), 0),
    unit: '个',
  },
  { label: '运行记录', value: indexData.value?.total_records ?? 0, unit: '条' },
  { label: '算力中心', value: multiClusters.value.length, unit: '个' },
])

function clusterName(id: string): string {
  return multiClusters.value.find((c) => c.id === id)?.name ?? id
}

function utilPercent(c: MultiCluster, key: 'cpu_utilization' | 'memory_utilization'): number {
  return Number(c[key]) || 0
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">总览</h1>
        <p class="page-subtitle">{{ indexData?.title ?? '超算互联网应用成果展' }} · 模拟数据驱动展示</p>
      </div>
      <el-tag v-if="indexData?.generated_at" type="info" effect="plain">
        数据生成于 {{ indexData.generated_at }}
      </el-tag>
    </div>

    <!-- 统计卡 -->
    <div class="stat-grid">
      <div v-for="(s, i) in statCards" :key="i" class="stat-card">
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value">
          {{ s.value }}<span class="stat-unit">{{ s.unit }}</span>
        </div>
      </div>
    </div>

    <!-- 学科应用域 -->
    <h2 class="section-title">学科应用</h2>
    <div class="card-grid">
      <el-card
        v-for="d in domains"
        :key="d.domain"
        shadow="hover"
        class="domain-card"
      >
        <template #header>
          <div class="flex-between">
            <div class="flex gap-8">
              <span class="domain-icon">{{ ICONS[d.icon] ?? '📦' }}</span>
              <span class="domain-name">{{ d.name }}</span>
              <el-tag v-if="d.domain === 'multicenter'" type="warning" size="small">平台能力</el-tag>
            </div>
            <StatusBadge :status="d.status" />
          </div>
        </template>

        <p class="domain-desc">{{ d.description }}</p>

        <div class="flex gap-16 mb-16">
          <span class="muted">场景 <b>{{ d.scenario_count }}</b></span>
          <span class="muted">记录 <b>{{ d.run_count }}</b></span>
        </div>

        <div class="flex gap-8 wrap mb-16">
          <el-tag v-for="c in d.cluster_hint" :key="c" size="small" effect="plain" type="info">
            {{ clusterName(c) }}
          </el-tag>
        </div>

        <div class="flex gap-12">
          <template v-if="d.domain === 'multicenter'">
            <el-button type="primary" size="small" @click="$router.push('/multicenter')">
              进入联调视图
            </el-button>
          </template>
          <template v-else>
            <el-button type="primary" size="small" @click="$router.push(`/domains/${d.domain}/scenarios`)">
              查看场景
            </el-button>
            <el-button size="small" @click="$router.push(`/domains/${d.domain}/runs`)">
              运行记录
            </el-button>
          </template>
        </div>
      </el-card>
    </div>

    <!-- 算力中心 -->
    <h2 class="section-title">算力中心资源状态</h2>
    <div class="card-grid">
      <el-card v-for="c in multiClusters" :key="c.id" shadow="never" class="cluster-card">
        <div class="flex-between mb-8">
          <span class="cluster-name">{{ c.name }}</span>
          <StatusBadge :status="c.status" />
        </div>
        <div class="muted mb-16">{{ c.location }} · {{ c.architecture }} · {{ c.scheduler }}</div>
        <div class="util-row">
          <span class="muted">CPU 利用率</span>
          <el-progress
            :percentage="utilPercent(c, 'cpu_utilization')"
            :stroke-width="10"
            :color="utilPercent(c, 'cpu_utilization') > 85 ? '#e63946' : '#1a6dff'"
          />
        </div>
        <div class="util-row">
          <span class="muted">内存利用率</span>
          <el-progress
            :percentage="utilPercent(c, 'memory_utilization')"
            :stroke-width="10"
            :color="utilPercent(c, 'memory_utilization') > 85 ? '#e63946' : '#1a6dff'"
          />
        </div>
        <div class="flex gap-16 mt-8">
          <span class="muted">节点 {{ formatNumber(c.total_nodes) }}</span>
          <span class="muted">核数 {{ formatNumber(c.total_cores) }}</span>
          <span class="muted">任务 {{ formatNumber(c.active_jobs) }}</span>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.domain-icon {
  font-size: 22px;
}

.domain-name {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.domain-desc {
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 12px;
  min-height: 42px;
}

.cluster-name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.util-row {
  margin-bottom: 8px;
}
</style>
