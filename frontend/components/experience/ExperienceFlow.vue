<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ExperienceDataPrepStep from './ExperienceDataPrepStep.vue'
import ExperienceResourceStep from './ExperienceResourceStep.vue'
import ExperienceOperatorStep from './ExperienceOperatorStep.vue'
import ExperienceWorkflowStep from './ExperienceWorkflowStep.vue'
import ExperienceMonitorStep from './ExperienceMonitorStep.vue'
import ExperienceResultStep from './ExperienceResultStep.vue'
import { useApi } from '~/composables/useApi'
import { experienceSteps, getScenarioExperience } from '~/config/scenario-experience'
import type {
  Benchmark,
  DatasetItem,
  MultiCluster,
  Operator,
  ParamField,
  Run,
  RunDetail,
  ScenarioDetail,
} from '~/types'

const props = defineProps<{
  domain: string
  scenarioId: string
  detail?: ScenarioDetail
  benchmark?: Benchmark[string]
  params: ParamField[]
  clusterName: (id: string) => string
}>()

const {
  getDatasets,
  getClusters,
  getOperators,
  getRuns,
  getRunWorkflow,
} = useApi()

const experience = computed(() => getScenarioExperience(props.scenarioId))

/** 步骤目录与基础数据（随场景挂载，数据经后端接口下发） */
const { data: datasets } = await useAsyncData<DatasetItem[]>(
  `experience-datasets-${props.domain}-${props.scenarioId}`,
  () => getDatasets(props.domain),
  { default: () => [] },
)
const { data: clusters } = await useAsyncData<MultiCluster[]>(
  'experience-clusters',
  () => getClusters(),
  { default: () => [] },
)
const { data: operators } = await useAsyncData<Operator[]>(
  `experience-operators-${props.domain}`,
  () => getOperators(props.domain),
  { default: () => [] },
)
const { data: runs } = await useAsyncData<Run[]>(
  `experience-runs-${props.domain}`,
  () => getRuns(props.domain),
  { default: () => [] },
)

const scenarioRuns = computed(() => (runs.value ?? []).filter((run) => run.scenario_id === props.scenarioId))

const supportedClusters = computed(() => props.detail?.supported_clusters ?? [])
const selectedOperators = computed(() => props.detail?.operators ?? [])

/* ---------------- 步骤状态 ---------------- */
const activeKey = ref('data')
const activeStep = computed(
  () => experienceSteps.find((step) => step.key === activeKey.value) ?? experienceSteps[0],
)
const nextStep = computed(() => experienceSteps[activeStep.value.index] ?? null)

function selectStep(key: string): void {
  activeKey.value = key
}

function goNext(): void {
  const target = nextStep.value
  if (!target) return
  activeKey.value = target.key
}

/* ---------------- 运行记录相关资源 ---------------- */
const selectedRunId = ref('')
const runWorkflow = ref<RunDetail['workflow'] | null>(null)
const runResourcesPending = ref(false)

async function loadRunResources(runId: string): Promise<void> {
  if (import.meta.server) return
  if (!runId) {
    runWorkflow.value = null
    return
  }
  runResourcesPending.value = true
  try {
    runWorkflow.value = await getRunWorkflow(props.domain, runId)
  } catch {
    runWorkflow.value = null
  } finally {
    runResourcesPending.value = false
  }
}

function initializeRun(): void {
  const list = scenarioRuns.value
  if (list.some((run) => run.run_id === selectedRunId.value)) return
  const preferred = list.find((run) => run.has_detail) ?? list[0]
  selectedRunId.value = preferred?.run_id ?? ''
}

watch(scenarioRuns, initializeRun, { immediate: true })
watch(selectedRunId, (runId) => { void loadRunResources(runId) }, { immediate: true })

function handleInspect(runId: string): void {
  selectedRunId.value = runId
  activeKey.value = 'workflow'
}
</script>

<template>
  <section class="experience-flow">
    <header class="experience-head">
      <div class="experience-head-text">
        <p class="experience-eyebrow">一键体验 · One-Click Experience</p>
        <h2>{{ experience?.title ?? detail?.name ?? '场景体验' }}</h2>
        <p class="experience-desc">
          {{ experience?.description ?? '数据准备 → 资源调度 → 算子选择 → 流程编排 → 执行监控 → 结果展示' }}
        </p>
      </div>

      <button type="button" class="experience-cta" title="一键体验（自动引导功能开发中）">
        <span class="experience-cta-dot" aria-hidden="true" />
        一键体验
      </button>
    </header>

    <nav class="experience-steps" aria-label="体验流程步骤">
      <button
        v-for="step in experienceSteps"
        :key="step.key"
        type="button"
        class="experience-step"
        :class="{ 'is-active': step.key === activeKey }"
        :aria-current="step.key === activeKey ? 'step' : undefined"
        @click="selectStep(step.key)"
      >
        <span class="experience-step-index">{{ String(step.index).padStart(2, '0') }}</span>
        <span class="experience-step-text">
          <strong>{{ step.title }}</strong>
          <small>{{ step.english }}</small>
        </span>
        <span v-if="step.mode === 'external'" class="experience-step-flag">主前端</span>
      </button>
    </nav>

    <div class="experience-guide" role="status">
      <p class="experience-guide-line">
        <span class="experience-guide-progress">步骤 {{ activeStep.index }} / {{ experienceSteps.length }}</span>
        <span class="experience-guide-current">{{ activeStep.title }}</span>
        <span class="experience-guide-summary">{{ activeStep.summary }}</span>
      </p>
      <button v-if="nextStep" type="button" class="experience-next" @click="goNext">
        下一步：{{ nextStep.title }} →
      </button>
    </div>

    <div class="experience-body">
      <ExperienceDataPrepStep
        v-if="activeKey === 'data'"
        :domain="domain"
        :scenario-id="scenarioId"
        :detail="detail"
        :benchmark="benchmark"
        :params="params"
        :cluster-name="clusterName"
        :datasets="datasets ?? []"
      />

      <ExperienceResourceStep
        v-else-if="activeKey === 'resource'"
        :clusters="clusters ?? []"
        :supported-clusters="supportedClusters"
      />

      <ExperienceOperatorStep
        v-else-if="activeKey === 'operator'"
        :domain="domain"
        :operators="operators ?? []"
        :selected-operators="selectedOperators"
      />

      <ExperienceWorkflowStep
        v-else-if="activeKey === 'workflow'"
        :domain="domain"
        :runs="scenarioRuns"
        :selected-run-id="selectedRunId"
        :workflow="runWorkflow"
        :pending="runResourcesPending"
        @update:selected-run-id="(value) => (selectedRunId = value)"
      />

      <ExperienceMonitorStep
        v-else-if="activeKey === 'monitor'"
        :runs="scenarioRuns"
        :domain="domain"
        :selected-run-id="selectedRunId"
        @update:selected-run-id="(value) => (selectedRunId = value)"
        @inspect="handleInspect"
      />

      <ExperienceResultStep
        v-else-if="activeKey === 'result'"
        :domain="domain"
        :run-id="selectedRunId"
      />
    </div>
  </section>
</template>

<style scoped>
.experience-flow {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.experience-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 22px 26px;
  border: 1px solid var(--scnet-divider);
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #fbfcff 100%);
}

.experience-eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--scnet-primary);
}

.experience-head-text h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--scnet-text);
}

.experience-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--scnet-text-muted);
}

.experience-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: var(--scnet-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(11, 91, 211, 0.24);
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.experience-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(11, 91, 211, 0.3);
}

.experience-cta-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  opacity: 0.85;
}

.experience-steps {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.experience-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;
}

.experience-step:hover {
  border-color: var(--el-color-primary-light-7);
}

.experience-step.is-active {
  border-color: var(--scnet-primary);
  background: var(--scnet-primary-soft);
}

.experience-step-index {
  font-family: var(--scnet-font-mono);
  font-size: 15px;
  font-weight: 700;
  color: var(--scnet-primary);
}

.experience-step-text {
  display: grid;
  min-width: 0;
}

.experience-step-text strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--scnet-text);
}

.experience-step-text small {
  font-size: 11px;
  color: var(--scnet-text-muted);
}

.experience-step-flag {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef2f7;
  color: var(--scnet-text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.experience-guide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 18px;
  border: 1px solid var(--scnet-divider);
  border-left: 3px solid var(--scnet-primary);
  border-radius: 8px;
  background: #fff;
}

.experience-guide-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0;
  font-size: 13px;
  color: var(--scnet-text-secondary);
}

.experience-guide-progress {
  font-family: var(--scnet-font-mono);
  font-weight: 700;
  color: var(--scnet-primary);
}

.experience-guide-current {
  font-weight: 600;
  color: var(--scnet-text);
}

.experience-guide-summary {
  color: var(--scnet-text-muted);
}

.experience-next {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--scnet-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.experience-next:hover {
  color: var(--el-color-primary-light-3);
}

.experience-body {
  min-width: 0;
}

@media (max-width: 1100px) {
  .experience-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .experience-head {
    padding: 18px;
  }

  .experience-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .experience-step-flag {
    display: none;
  }
}
</style>
