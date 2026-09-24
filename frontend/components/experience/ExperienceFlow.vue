<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useExperienceNavigation } from '~/composables/useExperienceNavigation'
import { useExperienceMotion } from '~/composables/useExperienceMotion'
import { ArrowLeft, ArrowRight, LoaderCircle, RotateCcw, Check, LockKeyhole } from '@lucide/vue'
import { hasSubmittedSelection, requiresSubmittedPlan } from '~/utils/experience-navigation'
import { findDuplicatePlan, preparedDataKey } from '~/utils/experience-duplicates'
import { useSlidingHighlight } from '~/composables/useSlidingHighlight'
import ExperienceDataPrepStep from './ExperienceDataPrepStep.vue'
import ExperienceResourceStep from './ExperienceResourceStep.vue'
import ExperienceOperatorStep from './ExperienceOperatorStep.vue'
import ExperienceWorkflowStep from './ExperienceWorkflowStep.vue'
import ExperienceMonitorStep from './ExperienceMonitorStep.vue'
import ExperienceResultStep from './ExperienceResultStep.vue'
import { useApi } from '~/composables/useApi'
import { formatNumber, statusText } from '~/composables/useFormat'
import { canViewResult } from '~/utils/experience-simulation'
import { unitText } from '~/utils/workspace'
import { experienceSteps, getScenarioExperience } from '~/config/scenario-experience'
import type {
  Benchmark,
  DatasetItem,
  ImportResult,
  MultiCluster,
  Operator,
  ParamField,
  Run,
  OperatorSubmitResult,
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
  animateOnMount?: boolean
}>()

// Server-rendered controls are visible before Vue has attached their handlers.
// Keep that short loading interval non-interactive so the first click is never lost.
const interactionReady = ref(false)
onMounted(() => { interactionReady.value = true })

const {
  getDatasets,
  getClusters,
  getOperators,
  getRuns,
  getRunWorkflow,
  submitOperators,
} = useApi()


const experience = computed(() => getScenarioExperience(props.scenarioId))

/** 步骤目录与基础数据（随场景挂载，数据经后端接口下发） */
const { data: datasets, refresh: refreshDatasets } = await useAsyncData<DatasetItem[]>(
  `experience-datasets-${props.domain}-${props.scenarioId}`,
  () => getDatasets(props.domain),
  { default: () => [] },
)
const { data: clusters, refresh: refreshClusters } = await useAsyncData<MultiCluster[]>(
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

// Commit only successful snapshots so transient network failures cannot erase
// the selection through the navigation composable's list validation.
const pendingSubmission = useState<OperatorSubmitResult | null>(`experience-pending-${props.domain}-${props.scenarioId}`, () => null)
let runRefreshQueue = Promise.resolve()
function refreshRuns(): Promise<void> {
  const request = runRefreshQueue.then(async () => {
    if (disposed) return
    const snapshot = await getRuns(props.domain)
    if (!disposed) {
      runs.value = snapshot
      finishPendingSubmission()
    }
  })
  // Serialize polling and submission refreshes: an earlier response must never
  // remove a task that a later submission just selected. A failure releases the queue.
  runRefreshQueue = request.catch(() => {})
  return request
}

const scenarioRuns = computed(() => (runs.value ?? []).filter((run) => run.scenario_id === props.scenarioId))
const submittedPlan = useRoute().query.plan
const restoredRun = scenarioRuns.value.find(run => run.run_id === submittedPlan && run.origin === 'runtime')
const submittedRunId = useState<string>(`experience-submitted-${props.domain}-${props.scenarioId}`, () => restoredRun?.run_id ?? '')
const chosenOperatorIds = useState<string[] | null>(`experience-operators-selection-${props.domain}-${props.scenarioId}`, () => restoredRun?.selected_operator_ids ?? null)
const workflowAllowed = computed(() => hasSubmittedSelection(chosenOperatorIds.value ?? [], scenarioRuns.value.find(run => run.run_id === submittedRunId.value)))
const { activeKey, selectedRunId, navigate } = useExperienceNavigation(props.domain, props.scenarioId, scenarioRuns, workflowAllowed, submittedRunId)
watch(workflowAllowed, allowed => {
  if (!allowed && submittedRunId.value) {
    submittedRunId.value = ''
    navigate(activeKey.value, selectedRunId.value, true)
  }
})

const supportedClusters = computed(() => props.detail?.supported_clusters ?? [])
const selectedOperators = computed(() => props.detail?.operators ?? [])
const chosenOperators = computed(() => (operators.value ?? []).filter((item) => chosenOperatorIds.value?.includes(item.name)))
const guideActive = useState<boolean>(`experience-guide-${props.domain}-${props.scenarioId}`, () => false)
const guideBar = ref<HTMLElement>()
const actionFeedback = ref('')
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(feedbackTimer))
const guideInstructions: Record<string, string> = {
  data: '已恢复场景推荐方案，从输入数据开始体验。',
  resource: '对比算力中心的容量与负载，查看场景支持的资源。',
  operator: '参考场景推荐，选择或取消本次体验需要的算子。',
  workflow: '查看已提交任务的工作流，节点与监控进度同步更新。',
  monitor: '选择一条运行记录，查看状态和进度。',
  result: '已到达最后一步，查看所选记录的图表与成果文件。',
}
const guideSummary = computed(() => activeKey.value === 'operator' && !workflowAllowed.value ? '提交算子后，查看任务执行进度。' : guideActive.value ? guideInstructions[activeKey.value] : activeStep.value.summary)

async function startExperience(): Promise<void> {
  if (operatorSubmitting.value || pendingSubmission.value) return
  clearTimeout(feedbackTimer)
  actionFeedback.value = '已恢复推荐'
  submittedRunId.value = ''
  const recommended = new Set(selectedOperators.value.flatMap((item) => [item.id, item.name]))
  chosenOperatorIds.value = (operators.value ?? [])
    .filter((item) => recommended.has(item.name) && ['registered', 'available'].includes(item.status))
    .map((item) => item.name)
  const defaultRunId = (scenarioRuns.value.find((run) => run.has_detail) ?? scenarioRuns.value[0])?.run_id ?? ''
  guideActive.value = true
  navigate('data', defaultRunId)
  feedbackTimer = setTimeout(() => { actionFeedback.value = '' }, 2800)
  await nextTick()
  guideBar.value?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  guideBar.value?.querySelector<HTMLButtonElement>('.experience-next')?.focus({ preventScroll: true })
}

/* ---------------- 步骤状态 ---------------- */
const activeStep = computed(
  () => experienceSteps.find((step) => step.key === activeKey.value) ?? experienceSteps[0],
)
const motionRoot = ref<HTMLElement>()
const dataStep = ref<InstanceType<typeof ExperienceDataPrepStep>>()
useExperienceMotion(motionRoot, computed(() => activeStep.value.index), props.animateOnMount !== false)
const nextStep = computed(() => experienceSteps[activeStep.value.index] ?? null)
const previousStep = computed(() => experienceSteps[activeStep.value.index - 2] ?? null)
const { track: stepTrack, ready: stepHighlightReady, style: stepHighlightStyle } = useSlidingHighlight(computed(() => activeStep.value.index - 1))

function selectStep(key: string): void {
  activeKey.value = key
}

function goNext(): void {
  if (activeKey.value === 'data') {
    if (dataStep.value?.pendingImport) void dataStep.value.handleImport()
    else navigate('resource')
    return
  }
  if (activeKey.value === 'operator') { void handleOperatorSubmit(); return }
  const target = nextStep.value
  if (!target) return
  activeKey.value = target.key
}

/* ---------------- 运行记录相关资源 ---------------- */
const runWorkflow = ref<RunDetail['workflow'] | null>(null)
const workflowRunId = ref('')
const runResourcesPending = ref(false)

async function loadRunResources(runId: string): Promise<void> {
  if (import.meta.server) return
  if (!runId) {
    runWorkflow.value = null
    workflowRunId.value = ''
    runResourcesPending.value = false
    return
  }
  if (workflowRunId.value === runId && runWorkflow.value) { runResourcesPending.value = false; return }
  runResourcesPending.value = true
  try {
    const workflow = await getRunWorkflow(props.domain, runId)
    if (selectedRunId.value === runId) { runWorkflow.value = workflow; workflowRunId.value = runId }
  } catch {
    if (selectedRunId.value === runId) runWorkflow.value = null
  } finally {
    if (selectedRunId.value === runId) runResourcesPending.value = false
  }
}

watch(selectedRunId, (runId) => { void loadRunResources(runId) }, { immediate: true })

function handleInspect(runId: string): void {
  void navigateTo(`/domains/${props.domain}/runs/${runId}`)
}
function handleResult(runId: string): void {
  navigate('result', runId)
}

/* ---------------- 01 数据准备：上传/删除后刷新、一键导入 ---------------- */
function handleDatasetUpdated(updated: DatasetItem): void {
  datasets.value = datasets.value.map(item => item.dataset_id === updated.dataset_id ? updated : item)
}

async function handleImported(result: ImportResult): Promise<void> {
  if (result.status === 'imported' || result.status === 'already_all') {
    // The import is already committed. Navigate immediately; refresh data in
    // parallel without holding the user's transition behind two GET requests.
    navigate('resource')
    await Promise.allSettled([refreshDatasets(), refreshClusters()])
  }
}

/* ---------------- 03 算子选择：提交后新增运行记录并跳转流程编排 ---------------- */
const operatorSubmitting = ref(false)
const operatorSubmitMessage = ref('')
const duplicateMatch = ref<{ run: Run; dataKnown: boolean } | null>(null)
let resolveDuplicate: ((choice: 'create' | 'existing' | 'cancel') => void) | undefined
const snapshotStorageKey = `experience-input-snapshots-v1:${props.domain}:${props.scenarioId}`
function readInputSnapshots(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(snapshotStorageKey) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}
function saveInputSnapshot(runId: string, key: string): void {
  try { localStorage.setItem(snapshotStorageKey, JSON.stringify({ ...readInputSnapshots(), [runId]: key })) } catch { /* Missing storage falls back to an operator-only warning. */ }
}
function chooseDuplicate(choice: 'create' | 'existing' | 'cancel'): void {
  const resolve = resolveDuplicate
  resolveDuplicate = undefined
  duplicateMatch.value = null
  resolve?.(choice)
}
function askAboutDuplicate(match: { run: Run; dataKnown: boolean }): Promise<'create' | 'existing' | 'cancel'> {
  duplicateMatch.value = match
  return new Promise(resolve => { resolveDuplicate = resolve })
}
onBeforeUnmount(() => chooseDuplicate('cancel'))
const submissionBusy = computed(() => operatorSubmitting.value || !!pendingSubmission.value)
const nextBusy = computed(() => activeKey.value === 'operator' ? submissionBusy.value : activeKey.value === 'data' && !!dataStep.value?.importing)
const nextDisabled = computed(() => !nextStep.value || (activeKey.value === 'operator' && (!chosenOperators.value.length || submissionBusy.value)) || (activeKey.value === 'data' && (!dataStep.value?.uploadedCount || dataStep.value?.busy)))
const nextLabel = computed(() => activeKey.value === 'operator' ? (pendingSubmission.value ? '同步任务中…' : operatorSubmitting.value ? '处理中…' : '提交并编排') : activeKey.value === 'data' ? (dataStep.value?.importing ? '导入中…' : dataStep.value?.pendingImport ? '导入并继续' : '前往资源调度') : nextStep.value ? '下一步' : '已到最后一步')
let submitTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(submitTimer))

function finishPendingSubmission(): void {
  const result = pendingSubmission.value
  if (!result || !scenarioRuns.value.some(run => run.run_id === result.run_id)) return
  runWorkflow.value = result.workflow
  workflowRunId.value = result.run_id
  submittedRunId.value = result.run_id
  pendingSubmission.value = null
  operatorSubmitMessage.value = ''
  // A delayed refresh must not pull someone out of a different step.
  navigate(activeKey.value === 'operator' ? 'workflow' : activeKey.value, result.run_id)
}

async function handleOperatorSubmit(): Promise<void> {
  if (submissionBusy.value) return
  const ids = [...(chosenOperatorIds.value ?? [])]
  if (!ids.length) {
    operatorSubmitMessage.value = '请先选择本次体验的算子'
    submitTimer = setTimeout(() => { operatorSubmitMessage.value = '' }, 2400)
    return
  }
  operatorSubmitting.value = true
  operatorSubmitMessage.value = ''
  let dataKey: string
  try {
    // Read the backend's latest records; do not infer duplicates from navigation state.
    const [, currentDatasets] = await Promise.all([refreshRuns(), getDatasets(props.domain)])
    if (disposed) return
    datasets.value = currentDatasets
    dataKey = preparedDataKey(currentDatasets.filter(item => item.scenario_id === props.scenarioId))
    const duplicate = findDuplicatePlan(scenarioRuns.value, ids, dataKey, readInputSnapshots())
    if (duplicate) {
      const choice = await askAboutDuplicate(duplicate)
      if (choice === 'existing') {
        submittedRunId.value = duplicate.run.run_id
        navigate('workflow', duplicate.run.run_id)
      }
      if (choice !== 'create' || disposed) {
        operatorSubmitting.value = false
        return
      }
    }
  } catch {
    operatorSubmitMessage.value = '暂时无法核对已有任务，请稍后重试'
    operatorSubmitting.value = false
    return
  }
  try {
    pendingSubmission.value = await submitOperators(props.domain, props.scenarioId, ids)
    saveInputSnapshot(pendingSubmission.value.run_id, dataKey)
  } catch (error) {
    operatorSubmitMessage.value = (error as { data?: { message?: string } })?.data?.message || '算子提交失败，请稍后重试'
    operatorSubmitting.value = false
    return
  }
  // POST is committed. A failed GET only retries synchronization, never submission.
  operatorSubmitMessage.value = '任务已创建，正在同步运行状态…'
  try { await refreshRuns() } catch { /* pollRuns retries the read */ }
  finally { operatorSubmitting.value = false }
}

/* All visible runs refresh from the same server clock, without POST-driven ticks. */
const selectedRun = computed(() => scenarioRuns.value.find(run => run.run_id === selectedRunId.value))
const runOperators = computed(() => (operators.value ?? []).filter(operator => selectedRun.value?.selected_operator_ids?.includes(operator.name)))
const resultAvailable = computed(() => canViewResult(selectedRun.value))
const liveMessage = ref('')
let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
async function pollRuns(): Promise<void> {
  try {
    await refreshRuns()
    if (disposed) return
    if (activeKey.value === 'workflow' && selectedRunId.value) {
      const id = selectedRunId.value
      const workflow = await getRunWorkflow(props.domain, id)
      if (!disposed && selectedRunId.value === id) runWorkflow.value = workflow
    }
    liveMessage.value = ''
  } catch {
    if (!disposed) liveMessage.value = '状态刷新暂时失败，正在自动重试…'
  } finally {
    if (!disposed) pollTimer = setTimeout(() => { void pollRuns() }, 1300)
  }
}
onMounted(() => { void pollRuns() })
onBeforeUnmount(() => { disposed = true; clearTimeout(pollTimer) })
watch(activeKey, key => { if (key === 'resource') void refreshClusters() })
</script>

<template>
  <section class="experience-flow experience-polished" :inert="!interactionReady" :aria-busy="!interactionReady">
    <div class="experience-overview">
      <header class="experience-head">
        <div class="experience-head-text">
          <div class="experience-title-row">
            <h2>{{ experience?.title ?? detail?.name ?? '场景体验' }}</h2>
            <button type="button" class="experience-start sc-action" :disabled="submissionBusy" title="恢复推荐算子和默认记录，返回数据准备；保留已上传数据" :class="{ 'is-confirmed': actionFeedback }" @click="startExperience">
              <span class="experience-start-icon"><Check v-if="actionFeedback" aria-hidden="true" /><RotateCcw v-else aria-hidden="true" /></span>
              <span>{{ actionFeedback || '恢复推荐方案' }}</span>
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
          :disabled="requiresSubmittedPlan(step.key) && !workflowAllowed"
          :title="requiresSubmittedPlan(step.key) && !workflowAllowed ? '先选择算子并提交，再进入' + step.title : undefined"
          @click="selectStep(step.key)"
        >
          <span class="experience-step-index">{{ String(step.index).padStart(2, '0') }}</span>
          <span class="experience-step-text">
            <strong>{{ step.title }}</strong>
            <LockKeyhole v-if="requiresSubmittedPlan(step.key) && !workflowAllowed" class="experience-step-lock" aria-hidden="true" />
          </span>
        </button>
      </nav>
    <div ref="guideBar" class="experience-guide">
      <p class="experience-guide-line" role="status">
        <span class="experience-guide-progress">{{ guideActive ? '体验' : '步骤' }} {{ activeStep.index }} / {{ experienceSteps.length }}</span>
        <span class="experience-guide-summary" :title="guideSummary">{{ guideSummary }}</span>
      </p>
      <div class="experience-guide-actions">
        <button :disabled="!previousStep" type="button" class="experience-previous sc-action" @click="previousStep && selectStep(previousStep.key)"><ArrowLeft class="experience-nav-arrow" aria-hidden="true" /> 上一步</button>
        <button :disabled="nextDisabled" :aria-busy="nextBusy" type="button" class="experience-next sc-action sc-action--primary" :title="nextStep ? '下一步：' + nextStep.title : '已是最后一步'" @click="goNext">
          <LoaderCircle v-if="nextBusy" class="is-spinning" aria-hidden="true" />{{ nextLabel }} <ArrowRight v-if="!nextBusy" class="experience-nav-arrow action-arrow" aria-hidden="true" />
        </button>
      </div>
    </div>
    </div>

    <div ref="motionRoot" class="experience-body">
      <p v-if="liveMessage" role="status" class="experience-live-message">{{ liveMessage }}</p>
      <div class="experience-step-content">
      <Transition name="experience-panel" mode="out-in"
        @before-leave="el => el.setAttribute('inert', '')"
        @before-enter="el => el.removeAttribute('inert')"
        @leave-cancelled="el => el.removeAttribute('inert')">
      <KeepAlive :max="6">
      <ExperienceDataPrepStep
        ref="dataStep"
        v-if="activeKey === 'data'"
        :domain="domain"
        :scenario-id="scenarioId"
        :detail="detail"
        :benchmark="benchmark"
        :params="params"
        :cluster-name="clusterName"
        :datasets="datasets ?? []"
        @updated="handleDatasetUpdated"
        @imported="handleImported"
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
        :submitting="submissionBusy"
        :submitted-message="operatorSubmitMessage"
        @update:chosen-ids="chosenOperatorIds = $event"
        @submit="handleOperatorSubmit"
      />

      <ExperienceWorkflowStep
        v-else-if="activeKey === 'workflow'"
        :domain="domain"
        :runs="scenarioRuns"
        :selected-run-id="selectedRunId"
        :workflow="runWorkflow"
        :pending="runResourcesPending"
        :chosen-operators="runOperators"
        @update:selected-run-id="(value) => (selectedRunId = value)"
      />

      <ExperienceMonitorStep
        v-else-if="activeKey === 'monitor'"
        :runs="scenarioRuns"
        :domain="domain"
        :selected-run-id="selectedRunId"
        :submitted-run-id="submittedRunId"
        @update:selected-run-id="(value) => (selectedRunId = value)"
        @inspect="handleInspect"
        @result="handleResult"
      />

      <ExperienceResultStep
        v-else-if="activeKey === 'result'"
        :domain="domain"
        :run-id="selectedRunId"
        :available="resultAvailable"
        :run-status="selectedRun?.status"
        :progress="selectedRun?.progress"
        @back-to-monitor="selectStep('monitor')"
      />
      </KeepAlive>
      </Transition>
      </div>
    </div>
  <Teleport to="body">
    <Transition name="experience-feedback">
      <div v-if="actionFeedback" class="experience-feedback" role="status"><span aria-hidden="true">✓</span><div><strong>{{ actionFeedback }}</strong><p>已回到数据准备，恢复 {{ chosenOperators.length }} 个推荐算子和默认运行记录。</p></div></div>
    </Transition>
  </Teleport>
  <el-dialog :model-value="!!duplicateMatch" :title="duplicateMatch?.dataKnown ? '已有相同配置的任务' : '已有相同算子的任务'" width="min(480px, calc(100vw - 32px))" align-center class="experience-duplicate-dialog" modal-class="experience-duplicate-overlay" :show-close="false" :close-on-click-modal="false" @update:model-value="value => { if (!value) chooseDuplicate('cancel') }">
    <template v-if="duplicateMatch">
      <p class="duplicate-summary">{{ duplicateMatch.dataKnown ? '当前准备的数据与算子组合，和以下任务一致。' : '以下任务使用了相同的算子组合。' }}</p>
      <div class="duplicate-record">
        <div class="duplicate-record-heading"><span>已有任务</span><span class="duplicate-record-status" :class="`is-${duplicateMatch.run.status}`">{{ statusText(duplicateMatch.run.status) }}</span></div>
        <p class="duplicate-run-id">{{ duplicateMatch.run.run_id }}</p>
      </div>
      <p v-if="!duplicateMatch.dataKnown" class="duplicate-note">旧任务的数据无法比对，仅确认算子相同。</p>
    </template>
    <template #footer>
      <div class="duplicate-actions">
        <button type="button" class="sc-action" @click="chooseDuplicate('cancel')">取消</button>
        <button type="button" class="sc-action" @click="chooseDuplicate('create')">仍然创建</button>
        <button type="button" class="sc-action sc-action--primary" @click="chooseDuplicate('existing')">查看已有任务</button>
      </div>
    </template>
  </el-dialog>
  </section>
</template>

<style scoped>
:global(.el-dialog.experience-duplicate-dialog) { padding: 26px; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 20px 64px rgb(24 40 64 / 18%); }
:global(.experience-duplicate-overlay) { background: rgb(24 36 54 / 34%); }
:global(.experience-duplicate-dialog .el-dialog__header) { padding: 0 0 16px; }
:global(.experience-duplicate-dialog .el-dialog__title) { color: #25344a; font-size: 19px; font-weight: 600; line-height: 1.5; }
:global(.experience-duplicate-dialog .el-dialog__body) { padding: 0; }
:global(.experience-duplicate-dialog .el-dialog__footer) { padding: 24px 0 0; }
.duplicate-summary { margin: 0 0 18px; color: #53657b; font-size: 14px; line-height: 1.7; }
.duplicate-record { padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f7f9fc; }
.duplicate-record-heading { display: flex; justify-content: space-between; align-items: center; color: #718096; font-size: 12px; }
.duplicate-record-status { color: #62738a; }
.duplicate-record-status.is-success { color: #278366; }
.duplicate-record-status.is-running { color: #3269d6; }
.duplicate-record-status.is-failed { color: #b24e59; }
.duplicate-run-id { margin: 10px 0 0; color: #2d405b; font: 500 14px/1.5 var(--scnet-font-mono); overflow-wrap: anywhere; }
.duplicate-note { margin: 12px 0 0; color: #7a8799; font-size: 12px; line-height: 1.6; }
.duplicate-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.duplicate-actions .sc-action { width: 100%; height: 42px; min-width: 0; padding-inline: 8px; box-sizing: border-box; }
@media (max-width: 480px) {
  :global(.el-dialog.experience-duplicate-dialog) { padding: 20px; }
  .duplicate-actions { gap: 6px; }
  .duplicate-actions .sc-action { padding-inline: 6px; }
}
.experience-flow { display: grid; gap: 20px; min-width: 0; overflow-anchor: none; }
.experience-step-content { display: grid; align-items: start; min-width: 0; }
.experience-step-content > :deep(*) { grid-area: 1 / 1; min-width: 0; }
.experience-panel-enter-active { transition: opacity 160ms cubic-bezier(.2,.7,.2,1), translate 160ms cubic-bezier(.2,.7,.2,1); }
.experience-panel-leave-active { transition: opacity 70ms ease-out; pointer-events: none; }
.experience-panel-enter-from { opacity: 0; translate: 0 var(--step-entry-offset, 6px); }
.experience-panel-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .experience-panel-enter-active, .experience-panel-leave-active { transition: none; }
  .experience-panel-enter-from { translate: none; }
}
.experience-overview { min-width: 0; overflow: hidden; border: 1px solid #e1e6ed; border-radius: 12px; background: #fff; box-shadow: 0 2px 7px rgb(31 45 61 / 4.5%); }
.experience-head { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(380px, 1fr); align-items: center; gap: 24px; padding: 22px; }
.experience-head-text { min-width: 0; }
.experience-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 14px 20px; }
.experience-start { min-width: 128px; min-height: 36px; font-size: 12px; }
.experience-start svg { width: 15px; height: 15px; }
.experience-start.is-confirmed { color: var(--scnet-success); }
.experience-feedback { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 3000; display: flex; gap: 12px; align-items: center; width: max-content; max-width: calc(100vw - 32px); padding: 16px 22px; border: 1px solid #cde3d6; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgb(31 45 61 / 14%); pointer-events: none; }
.experience-feedback > span { display: grid; place-items: center; flex: 0 0 30px; height: 30px; border-radius: 50%; background: #edf7f0; color: #26734d; }
.experience-feedback strong { font-size: 15px; color: var(--scnet-text); }
.experience-feedback p { margin: 3px 0 0; color: var(--scnet-text-secondary); font-size: 13px; }
.experience-feedback-enter-active, .experience-feedback-leave-active { transition: opacity 180ms ease, translate 180ms ease; }
.experience-feedback-enter-from, .experience-feedback-leave-to { opacity: 0; translate: 0 -8px; }
.experience-head-text h2 { margin: 0; font-size: clamp(24px, 1.65vw, 30px); font-weight: 650; line-height: 1.35; text-wrap: balance; }
.experience-desc { margin: 8px 0 0; color: var(--scnet-text-secondary); font-size: 14px; line-height: 1.65; text-wrap: pretty; }
.experience-tech-stack { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-top: 10px; color: #63758c; font-size: 12px; }
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
.experience-step-text { display: inline-flex; align-items: center; gap: 6px; }
.experience-step-lock { width: 12px; height: 12px; flex-shrink: 0; }
.experience-step:disabled { opacity: .55; cursor: not-allowed; }
.experience-guide { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; min-height: 60px; padding: 10px 20px; border-top: 1px solid var(--scnet-divider); background: #fbfcfe; }
.experience-guide-line { display: flex; align-items: center; gap: 14px; min-width: 0; margin: 0; font-size: 16px; color: var(--scnet-text-secondary); }
.experience-guide-progress { flex-shrink: 0; color: var(--scnet-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.experience-guide-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.experience-guide-actions { display: flex; gap: 8px; }
.experience-guide-actions button { height: 44px; padding-inline: 14px; font-size: 14px; }
.experience-nav-arrow { display: inline-block; transition: transform 180ms var(--scnet-hover-easing); }
.experience-previous:enabled:is(:hover, :focus-visible) .experience-nav-arrow { transform: translateX(-3px); }
.experience-next:enabled:is(:hover, :focus-visible) .experience-nav-arrow { transform: translateX(3px); }
.experience-guide-actions button:disabled { border-color: #e5e9ef; background: #f1f3f6; color: #a1a8b3; cursor: not-allowed; }
.experience-live-message { margin: 0 0 12px; padding: 12px 16px; background: #fff5e5; color: #906020; border-radius: 8px; }
.experience-body { min-width: 0; }
button:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: -3px; }
@media (max-width: 1100px) { .experience-head { grid-template-columns: 1fr; gap: 24px; } .experience-metrics { max-width: 620px; } }
@media (max-width: 420px) { .experience-metrics.has-many { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .experience-step { flex-direction: column; gap: 6px; } .experience-steps { padding-inline: 8px; } }
@media (max-width: 560px) {
  .experience-head { padding: 16px; gap: 16px; }
  .experience-desc { font-size: 14px; }
  .experience-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .experience-step { flex-direction: row; min-height: 44px; gap: 4px; }
  .experience-step-text strong { font-size: 12px; }
  .experience-step-index { width: 24px; height: 24px; font-size: 11px; }
  .experience-metrics { gap: 16px 0; }
  .experience-metrics > div { padding: 6px 10px; }
  .experience-metrics dd { font-size: 21px; }
  .experience-metrics small { font-size: 12px; }
  .experience-guide { grid-template-columns: 1fr; gap: 10px; padding: 12px 16px; }
  .experience-guide-line { height: 28px; font-size: 15px; }
  .experience-guide-actions { width: auto; max-width: 100%; justify-self: end; }
}
@media (prefers-reduced-motion: reduce) {
  .experience-guide-actions button, .experience-nav-arrow { transition: none; }
  .experience-guide-actions button:enabled:is(:hover, :focus-visible, :active), .experience-guide-actions button:enabled:is(:hover, :focus-visible) .experience-nav-arrow { transform: none; }
  .experience-step, .experience-start, .experience-feedback-enter-active, .experience-feedback-leave-active { transition: none; }
  .experience-start:hover, .experience-start:active { transform: none; }
  .experience-feedback-enter-from, .experience-feedback-leave-to { translate: none; }
}
</style>
