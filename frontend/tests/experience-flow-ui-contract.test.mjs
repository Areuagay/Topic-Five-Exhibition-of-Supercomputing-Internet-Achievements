import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const stepComponents = [
  'ExperienceDataPrepStep.vue',
  'ExperienceResourceStep.vue',
  'ExperienceOperatorStep.vue',
  'ExperienceWorkflowStep.vue',
  'ExperienceMonitorStep.vue',
  'ExperienceResultStep.vue',
]

test('experience flow keeps the original scenario context without an inactive CTA', async () => {
  const flow = await read('../components/experience/ExperienceFlow.vue')

  assert.match(flow, /detail\?\.description/)
  assert.match(flow, /aria-label="关键指标"/)
  assert.doesNotMatch(flow, /class="experience-cta"|自动引导功能开发中|主前端/)
})

test('experience flow renders the six ordered steps as navigation', async () => {
  const flow = await read('../components/experience/ExperienceFlow.vue')

  assert.match(flow, /<nav[^>]*class="experience-steps"[^>]*aria-label="体验流程步骤"/)
  assert.match(flow, /v-for="step in experienceSteps"/)
  assert.match(flow, /:aria-current="step\.key === activeKey \? 'step' : undefined"/)
  assert.match(flow, /@click="selectStep\(step\.key\)"/)
  assert.match(flow, /:disabled="!previousStep"/)
  assert.match(flow, /:disabled="!nextStep"/)
  assert.doesNotMatch(flow, /v-if="(?:nextStep|previousStep)"/)

  for (const component of stepComponents) {
    assert.match(flow, new RegExp(`import ${component.replace('.vue', '')} from '\\./${component.replace('.', '\\.')}'`))
    assert.match(flow, new RegExp(`<${component.replace('.vue', '')}\\b`))
  }
})

test('experience step config keeps the ordered six-step contract', async () => {
  const config = await read('../config/scenario-experience.ts')

  const expected = [
    ['data', 1, '数据准备'],
    ['resource', 2, '资源调度'],
    ['operator', 3, '算子选择'],
    ['workflow', 4, '流程编排'],
    ['monitor', 5, '执行监控'],
    ['result', 6, '结果展示'],
  ]
  for (const [key, index, title] of expected) {
    assert.match(config, new RegExp(`key: '${key}'`))
    assert.match(config, new RegExp(`index: ${index}`))
    assert.match(config, new RegExp(`title: '${title}'`))
  }
  assert.match(config, /export function getScenarioExperience\(/)
  assert.match(config, /'wave-propagation'/)
  assert.match(config, /'tectonic-evolution'/)
  assert.match(config, /return Object\.hasOwn\(scenarioExperiences, id\)/)

  for (const id of [
    'llm-pretraining',
    'pinn-acceleration',
    'vehicle-crash',
    'fatigue-life',
    'swarm-coordination',
    'path-planning',
    'virtual-screening',
    'admet-prediction',
    'band-dos',
    'high-throughput-screening',
  ]) {
    assert.match(config, new RegExp(`'${id}':`), `config missing scenario ${id}`)
  }

  assert.match(config, /export const experienceDatasetTypeLabels/)
  assert.match(config, /export const experienceStageLabels/)
  assert.match(config, /export function getDatasetTypeLabels\(/)
  assert.match(config, /export function getStageLabels\(/)
})

test('experience datasets and fixed labels are provided per discipline domain', async () => {
  const domains = {
    automotive: ['vehicle-crash', 'fatigue-life'],
    dft: ['band-dos', 'high-throughput-screening'],
    drug: ['virtual-screening', 'admet-prediction'],
    llm: ['llm-pretraining', 'pinn-acceleration'],
    uav: ['swarm-coordination', 'path-planning'],
  }
  for (const [domain, scenarios] of Object.entries(domains)) {
    const raw = await read(`../../mock-data/${domain}/datasets.json`)
    const payload = JSON.parse(raw)
    assert.equal(payload.code, 200, `${domain} datasets code`)
    assert.ok(Array.isArray(payload.data) && payload.data.length > 0, `${domain} datasets non-empty`)
    const covered = new Set(payload.data.map((item) => item.scenario_id))
    for (const scenarioId of scenarios) {
      assert.ok(covered.has(scenarioId), `${domain} datasets missing scenario ${scenarioId}`)
    }
    for (const item of payload.data) {
      for (const field of ['dataset_id', 'scenario_id', 'name', 'type', 'format', 'size_bytes', 'status']) {
        assert.ok(item[field] !== undefined, `${domain} dataset missing ${field}`)
      }
      assert.ok(['ready', 'processing', 'failed'].includes(item.status))
    }
  }

  const prep = await read('../components/experience/ExperienceDataPrepStep.vue')
  assert.match(prep, /import \{ getDatasetTypeLabels \} from '~\/config\/scenario-experience'/)
  assert.match(prep, /getDatasetTypeLabels\(props\.domain\)/)
  assert.doesNotMatch(prep, /const TYPE_LABELS/)

  const workflow = await read('../components/experience/ExperienceWorkflowStep.vue')
  assert.match(workflow, /domain: string/)
  assert.match(workflow, /getStageLabels\(props\.domain\)/)
  assert.doesNotMatch(workflow, /const STAGE_TEXT/)

  const flow = await read('../components/experience/ExperienceFlow.vue')
  assert.match(flow, /<ExperienceWorkflowStep[\s\S]*:domain="domain"/)

  const runDetail = await read('../components/run/RunDetailContent.vue')
  assert.match(runDetail, /getStageLabels\(props\.domain\)/)
  assert.doesNotMatch(runDetail, /const STAGE_TEXT/)
})

test('experience datasets are served from the backend through the api layer', async () => {
  const raw = await read('../../mock-data/geodynamics/datasets.json')
  const payload = JSON.parse(raw)

  assert.equal(payload.code, 200)
  assert.ok(Array.isArray(payload.data) && payload.data.length > 0)
  for (const item of payload.data) {
    for (const field of ['dataset_id', 'scenario_id', 'name', 'type', 'format', 'size_bytes', 'status']) {
      assert.ok(item[field] !== undefined, `dataset missing ${field}`)
    }
    assert.ok(['ready', 'processing', 'failed'].includes(item.status))
  }

  const api = await read('../composables/useApi.ts')
  assert.match(api, /getDatasets: \(domain: string\) => request<DatasetItem\[\]>\(`\/\$\{domain\}\/datasets`\)/)

  const types = await read('../types/index.ts')
  assert.match(types, /export interface DatasetItem/)
  assert.match(types, /dataset_id: string/)
  assert.match(types, /scenario_id: string/)
})

test('experience click-through steps reuse existing backend resources', async () => {
  const flow = await read('../components/experience/ExperienceFlow.vue')

  assert.match(flow, /getDatasets/)
  assert.match(flow, /getClusters/)
  assert.match(flow, /getOperators/)
  assert.match(flow, /getRuns/)
  assert.match(flow, /getRunWorkflow/)
  assert.match(flow, /await useAsyncData/)
  assert.match(flow, /if \(import\.meta\.server\) return/)
})

test('data preparation step embeds the current scenario content and dataset table', async () => {
  const step = await read('../components/experience/ExperienceDataPrepStep.vue')

  assert.match(step, /<ScenarioDetailContent/)
  assert.match(step, /scenarioDatasets/)
  assert.match(step, /item\.scenario_id === props\.scenarioId/)
  assert.match(step, /formatBytes/)
  assert.doesNotMatch(step, /GET \/api\/v1/)
})

test('resource and operator views distinguish scene recommendations from execution', async () => {
  const resource = await read('../components/experience/ExperienceResourceStep.vue')
  assert.match(resource, /supportedClusters/)
  assert.match(resource, /is-supported/)
  assert.match(resource, /算力资源/)
  assert.doesNotMatch(resource, /将跳转主前端|GET \/api\/v1/)

  const operator = await read('../components/experience/ExperienceOperatorStep.vue')
  assert.match(operator, /selectedOperators/)
  assert.doesNotMatch(operator, /已选用|将跳转主前端|GET \/api\/v1/)
  assert.match(operator, /formatBytes/)
})

test('workflow and monitor steps reuse the run-detail capability', async () => {
  const workflow = await read('../components/experience/ExperienceWorkflowStep.vue')
  assert.match(workflow, /<WorkflowDag/)
  assert.match(workflow, /update:selectedRunId/)

  const monitor = await read('../components/experience/ExperienceMonitorStep.vue')
  assert.match(monitor, /emit\('inspect'/)
  assert.match(monitor, /has_detail/)
  assert.match(monitor, /emit\('result', row\.run_id\)/)
  assert.doesNotMatch(monitor, /<NuxtLink/)
})

test('result step inlines the selected run record detail instead of navigating', async () => {
  const flow = await read('../components/experience/ExperienceFlow.vue')

  assert.doesNotMatch(flow, /useRouter|router\.push/)
  assert.match(flow, /<ExperienceResultStep\s+v-else-if="activeKey === 'result'"/)
  assert.match(flow, /:run-id="selectedRunId"/)

  const step = await read('../components/experience/ExperienceResultStep.vue')
  assert.match(step, /import RunDetailContent from '~\/components\/run\/RunDetailContent\.vue'/)
  assert.match(step, /<RunDetailContent/)
  assert.match(step, /:domain="props\.domain"/)
  assert.match(step, /:run-id="props\.runId"/)

  const config = await read('../config/scenario-experience.ts')
  assert.match(config, /export type ExperienceStepMode = 'live' \| 'external'/)
  assert.doesNotMatch(config, /'navigate'/)
  assert.match(config, /summary: '查看所选任务的计算结果、图表与成果文件'/)
  assert.match(config, /mode: 'live'/)
})

test('scenario page mounts the experience flow and keeps the detail fallback', async () => {
  const page = await read('../pages/domains/[domain]/scenarios/index.vue')

  assert.match(page, /import ExperienceFlow from '~\/components\/experience\/ExperienceFlow\.vue'/)
  assert.match(page, /import \{ getScenarioExperience \} from '~\/config\/scenario-experience'/)
  assert.match(page, /const experienceEnabled = computed\(\(\) => !!getScenarioExperience\(selectedScenarioId\.value\)\)/)
  assert.match(page, /<ExperienceFlow\s+v-if="experienceEnabled"/)
  assert.match(page, /<ScenarioDetailContent\s+v-else/)
})

test('the geodynamics datasets endpoint is documented', async () => {
  const spec = await read('../../docs/api/Topic5-GeoDynamics.openapi.json')

  assert.match(spec, /"\/api\/v1\/geodynamics\/datasets"/)
  assert.match(spec, /getGeodynamicsDatasets/)

  const readme = await read('../../docs/api/README.md')
  assert.match(readme, /Topic5-GeoDynamics\.openapi\.json\) \| 课题五-地球动力学模拟接口 \| 19 \| 1\.4\.0/)
  assert.match(readme, /GET \/\{prefix\}\/datasets/)
})
