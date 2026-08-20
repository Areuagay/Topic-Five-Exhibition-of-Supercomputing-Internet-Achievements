<script setup lang="ts">
import { computed } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import type { ScenarioDetail } from '~/types'

const route = useRoute()
const domain = String(route.params.domain)
const { getScenarios, getScenarioDetails, getIndex } = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) {
  appStore.setIndex(indexData.value.domains, indexData.value.clusters)
}

const { data: scenarios } = await useAsyncData(
  `scenarios-${domain}`,
  () => getScenarios(domain),
  { default: () => [] },
)
const { data: details } = await useAsyncData(
  `details-${domain}`,
  () => getScenarioDetails(domain),
  { default: () => [] },
)

const domainInfo = computed(() => appStore.domains.find((d) => d.domain === domain))
// 各域 OpenAPI 契约不一致：geodynamics 等返回数组，dft/drug 等返回 { scenarioId: {...} } 对象，这里兼容两种形态
const detailMap = computed(() => {
  const v = details.value
  if (!v) return new Map()
  const list = Array.isArray(v) ? v : Object.values(v as Record<string, ScenarioDetail>)
  return new Map(list.map((d) => [d.id, d]))
})
</script>

<template>
  <div>
    <el-breadcrumb separator="/" class="mb-16">
      <el-breadcrumb-item :to="{ path: '/' }">总览</el-breadcrumb-item>
      <el-breadcrumb-item>{{ domainInfo?.name ?? domain }}</el-breadcrumb-item>
      <el-breadcrumb-item>应用场景</el-breadcrumb-item>
    </el-breadcrumb>

    <div class="page-header">
      <div>
        <h1 class="page-title">{{ domainInfo?.name ?? domain }} · 应用场景</h1>
        <p class="page-subtitle">{{ domainInfo?.description }}</p>
      </div>
      <el-button @click="$router.push(`/domains/${domain}/runs`)">运行记录</el-button>
    </div>

    <el-empty v-if="!scenarios?.length" description="暂无场景数据" />

    <div class="card-grid">
      <el-card
        v-for="s in scenarios ?? []"
        :key="s.id"
        shadow="hover"
        class="scenario-card"
      >
        <template #header>
          <div class="flex-between">
            <div>
              <span class="scenario-name">{{ s.name }}</span>
              <el-tag v-if="s.category" size="small" effect="plain" type="info" class="ml-8">
                {{ s.category }}
              </el-tag>
            </div>
            <StatusBadge :status="s.status" />
          </div>
        </template>

        <p class="scenario-desc">{{ s.description }}</p>

        <template v-if="detailMap.get(s.id)">
          <div class="stat-grid detail-grid">
            <div
              v-for="(m, i) in detailMap.get(s.id)!.summary_metrics"
              :key="i"
              class="stat-card"
            >
              <div class="stat-label">{{ m.label }}</div>
              <div class="stat-value">{{ m.value }}<span v-if="m.unit" class="stat-unit">{{ m.unit }}</span></div>
            </div>
          </div>

          <div class="flex gap-8 wrap mb-16">
            <el-tag
              v-for="c in detailMap.get(s.id)!.supported_clusters"
              :key="c"
              size="small"
              effect="plain"
            >
              {{ c }}
            </el-tag>
          </div>
        </template>

        <div class="flex gap-12">
          <el-button
            type="primary"
            size="small"
            @click="$router.push(`/domains/${domain}/scenarios/${s.id}`)"
          >
            查看详情
          </el-button>
          <el-button
            size="small"
            @click="$router.push(`/domains/${domain}/runs?scenario=${s.id}`)"
          >
            运行记录
          </el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.scenario-name {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.ml-8 {
  margin-left: 8px;
}

.scenario-desc {
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 12px;
  min-height: 42px;
}

.detail-grid {
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.detail-grid .stat-card {
  padding: 12px;
}

.detail-grid .stat-value {
  font-size: 20px;
}
</style>
