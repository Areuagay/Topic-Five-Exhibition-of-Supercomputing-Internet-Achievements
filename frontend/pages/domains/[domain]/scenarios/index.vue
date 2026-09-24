<script setup lang="ts">
import { computed, ref } from 'vue'
import ExperienceFlow from '~/components/experience/ExperienceFlow.vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import { getScenarioExperience } from '~/config/scenario-experience'
import type { Benchmark, ParamsSchemas, ScenarioDetail } from '~/types'

const route = useRoute()
const router = useRouter()
const domain = String(route.params.domain)
const {
  getScenarios,
  getScenarioDetails,
  getBenchmarks,
  getParamsSchemas,
  getIndex,
} = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) appStore.setIndex(indexData.value.domains, indexData.value.clusters)

const { data: scenarios, error: scenariosError } = await useAsyncData(
  `scenarios-${domain}`,
  () => getScenarios(domain),
  { default: () => [] },
)
const { data: details, error: detailsError } = await useAsyncData(
  `details-${domain}`,
  () => getScenarioDetails(domain),
  { default: () => [] },
)
const { data: benchmarks, error: benchmarksError } = await useAsyncData(
  `benchmarks-${domain}`,
  () => getBenchmarks(domain),
  { default: () => null },
)
const { data: paramsSchemas, error: paramsError } = await useAsyncData(
  `params-${domain}`,
  () => getParamsSchemas(domain),
  { default: () => null },
)
const domainInfo = computed(() => appStore.domains.find((item) => item.domain === domain))
const scenarioList = computed(() => scenarios.value ?? [])
const loadError = computed(() => (
  scenariosError.value
  || detailsError.value
  || benchmarksError.value
  || paramsError.value
))

const detailMap = computed(() => {
  const value = details.value
  if (!value) return new Map<string, ScenarioDetail>()
  const list = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, ScenarioDetail>)
  return new Map(list.map((item) => [item.id, item]))
})

const selectedScenarioId = computed(() => {
  const requested = String(route.query.scenario ?? '')
  return scenarioList.value.some((item) => item.id === requested)
    ? requested
    : (scenarioList.value[0]?.id ?? '')
})

const selectedDetail = computed(() => detailMap.value.get(selectedScenarioId.value))
const selectedBenchmark = computed(() => (
  (benchmarks.value as Benchmark | null)?.[selectedScenarioId.value]
))
const params = computed(() => (
  (paramsSchemas.value as ParamsSchemas | null)?.[selectedScenarioId.value]?.fields ?? []
))
// 仅对已预置一键体验样式的场景启用体验容器，其余场景保持原有详情展示
const experienceEnabled = computed(() => !!getScenarioExperience(selectedScenarioId.value))
const scenarioPending = ref(false)

function selectScenario(id: string): void {
  if (id === selectedScenarioId.value) return
  const { step, run, plan, ...query } = route.query
  router.push({ query: { ...query, scenario: id } })
}

function clusterName(id: string): string {
  return appStore.clusterNameMap.get(id) ?? id
}
</script>

<template>
  <section class="scenario-page">
    <section class="scenario-surface">
        <DomainSurfaceHeader
          :title="domainInfo?.name ?? domain"
        />

      <el-alert
        v-if="loadError"
        class="scenario-load-alert"
        title="部分成果数据加载失败，请刷新重试或检查服务连接"
        type="error"
        :closable="false"
        show-icon
      />

      <template v-if="scenarioList.length">
        <ScenarioSelector
          :scenarios="scenarioList"
          :model-value="selectedScenarioId"
          :domain="domain"
          @update:model-value="selectScenario"
        />

        <main class="scenario-detail-region" :aria-busy="scenarioPending" :inert="scenarioPending || undefined">
          <!-- Retain the current scene while async setup resolves; overlap only
               the short visual handoff so the region never collapses to zero. -->
          <Transition name="scenario-panel">
            <Suspense @pending="scenarioPending = true" @resolve="scenarioPending = false">
              <ExperienceFlow
                v-if="experienceEnabled"
                :key="selectedScenarioId"
                :domain="domain"
                :scenario-id="selectedScenarioId"
                :detail="selectedDetail"
                :benchmark="selectedBenchmark"
                :params="params"
                :cluster-name="clusterName"
                :animate-on-mount="false"
              />
              <ScenarioDetailContent
                v-else
                :key="selectedScenarioId"
                :detail="selectedDetail"
                :benchmark="selectedBenchmark"
                :params="params"
                :cluster-name="clusterName"
              />
            </Suspense>
          </Transition>
        </main>
      </template>

      <el-empty
        v-else
        class="scenario-empty"
        description="暂无场景数据"
        :image-size="72"
      />
    </section>
  </section>
</template>

<style scoped>
.scenario-page {
  width: 100%;
  min-width: 0;
}

.scenario-surface {
  overflow: hidden;
  border: 1px solid var(--scnet-divider);
  border-radius: 12px;
  background: #f5f7fa;
  box-shadow: 0 2px 8px rgba(31, 45, 61, 0.045);
}

.scenario-load-alert {
  border-radius: 0;
}

.scenario-detail-region {
  display: grid;
  align-items: start;
  padding: clamp(20px, 1.7vw, 28px);
}

.scenario-detail-region > :deep(*) { grid-area: 1 / 1; min-width: 0; }
.scenario-panel-enter-active { transition: opacity 240ms cubic-bezier(.2,.7,.2,1), transform 240ms cubic-bezier(.2,.7,.2,1); }
.scenario-panel-leave-active { transition: opacity 160ms ease-out; pointer-events: none; }
.scenario-panel-enter-from { opacity: 0; transform: translateY(6px); }
.scenario-panel-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .scenario-panel-enter-active, .scenario-panel-leave-active { transition: none; }
  .scenario-panel-enter-from { transform: none; }
}

.scenario-empty {
  min-height: 420px;
  border-radius: 0;
  background: transparent;
}

@media (max-width: 760px) {
  .scenario-detail-region {
    padding: 16px;
  }
}
</style>
