import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { DOMAIN_WORKFLOW_TEMPLATES } from '../domain-workflows.js'
import { analyzeWorkflow, advanceWorkflow, OPERATOR_DEPENDENCIES } from '../workflow-engine.js'
import { applyOperatorPlan, needsOperatorPlan, operatorResources } from '../operator-plan.js'
import { createExperienceStore } from '../experience-store.js'

const root = resolve(import.meta.dirname, '../..')
const dataDir = resolve(root, 'mock-data')
const read = (domain, file) => JSON.parse(readFileSync(resolve(dataDir, domain, `${file}.json`), 'utf8')).data
const fixedCounts = {
  'llm-pretraining': 13, 'pinn-acceleration': 14,
  'vehicle-crash': 15, 'fatigue-life': 16,
  'swarm-coordination': 12, 'path-planning': 17,
  'virtual-screening': 11, 'admet-prediction': 10,
  'band-dos': 18, 'high-throughput-screening': 19,
}
const node = (workflow, id) => workflow.nodes.find(item => item.id === id || item.operator_id === id)
function build(scenario, selected) {
  const template = DOMAIN_WORKFLOW_TEMPLATES[scenario]
  const detail = {
    scenario_id: scenario, status: 'queued', progress: 0, selected_operator_ids: selected,
    workflow: { nodes: [{ id: 'prepare' }, { id: 'post' }], edges: [] }, _operator_version: 6,
  }
  applyOperatorPlan(template.domain, detail, read(template.domain, 'operators'), [], { realtime: true })
  return detail
}
function reaches(workflow, start, target) {
  const { outgoing } = analyzeWorkflow(workflow)
  const seen = new Set()
  const queue = [start]
  for (const id of queue) {
    if (id === target) return true
    if (seen.has(id)) continue
    seen.add(id)
    queue.push(...outgoing.get(id).filter(next => !seen.has(next)))
  }
  return false
}
function setup(t) {
  const runtimeDir = mkdtempSync(resolve(tmpdir(), 'topic5-domain-workflows-'))
  t.after(() => {
    assert.ok(resolve(runtimeDir).startsWith(resolve(tmpdir()) + sep))
    rmSync(runtimeDir, { recursive: true, force: true })
  })
  let time = Date.parse('2026-11-24T03:00:00Z')
  return { runtimeDir, options: { dataDir, runtimeDir, now: () => time }, setTime: value => { time = value }, now: () => time }
}

test('ten scenarios use distinct fixed entities and preserve every selected-operator dependency across selection changes', () => {
  assert.equal(Object.keys(DOMAIN_WORKFLOW_TEMPLATES).length, 10)
  for (const [scenario, template] of Object.entries(DOMAIN_WORKFLOW_TEMPLATES)) {
    const catalog = read(template.domain, 'operators')
    const allIds = catalog.map(item => item.name)
    const details = Object.values(read(template.domain, 'scenario-details'))
    const recommended = details.find(item => item.id === scenario).operators.map(item => item.id)
    const selections = [recommended, allIds, [...allIds].reverse(), ...allIds.map(id => [id]), ...allIds.slice(1).map((id, index) => [allIds[index], id])]
    assert.equal(template.nodes.length, fixedCounts[scenario])
    for (const selected of selections) {
      const detail = build(scenario, selected)
      const workflow = detail.workflow
      const graph = analyzeWorkflow(workflow)
      const internal = workflow.nodes.filter(item => item.node_kind === 'internal')
      assert.equal(internal.length, fixedCounts[scenario], `${scenario}/${selected}`)
      assert.equal(detail.nodes, fixedCounts[scenario] + selected.length)
      assert.equal(workflow.template_id, template.id)
      assert.equal(workflow.template_summary, template.summary)
      assert.ok(!needsOperatorPlan(detail, new Set(allIds)))
      assert.deepEqual(new Set(workflow.nodes.filter(item => item.operator_id).map(item => item.operator_id)), new Set(selected))
      assert.ok(internal.every(item => item.description && item.planned_seconds >= 1 && item.core_hours === 0 && !item.operator_id))
      for (const current of workflow.nodes) {
        assert.ok(current.id === 'post' || reaches(workflow, current.id, 'post'), `${scenario}: ${current.id} reaches archive`)
        for (const edge of workflow.edges.filter(edge => edge.target === current.id)) {
          const parent = node(workflow, edge.source)
          assert.ok(parent.planned_start_seconds + parent.planned_seconds <= current.planned_start_seconds, `${scenario}: schedule respects ${edge.source} -> ${edge.target}`)
        }
        if (current.operator_id) {
          for (const parent of OPERATOR_DEPENDENCIES[template.domain][current.operator_id].filter(id => selected.includes(id))) {
            assert.ok(reaches(workflow, node(workflow, parent).id, current.id), `${parent} still precedes ${current.operator_id}`)
          }
        }
      }
      assert.deepEqual(graph.outgoing.get('post'), [])
      assert.ok([...graph.incoming.values()].filter(inputs => inputs.length > 1).length >= 2, `${scenario}: meaningful joins`)
      assert.ok([...graph.outgoing.values()].filter(outputs => outputs.length > 1).length >= 2, `${scenario}: independent branches`)
      let complete = false
      for (let tick = 0; tick < 120 && !complete; tick++) complete = advanceWorkflow(workflow, 1, 1)
      assert.ok(complete, `${scenario}: projected workflow can complete`)
    }
  }
  assert.equal(new Set(Object.values(fixedCounts)).size, 10, 'fixed node counts differ across all ten scenarios')
})

test('domain-specific preparation and verification branches have the intended data dependencies', () => {
  const full = scenario => build(scenario, read(DOMAIN_WORKFLOW_TEMPLATES[scenario].domain, 'operators').map(item => item.name)).workflow
  const pairs = [
    ['llm-pretraining', 'dataset-ready', 'megatron-core'],
    ['llm-pretraining', 'parallel-plan', 'megatron-core'],
    ['pinn-acceleration', 'collocation', 'lightgbm'],
    ['pinn-acceleration', 'prediction-merge', 'pde-residual'],
    ['vehicle-crash', 'contact-setup', 'case-partition'],
    ['fatigue-life', 'rainflow', 'miner-damage'],
    ['swarm-coordination', 'topology-audit', 'connectivity-eval'],
    ['path-planning', 'local-clearance', 'time-conflicts'],
    ['path-planning', 'trajectory-smoothing', 'trajectory-recheck'],
    ['virtual-screening', 'ligand-preparation', 'molecular-docking-cpu'],
    ['virtual-screening', 'receptor-grid-generation', 'molecular-docking-cpu'],
    ['admet-prediction', 'descriptors', 'reasonability-assessment'],
    ['band-dos', 'scf-audit', 'symtopo-band'],
    ['band-dos', 'band-path-audit', 'symtopo-topology'],
    ['high-throughput-screening', 'energy-collect', 'stability-check'],
    ['high-throughput-screening', 'trajectory-collect', 'stability-check'],
  ]
  for (const [scenario, source, target] of pairs) {
    const workflow = full(scenario)
    assert.ok(reaches(workflow, node(workflow, source).id, node(workflow, target).id), `${scenario}: ${source} -> ${target}`)
  }
  for (const [scenario, a, b] of [
    ['llm-pretraining', 'checkpoint-audit', 'heldout-eval'],
    ['pinn-acceleration', 'pde-residual', 'boundary-error'],
    ['vehicle-crash', 'acceleration-metrics', 'intrusion-metrics'],
    ['swarm-coordination', 'connectivity-eval', 'separation-check'],
    ['path-planning', 'local-clearance', 'kinematics'],
    ['virtual-screening', 'ligand-preparation', 'receptor-preparation'],
    ['admet-prediction', 'applicability', 'risk-classification'],
    ['band-dos', 'band-path-audit', 'dos-integration'],
    ['high-throughput-screening', 'energy-collect', 'trajectory-collect'],
  ]) {
    const workflow = full(scenario)
    assert.equal(reaches(workflow, node(workflow, a).id, node(workflow, b).id), false, `${scenario}: ${a} independent of ${b}`)
    assert.equal(reaches(workflow, node(workflow, b).id, node(workflow, a).id), false, `${scenario}: ${b} independent of ${a}`)
  }
})

test('all ten scenarios execute internal stages on the real clock, retain pause/restart state and gate results on final archive', t => {
  const { options, setTime, now } = setup(t)
  let store = createExperienceStore(options)
  for (const [scenario, template] of Object.entries(DOMAIN_WORKFLOW_TEMPLATES)) {
    const references = Object.values(read(template.domain, 'scenario-details')).find(item => item.id === scenario).operators
    const selected = references.map(item => item.id)
    const queuedAt = now()
    const created = store.write('POST', [template.domain, 'scenarios', scenario, 'operators', 'submit'], { operator_ids: selected })
    assert.equal(created.code, 200)
    const runId = created.data.run_id
    const get = () => store.read([template.domain, 'runs', runId]).data
    assert.equal(get().has_result, false)
    assert.ok(get().workflow.nodes.every(item => item.status === 'pending' && item.progress === 0))
    const first = node(created.data.workflow, 'prepare')
    setTime(queuedAt + 5000 + first.planned_seconds * 500)
    const active = get()
    assert.ok(node(active.workflow, 'prepare').progress > 0 && node(active.workflow, 'prepare').progress < 100)
    assert.deepEqual(get().workflow, active.workflow, 'poll cadence cannot accelerate stages')
    store.write('POST', [template.domain, 'runs', runId, 'pause'])
    setTime(now() + 30000)
    store = createExperienceStore(options)
    const paused = get()
    assert.equal(paused.status, 'paused')
    assert.equal(node(paused.workflow, 'prepare').progress, node(active.workflow, 'prepare').progress)
    assert.equal(node(paused.workflow, 'prepare').status, 'paused')
    store.write('POST', [template.domain, 'runs', runId, 'resume'])
    const resumed = get()
    const started = Date.parse(resumed.start_time)
    const archive = node(resumed.workflow, 'post')
    setTime(started + (archive.planned_start_seconds + archive.planned_seconds / 2) * 1000)
    const archiving = get()
    assert.equal(archiving.has_result, false)
    assert.equal(archiving.artifacts.length, 0)
    assert.ok(node(archiving.workflow, 'post').progress > 0 && node(archiving.workflow, 'post').progress < 100)
    assert.ok(archiving.logs.lines.some(line => line.message.includes(archive.name)))
    assert.equal(archiving.progress, Math.floor(archiving.elapsed_seconds / archiving.planned_seconds * 100))
    setTime(started + archiving.planned_seconds * 1000)
    const completed = get()
    assert.equal(completed.has_result, true)
    assert.equal(completed.status, 'success')
    assert.ok(completed.workflow.nodes.every(item => item.status === 'success' && item.progress === 100))
    assert.equal(completed.metrics.domain_data.scenario_id, scenario)
    const chosen = read(template.domain, 'operators').filter(item => selected.includes(item.name))
    assert.equal(completed.cpu_cores, chosen.reduce((sum, item) => sum + operatorResources(item).cpu_cores, 0))
    assert.ok(completed.workflow.nodes.filter(item => item.node_kind === 'internal').every(item => item.core_hours === 0 && item.resource_source === 'none'))
    store = createExperienceStore(options)
    assert.deepEqual(get().workflow, completed.workflow, 'completed workflow stays stable after restart')
  }
})

test('old scenario workflows migrate once and persist fixed entities without replacing operator selections', t => {
  const { options, runtimeDir } = setup(t)
  let store = createExperienceStore(options)
  for (const domain of ['llm', 'automotive', 'uav', 'drug', 'dft']) {
    store.read([domain, 'runs'])
    const path = resolve(runtimeDir, `${domain}.json`)
    const state = JSON.parse(readFileSync(path, 'utf8'))
    const records = Object.values(state.details).filter(detail => detail.status === 'success')
    for (const detail of records) {
      detail.workflow = { nodes: [{ id: 'prepare', status: 'success', progress: 100 }, { id: 'post', status: 'success', progress: 100 }], edges: [{ source: 'prepare', target: 'post' }] }
    }
    writeFileSync(path, JSON.stringify(state))
    store = createExperienceStore(options)
    const summaries = store.read([domain, 'runs']).data
    const migrated = JSON.parse(readFileSync(path, 'utf8'))
    for (const previous of records) {
      const current = migrated.details[previous.run_id]
      assert.equal(current.workflow.template_id, DOMAIN_WORKFLOW_TEMPLATES[current.scenario_id].id)
      assert.equal(current.workflow.nodes.filter(item => item.node_kind === 'internal').length, fixedCounts[current.scenario_id])
      assert.deepEqual(current.selected_operator_ids, previous.selected_operator_ids)
      assert.equal(current.elapsed_seconds, previous.elapsed_seconds)
      assert.equal(summaries.find(item => item.run_id === previous.run_id).nodes, current.workflow.nodes.length)
    }
    store = createExperienceStore(options)
    store.read([domain, 'runs'])
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), migrated, 'already migrated plans are not rewritten')
  }
})

test('failed internal environment stages block dependent work and archives in every scenario', () => {
  for (const [scenario, template] of Object.entries(DOMAIN_WORKFLOW_TEMPLATES)) {
    const selected = Object.values(read(template.domain, 'scenario-details')).find(item => item.id === scenario).operators.map(item => item.id)
    const workflow = build(scenario, selected).workflow
    node(workflow, 'runtime').status = 'failed'
    for (let tick = 0; tick < 100; tick++) assert.equal(advanceWorkflow(workflow, 1, 1), false)
    assert.equal(node(workflow, 'post').status, 'blocked')
    assert.equal(node(workflow, 'post').progress, 0)
    for (const current of workflow.nodes) {
      if (current.id !== 'runtime' && reaches(workflow, 'runtime', current.id)) {
        assert.equal(current.progress, 0, `${scenario}: ${current.id} cannot advance after environment failure`)
      }
    }
  }
})
