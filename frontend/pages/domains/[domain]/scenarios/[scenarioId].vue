<script setup lang="ts">
import { computed } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import { formatNumber } from '~/composables/useFormat'
import type { Benchmark, MetricKV, ParamsSchemas, ScenarioDetail } from '~/types'

const route = useRoute()
const domain = String(route.params.domain)
const scenarioId = String(route.params.scenarioId)

const { getIndex, getScenarioDetails, getBenchmarks, getParamsSchemas, getOperators } = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) {
  appStore.setIndex(indexData.value.domains, indexData.value.clusters)
}

const { data: details } = await useAsyncData(
  `details-${domain}`,
  () => getScenarioDetails(domain),
  { default: () => [] },
)
const { data: benchmarks } = await useAsyncData(
  `benchmarks-${domain}`,
  () => getBenchmarks(domain),
  { default: () => null },
)
const { data: paramsSchemas } = await useAsyncData(
  `params-${domain}`,
  () => getParamsSchemas(domain),
  { default: () => null },
)
const { data: operators } = await useAsyncData(
  `operators-${domain}`,
  () => getOperators(domain),
  { default: () => [] },
)

const domainInfo = computed(() => appStore.domains.find((d) => d.domain === domain))
// 各域 OpenAPI 契约不一致：geodynamics 返回数组，dft 等返回 { scenarioId: {...} } 对象，这里兼容两种形态
const detail = computed<ScenarioDetail | undefined>(() => {
  const v = details.value
  if (!v) return undefined
  if (Array.isArray(v)) return v.find((d) => d.id === scenarioId)
  return (v as Record<string, ScenarioDetail>)[scenarioId]
})

const clusterName = computed(() => {
  const map = appStore.clusterNameMap
  return (id: string) => map.get(id) ?? id
})

const benchmark = computed(() => (benchmarks.value as Benchmark | null)?.[scenarioId])
const benchmarkOption = computed(() => {
  if (!benchmark.value || !benchmark.value.dimensions.length) return null
  const dims = benchmark.value.dimensions
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 48, right: 24, top: 32, bottom: 48 },
    xAxis: { type: 'category', data: benchmark.value.series.map((s) => s.name) },
    yAxis: { type: 'value', name: dims[0]?.unit ?? '' },
    series: dims.map((dim) => ({
      name: dim.name,
      type: 'bar' as const,
      data: benchmark.value.series.map((s) => Number(s[dim.key] ?? 0)),
    })),
  }
})

const params = computed(() => {
  const p = (paramsSchemas.value as ParamsSchemas | null)?.[scenarioId]?.fields ?? []
  return p
})

function metricValue(m: MetricKV): string {
  return `${formatNumber(m.value, 2)}${m.unit ?? ''}`
}
</script>

<template>
  <div>
    <el-breadcrumb separator="/" class="mb-16">
      <el-breadcrumb-item :to="{ path: '/' }">总览</el-breadcrumb-item>
      <el-breadcrumb-item :to="{ path: `/domains/${domain}/scenarios` }">
        {{ domainInfo?.name ?? domain }}
      </el-breadcrumb-item>
      <el-breadcrumb-item>{{ detail?.name ?? scenarioId }}</el-breadcrumb-item>
    </el-breadcrumb>

    <div class="page-header">
      <div>
        <h1 class="page-title">{{ detail?.name ?? scenarioId }}</h1>
        <p class="page-subtitle">{{ detail?.description }}</p>
      </div>
      <div class="flex gap-12">
        <el-button @click="$router.push(`/domains/${domain}/scenarios`)">返回场景列表</el-button>
        <el-button type="primary" @click="$router.push(`/domains/${domain}/runs?scenario=${scenarioId}`)">
          运行记录
        </el-button>
      </div>
    </div>

    <el-empty v-if="!detail" description="未找到该场景详情" />

    <template v-if="detail">
      <!-- 关键指标 -->
      <MetricCards :metrics="detail.summary_metrics" />

      <!-- 背景与方法 -->
      <h2 class="section-title">背景与方法</h2>
      <div class="card-grid">
        <el-card shadow="never">
          <template #header><b>应用背景</b></template>
          <p class="text-block">{{ detail.background }}</p>
        </el-card>
        <el-card shadow="never">
          <template #header><b>计算方法</b></template>
          <p class="text-block">{{ detail.method }}</p>
          <div class="flex gap-8 wrap mt-8">
            <el-tag v-for="t in detail.tech_stack" :key="t" size="small" effect="plain" type="success">
              {{ t }}
            </el-tag>
          </div>
        </el-card>
      </div>

      <!-- 架构 -->
      <h2 class="section-title">并行架构</h2>
      <el-card shadow="never">
        <el-timeline v-if="detail.architecture.length">
          <el-timeline-item
            v-for="(a, i) in detail.architecture"
            :key="i"
            :timestamp="`阶段 ${i + 1}`"
            placement="top"
          >
            <!-- 兼容两种形态：{ name, description } 对象 或 纯字符串 -->
            <b>{{ typeof a === 'string' ? a : a.name }}</b>
            <p v-if="typeof a !== 'string' && a.description" class="muted">{{ a.description }}</p>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无架构说明" :image-size="60" />
      </el-card>

      <!-- 算子 -->
      <h2 class="section-title">核心算子</h2>
      <el-card shadow="never">
        <el-table :data="detail.operators" border size="small" stripe>
          <el-table-column prop="id" label="算子 ID" min-width="160" class-name="mono" />
          <el-table-column prop="name" label="名称" min-width="200" />
        </el-table>
      </el-card>

      <!-- 基准测试 -->
      <h2 v-if="benchmarkOption" class="section-title">性能基准</h2>
      <div v-if="benchmarkOption" class="chart-box">
        <p class="chart-title">并行规模基准对比</p>
        <BaseChart :option="benchmarkOption" height="340px" />
      </div>

      <!-- 参数说明 -->
      <h2 v-if="params.length" class="section-title">提交参数</h2>
      <el-card v-if="params.length" shadow="never">
        <el-table :data="params" border size="small" stripe>
          <el-table-column prop="name" label="参数名" min-width="140" class-name="mono" />
          <el-table-column prop="label" label="说明" min-width="140" />
          <el-table-column prop="type" label="类型" width="90" />
          <el-table-column label="必填" width="70">
            <template #default="{ row }">{{ row.required ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column label="默认值" width="110">
            <template #default="{ row }">{{ row.default_value ?? '-' }}</template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" />
        </el-table>
      </el-card>

      <!-- 成果亮点 -->
      <h2 v-if="detail.highlights.length" class="section-title">成果亮点</h2>
      <MetricCards v-if="detail.highlights.length" :metrics="detail.highlights" />

      <!-- 支持集群 -->
      <h2 class="section-title">支持算力中心</h2>
      <el-card shadow="never">
        <div class="flex gap-8 wrap">
          <el-tag v-for="c in detail.supported_clusters" :key="c" size="large" effect="plain">
            {{ clusterName(c) }}（{{ c }}）
          </el-tag>
        </div>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.text-block {
  margin: 0;
  color: #475569;
  font-size: 13.5px;
  line-height: 1.8;
  white-space: pre-line;
}
</style>
