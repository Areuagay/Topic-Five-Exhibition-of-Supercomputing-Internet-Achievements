import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFile(resolve(ROOT, path), 'utf8')
const readJson = async path => JSON.parse((await read(path)).replace(/^\uFEFF/, ''))
const DOMAINS = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']

test('operator cards expose the real runtime environment and a runtime filter', async () => {
  const component = await read('frontend/components/experience/ExperienceOperatorStep.vue')
  assert.match(component, /runtime_label/)
  assert.match(component, /deployment_label/)
  assert.match(component, /runtimeFilter/)
  assert.match(component, /runtimeOptions/)
  assert.match(component, /运行环境/)
  assert.match(component, /按运行环境筛选/)
})

test('workflow DAG nodes render operator CPU, GPU, memory, runtime and core-hours', async () => {
  const dag = await read('frontend/components/WorkflowDag.vue')
  assert.match(dag, /node\.operator_id/)
  assert.match(dag, /node\.cpu_cores/)
  assert.match(dag, /node\.gpu_count/)
  assert.match(dag, /node\.memory_mb/)
  assert.match(dag, /node\.core_hours/)
  assert.match(dag, /runtime_label/)
  assert.match(dag, /workflow-node-resources/)
  assert.match(dag, /累计核时/)
  assert.match(dag, /运行环境/)
})

test('generated operator data carries Singularity and Docker environments, not one hardcoded value', async () => {
  const kinds = new Set()
  for (const domain of DOMAINS) {
    const operators = (await readJson(`mock-data/${domain}/operators.json`)).data
    for (const operator of operators) {
      assert.ok(operator.runtime_label, `${domain}/${operator.name} runtime_label`)
      kinds.add(operator.runtime_label)
    }
  }
  assert.ok(kinds.has('Singularity'))
  assert.ok(kinds.has('Docker'))

  const geodynamics = (await readJson('mock-data/geodynamics/operators.json')).data
  const supg = geodynamics.find(operator => operator.name === 'supg')
  assert.equal(supg.runtime_label, 'Singularity')
  assert.equal(supg.deployment_label, '平台实例')
})

test('run detail and workflow step show elapsed against planned time from operators', async () => {
  const detail = await read('frontend/components/run/RunDetailContent.vue')
  assert.match(detail, /planned_seconds/)
  assert.match(detail, /remaining_seconds/)
  assert.match(detail, /已运行 \/ 预计/)
  assert.doesNotMatch(detail, /本条任务算子/)
  assert.doesNotMatch(detail, /以上资源按工作流中实际使用的算子信息汇总/)
  assert.doesNotMatch(detail, /run-operator-strip/)
  assert.doesNotMatch(detail, /run-resource-note/)

  const workflow = await read('frontend/components/experience/ExperienceWorkflowStep.vue')
  assert.match(workflow, /planned_seconds/)
  assert.match(workflow, /durationText/)
  assert.doesNotMatch(workflow, /按本条工作流实际使用的算子信息汇总/)
  assert.doesNotMatch(workflow, /exp-toolbar-note/)
})
