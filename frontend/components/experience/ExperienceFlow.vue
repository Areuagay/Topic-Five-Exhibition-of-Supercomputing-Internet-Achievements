<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSlidingHighlight } from '~/composables/useSlidingHighlight'
import ExperienceDataPrepStep from './ExperienceDataPrepStep.vue'
import ExperienceResourceStep from './ExperienceResourceStep.vue'
import ExperienceOperatorStep from './ExperienceOperatorStep.vue'
import ExperienceWorkflowStep from './ExperienceWorkflowStep.vue'
import ExperienceMonitorStep from './ExperienceMonitorStep.vue'
import ExperienceResultStep from './ExperienceResultStep.vue'
import { useApi } from '~/composables/useApi'
import { formatNumber } from '~/composables/useFormat'
import { unitText } from '~/utils/workspace'
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
const chosenOperatorIds = useState<string[] | null>(`experience-operators-selection-${props.domain}-${props.scenarioId}`, () => null)
const chosenOperators = computed(() => (operators.value ?? []).filter((item) => chosenOperatorIds.value?.includes(item.name)))
const guideActive = ref(false)
const experienceSession = ref(0)
const guideBar = ref<HTMLElement>()
const actionFeedback = ref('')
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(feedbackTimer))
const guideInstructions: Record<string, string> = {
  data: '已恢复场景推荐方案，从输入数据开始体验。',
  resource: '对比算力中心的容量与负载，查看场景支持的资源。',
  operator: '参考场景推荐，选择或取消本次体验需要的算子。',
  workflow: '核对本次已选算子，并浏览已有记录的工作流。',
  monitor: '选择一条运行记录，查看状态和进度。',
  result: '已到达最后一步，查看所选记录的图表与成果文件。',
}
const guideSummary = computed(() => guideActive.value ? guideInstructions[activeKey.value] : activeStep.value.summary)

async function startExperience(): Promise<void> {
  clearTimeout(feedbackTimer)
  actionFeedback.value = guideActive.value ? '已重新开始' : '体验已开始'
  const recommended = new Set(selectedOperators.value.flatMap((item) => [item.id, item.name]))
  chosenOperatorIds.value = (operators.value ?? [])
    .filter((item) => recommended.has(item.name) && ['registered', 'available'].includes(item.status))
    .map((item) => item.name)
  selectedRunId.value = (scenarioRuns.value.find((run) => run.has_detail) ?? scenarioRuns.value[0])?.run_id ?? ''
  experienceSession.value++
  guideActive.value = true
  activeKey.value = 'data'
  feedbackTimer = setTimeout(() => { actionFeedback.value = '' }, 2800)
  await nextTick()
  guideBar.value?.scrollIntoView({ block: 'nearest' })
  guideBar.value?.querySelector<HTMLButtonElement>('.experience-next')?.focus({ preventScroll: true })
}

/* ---------------- 步骤状态 ---------------- */
const activeKey = ref('data')
const activeStep = computed(
  () => experienceSteps.find((step) => step.key === activeKey.value) ?? experienceSteps[0],
)
const nextStep = computed(() => experienceSteps[activeStep.value.index] ?? null)
const previousStep = computed(() => experienceSteps[activeStep.value.index - 2] ?? null)
const { track: stepTrack, ready: stepHighlightReady, style: stepHighlightStyle } = useSlidingHighlight(computed(() => activeStep.value.index - 1))

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
    const workflow = await getRunWorkflow(props.domain, runId)
    if (selectedRunId.value === runId) runWorkflow.value = workflow
  } catch {
    if (selectedRunId.value === runId) runWorkflow.value = null
  } finally {
    if (selectedRunId.value === runId) runResourcesPending.value = false
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
    <div class="experience-overview">
      <header class="experience-head">
        <div class="experience-head-text">
          <div class="experience-title-row">
            <h2>{{ experience?.title ?? detail?.name ?? '场景体验' }}</h2>
            <button type="button" class="experience-start" :class="{ 'is-confirmed': actionFeedback }" @click="startExperience">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path v-if="actionFeedback" d="m4 10 4 4 8-9"/><path v-else-if="guideActive" d="M4 6a7 7 0 1 1-1 7M4 2v5h5"/><path v-else d="m6 3 10 7-10 7Z"/></svg>
              {{ actionFeedback || (guideActive ? '重新体验' : '一键体验') }}
            </button>
          </div>
          <p class="experience-desc">
            {{ detail?.description ?? '从数据准备到计算结果，逐步浏览完整应用流程。' }}
          </p>
          <div v-if="detail?.tech_stack.length" class="experience-tech-stack" aria-label="技术栈">
            <span>技术栈</span><span v-for="item in detail.tech_stack" :key="item">{{ item }}</span>
          </div>
        </div>
        <dl v-if="detail?.summary_metrics.length" class="experience-metrics" :class="{ 'has-many': detail.summary_metrics.length > 3 }" :style="{ '--metric-columns': Math.min(detail.summary_metrics.length, 3) }" aria-label="关键指标">
          <div v-for="metric in detail.summary_metrics" :key="metric.label">
            <dt>{{ metric.label }}</dt>
            <dd><span>{{ formatNumber(metric.value, 2).replace(/\^3/g, '³') }}</span><small>{{ unitText(metric.unit) === 'x' ? '×' : unitText(metric.unit) }}</small></dd>
          </div>
        </dl>
      </header>

      <nav ref="stepTrack" class="experience-steps" :class="{ 'has-sliding-highlight': stepHighlightReady }" aria-label="体验流程步骤">
        <span class="scnet-sliding-highlight" :class="{ 'is-ready': stepHighlightReady }" :style="stepHighlightStyle" aria-hidden="true" />
        <button
          v-for="step in experienceSteps"
          :key="step.key"
          type="button"
          class="experience-step"
          data-highlight-item
          :class="{ 'is-active': step.key === activeKey }"
          :aria-current="step.key === activeKey ? 'step' : undefined"
          @click="selectStep(step.key)"
        >
          <span class="experience-step-index">{{ String(step.index).padStart(2, '0') }}</span>
          <span class="experience-step-text">
            <strong>{{ step.title }}</strong>
          </span>
        </button>
      </nav>
    <div ref="guideBar" class="experience-guide">
      <p class="experience-guide-line" role="status">
        <span class="experience-guide-progress">{{ guideActive ? '体验' : '步骤' }} {{ activeStep.index }} / {{ experienceSteps.length }}</span>
        <span class="experience-guide-summary" :title="guideSummary">{{ guideSummary }}</span>
      </p>
      <div class="experience-guide-actions">
        <button :disabled="!previousStep" type="button" class="experience-previous" @click="previousStep && selectStep(previousStep.key)"><span class="experience-nav-arrow">←</span> 上一步</button>
        <button :disabled="!nextStep" type="button" class="experience-next" :title="nextStep ? '下一步：' + nextStep.title : '已是最后一步'" @click="goNext">
          下一步 <span class="experience-nav-arrow">→</span>
        </button>
      </div>
    </div>
    </div>

    <div class="experience-body">
      <KeepAlive :key="experienceSession" include="ExperienceResultStep" :max="1">
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
        :chosen-ids="chosenOperatorIds ?? []"
        @update:chosen-ids="chosenOperatorIds = $event"
      />

      <ExperienceWorkflowStep
        v-else-if="activeKey === 'workflow'"
        :domain="domain"
        :runs="scenarioRuns"
        :selected-run-id="selectedRunId"
        :workflow="runWorkflow"
        :pending="runResourcesPending"
        :chosen-operators="chosenOperators"
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
      </KeepAlive>
    </div>
  </section>
  <Teleport to="body">
    <Transition name="experience-feedback">
      <div v-if="actionFeedback" class="experience-feedback" role="status"><span aria-hidden="true">✓</span><div><strong>{{ actionFeedback }}</strong><p>已回到数据准备，恢复 {{ chosenOperators.length }} 个推荐算子和默认运行记录。</p></div></div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.experience-flow { display: grid; gap: 20px; min-width: 0; }
.experience-overview { min-width: 0; overflow: hidden; border: 1px solid #e1e6ed; border-radius: 12px; background: #fff; box-shadow: 0 2px 7px rgb(31 45 61 / 4.5%); }
.experience-head { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(420px, 1fr); align-items: center; gap: 40px; padding: clamp(26px, 2.2vw, 38px); }
.experience-head-text { min-width: 0; }
.experience-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 14px 20px; }
.experience-start { display: inline-flex; justify-content: center; align-items: center; gap: 8px; min-width: 144px; min-height: 44px; padding: 0 16px; border: 1px solid var(--scnet-primary); border-radius: 6px; background: var(--scnet-primary); color: #fff; font-size: 15px; cursor: pointer; transition: var(--scnet-hover-transition), transform 180ms ease; }
.experience-start svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.experience-start:hover { background: var(--el-color-primary-dark-2); box-shadow: 0 5px 12px rgb(11 91 211 / 22%); transform: translateY(-1px); }
.experience-start:active { transform: translateY(1px) scale(.97); box-shadow: none; }
.experience-start.is-confirmed { background: #26734d; border-color: #26734d; }
.experience-feedback { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 3000; display: flex; gap: 12px; align-items: center; width: max-content; max-width: calc(100vw - 32px); padding: 16px 22px; border: 1px solid #cde3d6; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgb(31 45 61 / 14%); pointer-events: none; }
.experience-feedback > span { display: grid; place-items: center; flex: 0 0 30px; height: 30px; border-radius: 50%; background: #edf7f0; color: #26734d; }
.experience-feedback strong { font-size: 15px; color: var(--scnet-text); }
.experience-feedback p { margin: 3px 0 0; color: var(--scnet-text-secondary); font-size: 13px; }
.experience-feedback-enter-active, .experience-feedback-leave-active { transition: opacity 180ms ease, translate 180ms ease; }
.experience-feedback-enter-from, .experience-feedback-leave-to { opacity: 0; translate: 0 -8px; }
.experience-head-text h2 { margin: 0; font-size: clamp(24px, 1.65vw, 30px); font-weight: 650; line-height: 1.35; text-wrap: balance; }
.experience-desc { margin: 10px 0 0; color: var(--scnet-text-secondary); font-size: 16px; line-height: 1.75; text-wrap: pretty; }
.experience-tech-stack { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; margin-top: 16px; color: #45678f; font-size: 14px; }
.experience-tech-stack > span:first-child { display: inline-flex; align-items: center; gap: 8px; color: var(--scnet-text); font-size: 15px; font-weight: 600; }
.experience-tech-stack > span:first-child::before { content: ''; width: 2px; height: 14px; border-radius: 1px; background: var(--scnet-primary); }
.experience-tech-stack > span:not(:first-child):not(:nth-child(2))::before { content: '·'; margin-right: 14px; color: #8993a1; }
.experience-metrics { display: grid; grid-template-columns: repeat(var(--metric-columns, 3), minmax(0, 1fr)); gap: 20px 0; margin: 0; }
.experience-metrics.has-many { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.experience-metrics > div { min-width: 0; padding: 10px 18px; border-left: 1px solid var(--scnet-divider); }
.experience-metrics dt { color: var(--scnet-text-muted); font-size: 14px; }
.experience-metrics dd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 5px; margin: 6px 0 0; color: var(--scnet-text); font-family: var(--scnet-font-sans); font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.4; }
.experience-metrics.has-many dd { flex-wrap: nowrap; }
.experience-metrics.has-many dd > span,
.experience-metrics.has-many small { flex-shrink: 0; white-space: nowrap; }
.experience-metrics dd > span { overflow-wrap: anywhere; }
.experience-metrics small { min-height: 20px; font-family: var(--scnet-font-sans); font-size: 13px; font-weight: 400; color: #687588; overflow-wrap: anywhere; }
.experience-steps { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; padding: 12px 20px; border-top: 1px solid var(--scnet-divider); background: #fff; }
.experience-step { position: relative; display: flex; justify-content: center; align-items: center; gap: 9px; min-height: 54px; padding: 10px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--scnet-text-secondary); cursor: pointer; transition: color 160ms ease, background-color 160ms ease; }
.experience-step::after { content: ''; position: absolute; bottom: 0; left: calc(50% - 12px); width: 24px; height: 2px; background: transparent; border-radius: 2px; }
.experience-step.is-active { color: var(--scnet-primary); background: #edf4ff; }
.experience-step.is-active::after { background: var(--scnet-primary); }
.experience-steps { position: relative; isolation: isolate; }
.experience-steps.has-sliding-highlight .experience-step.is-active { background: transparent; }
.experience-steps.has-sliding-highlight .experience-step::after { display: none; }
.experience-steps.has-sliding-highlight .experience-step.is-active:hover { background: transparent; }
.experience-step:hover { background: var(--scnet-hover-bg); }
.experience-step-index { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #f1f3f6; color: #687588; font: 500 12px var(--scnet-font-mono); }
.experience-step.is-active .experience-step-index { color: #fff; background: var(--scnet-primary); }
.experience-step-text strong { font-size: 16px; font-weight: 600; white-space: nowrap; }
.experience-guide { display: grid; grid-template-columns: minmax(0, 1fr) 224px; align-items: center; gap: 20px; min-height: 72px; padding: 12px 24px; border-top: 1px solid var(--scnet-divider); background: #fbfcfe; }
.experience-guide-line { display: flex; align-items: center; gap: 14px; min-width: 0; margin: 0; font-size: 16px; color: var(--scnet-text-secondary); }
.experience-guide-progress { flex-shrink: 0; color: var(--scnet-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.experience-guide-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.experience-guide-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.experience-guide-actions button { height: 44px; padding: 0 12px; border: 1px solid #d7e0ed; border-radius: 6px; background: #fff; color: var(--scnet-text-secondary); font-size: 15px; white-space: nowrap; cursor: pointer; }
.experience-guide-actions .experience-next { border-color: var(--scnet-primary); color: #fff; background: var(--scnet-primary); }
.experience-guide-actions button { transition: var(--scnet-hover-transition), color 180ms ease, transform 180ms var(--scnet-hover-easing); }
.experience-guide-actions button:enabled:is(:hover, :focus-visible) { border-color: var(--scnet-primary); box-shadow: 0 5px 12px rgb(11 91 211 / 20%); transform: translateY(-2px); }
.experience-guide-actions .experience-previous:enabled:is(:hover, :focus-visible) { background: #eaf2ff; color: var(--scnet-primary); }
.experience-guide-actions .experience-next:enabled:is(:hover, :focus-visible) { background: var(--el-color-primary-dark-2); }
.experience-guide-actions button:enabled:active { transform: translateY(1px) scale(.97); box-shadow: 0 1px 3px rgb(11 91 211 / 12%); }
.experience-nav-arrow { display: inline-block; transition: transform 180ms var(--scnet-hover-easing); }
.experience-previous:enabled:is(:hover, :focus-visible) .experience-nav-arrow { transform: translateX(-3px); }
.experience-next:enabled:is(:hover, :focus-visible) .experience-nav-arrow { transform: translateX(3px); }
.experience-guide-actions button:disabled { border-color: #e5e9ef; background: #f1f3f6; color: #a1a8b3; cursor: not-allowed; }
.experience-body { min-width: 0; }
button:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: -3px; }
@media (max-width: 1100px) { .experience-head { grid-template-columns: 1fr; gap: 24px; } .experience-metrics { max-width: 620px; } }
@media (max-width: 420px) { .experience-metrics.has-many { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .experience-step { flex-direction: column; gap: 6px; } .experience-steps { padding-inline: 8px; } }
@media (max-width: 560px) {
  .experience-head { padding: 22px; }
  .experience-desc { font-size: 14px; }
  .experience-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .experience-step { flex-direction: row; min-height: 56px; gap: 6px; }
  .experience-step-text strong { font-size: 14px; }
  .experience-step-index { width: 24px; height: 24px; font-size: 11px; }
  .experience-metrics { gap: 16px 0; }
  .experience-metrics > div { padding: 6px 10px; }
  .experience-metrics dd { font-size: 21px; }
  .experience-metrics small { font-size: 12px; }
  .experience-guide { grid-template-columns: 1fr; gap: 10px; padding: 12px 16px; }
  .experience-guide-line { height: 28px; font-size: 15px; }
  .experience-guide-actions { width: 224px; justify-self: end; }
}
@media (prefers-reduced-motion: reduce) {
  .experience-guide-actions button, .experience-nav-arrow { transition: none; }
  .experience-guide-actions button:enabled:is(:hover, :focus-visible, :active), .experience-guide-actions button:enabled:is(:hover, :focus-visible) .experience-nav-arrow { transform: none; }
  .experience-step, .experience-start, .experience-feedback-enter-active, .experience-feedback-leave-active { transition: none; }
  .experience-start:hover, .experience-start:active { transform: none; }
  .experience-feedback-enter-from, .experience-feedback-leave-to { translate: none; }
}
</style>
