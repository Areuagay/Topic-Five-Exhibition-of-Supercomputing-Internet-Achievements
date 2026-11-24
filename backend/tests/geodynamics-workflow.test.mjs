import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { createExperienceStore } from '../experience-store.js'
import { applyOperatorPlan, needsOperatorPlan } from '../operator-plan.js'
import { analyzeWorkflow, advanceWorkflow } from '../workflow-engine.js'
import { GEODYNAMICS_ENTITIES, getGeodynamicsPolicy } from '../../shared/geodynamics-workflow.js'

const dataDir = resolve(import.meta.dirname, '../../mock-data')
const catalog = JSON.parse(readFileSync(resolve(dataDir, 'geodynamics/operators.json'), 'utf8')).data
const get = (workflow, id) => workflow.nodes.find(node => node.id === id || node.operator_id === id)
const entityIds = GEODYNAMICS_ENTITIES.map(entity => entity.entity_id)
function setup(t) {
  const runtimeDir = mkdtempSync(resolve(tmpdir(), 'topic5-geo-entities-'))
  t.after(() => {
    assert.ok(resolve(runtimeDir).startsWith(resolve(tmpdir()) + sep))
    rmSync(runtimeDir, { recursive: true, force: true })
  })
  let time = Date.parse('2026-11-24T02:00:00Z')
  const options = { dataDir, runtimeDir, now: () => time }
  return { options, store: createExperienceStore(options), setTime: value => { time = value }, start: time }
}
function submit(store, scenario, ids) {
  return store.write('POST', ['geodynamics', 'scenarios', scenario, 'operators', 'submit'], { operator_ids: ids })
}

test('uploaded workflow entities and simulate/shared dependencies remain reachable through the solver stages', () => {
  const reference = JSON.parse(readFileSync(resolve(dataDir, '../docs/workflows/geodynamics-workflow-key.json'), 'utf8'))
  assert.deepEqual(new Set(entityIds), new Set(reference.nodes.filter(node => node.id !== 'existing').map(node => node.id)))
  const detail = {
    scenario_id: 'tectonic-evolution', status: 'queued', selected_operator_ids: ['uzawa', 'supg'],
    workflow: { nodes: [{ id: 'prepare' }, { id: 'post' }], edges: [] },
  }
  applyOperatorPlan('geodynamics', detail, catalog, [], { realtime: true })
  const workflow = detail.workflow
  const ids = new Map(workflow.nodes.filter(node => node.entity_id).map(node => [node.entity_id, node.id]))
  const { outgoing } = analyzeWorkflow(workflow)
  for (const edge of reference.edges.filter(edge => edge.mode !== 'replay')) {
    const seen = new Set()
    const queue = [ids.get(edge.from.node)]
    for (const id of queue) {
      if (seen.has(id)) continue
      seen.add(id)
      queue.push(...outgoing.get(id).filter(next => !seen.has(next)))
    }
    assert.ok(seen.has(ids.get(edge.to.node)), `${edge.from.node} -> ${edge.to.node}`)
  }
})

test('both scenarios retain fixed solvers and every optional combination forms a complete acyclic workflow', () => {
  for (const scenario of ['wave-propagation', 'tectonic-evolution']) {
    const fixed = getGeodynamicsPolicy('geodynamics', scenario).fixedOperatorIds
    const optional = catalog.map(operator => operator.name).filter(id => !fixed.includes(id))
    for (let mask = 0; mask < 8; mask++) {
      const selected = [...fixed, ...optional.filter((_, index) => mask & (1 << index))]
      const detail = {
        scenario_id: scenario, status: 'queued', selected_operator_ids: [...selected].reverse(),
        workflow: { nodes: [{ id: 'prepare' }, { id: 'post' }], edges: [] },
      }
      applyOperatorPlan('geodynamics', detail, catalog, [], { realtime: true })
      const workflow = detail.workflow
      const graph = analyzeWorkflow(workflow)
      assert.equal(graph.order.length, workflow.nodes.length)
      assert.equal(detail.nodes, selected.length + 8)
      assert.deepEqual(new Set(detail.selected_operator_ids), new Set(selected))
      assert.deepEqual(workflow.nodes.filter(node => node.node_kind === 'internal').map(node => node.entity_id), entityIds)
      assert.equal(workflow.nodes.filter(node => node.selection_class === 'fixed').length, 1)
      assert.deepEqual(new Set(graph.incoming.get('partition')), new Set(['prepare', 'runtime']))
      assert.deepEqual(new Set(graph.incoming.get('post')), new Set(['analyze', 'vtk', 'preview']))
      if (selected.includes('supg') && selected.includes('uzawa')) {
        assert.deepEqual(graph.incoming.get(get(workflow, 'supg').id), [get(workflow, 'uzawa').id])
      }
      for (const edge of workflow.edges) {
        const parent = get(workflow, edge.source), child = get(workflow, edge.target)
        assert.ok(parent.planned_start_seconds + parent.planned_seconds <= child.planned_start_seconds)
      }
      const internal = workflow.nodes.filter(node => node.node_kind === 'internal')
      assert.ok(internal.every(node => node.planned_seconds > 0 && node.core_hours === 0 && !node.operator_id))
      let done = false
      for (let tick = 0; tick < 40 && !done; tick++) done = advanceWorkflow(workflow, 1, 1)
      assert.ok(done)
    }
  }
})

test('submit rejects missing fixed solvers and rejects internal entities as selectable operators', t => {
  const { store } = setup(t)
  for (const [scenario, required, other] of [
    ['wave-propagation', 'supg', 'uzawa'], ['tectonic-evolution', 'uzawa', 'supg'],
  ]) {
    const missing = submit(store, scenario, [other])
    assert.equal(missing.code, 400)
    assert.match(missing.message, /固定算子/)
    assert.equal(submit(store, scenario, [required, 'partition']).code, 400)
    const created = submit(store, scenario, [required])
    assert.equal(created.code, 200)
    assert.equal(created.data.workflow.nodes.length, 9)
    assert.deepEqual(created.data.selected_operator_ids, [required])
  }
  assert.equal(store.operators('geodynamics').length, 4)
})

test('internal entity progress survives polling, pause and restart; results wait for archive', t => {
  const { options, store: initial, setTime, start } = setup(t)
  let store = initial
  const created = submit(store, 'tectonic-evolution', ['uzawa', 'supg', 'citcoms-global', 'citcoms-regional']).data
  const runId = created.run_id
  const read = () => store.read(['geodynamics', 'runs', runId]).data
  assert.equal(read().has_result, false)
  const runtime = get(created.workflow, 'runtime')
  setTime(start + 5000 + runtime.planned_seconds * 500)
  let detail = read()
  assert.ok(get(detail.workflow, 'runtime').progress > 0 && get(detail.workflow, 'runtime').progress < 100)
  assert.equal(get(detail.workflow, 'partition').progress, 0)
  const snapshot = detail.workflow
  assert.deepEqual(read().workflow, snapshot)
  store.write('POST', ['geodynamics', 'runs', runId, 'pause'])
  setTime(start + 65000)
  store = createExperienceStore(options)
  const paused = read()
  assert.equal(paused.status, 'paused')
  assert.equal(get(paused.workflow, 'runtime').status, 'paused')
  assert.equal(get(paused.workflow, 'runtime').progress, get(snapshot, 'runtime').progress)
  store.write('POST', ['geodynamics', 'runs', runId, 'resume'])
  detail = read()
  const started = Date.parse(detail.start_time)
  const archive = get(detail.workflow, 'post')
  setTime(started + (archive.planned_start_seconds + archive.planned_seconds / 2) * 1000)
  detail = read()
  assert.ok(get(detail.workflow, 'preview').status === 'success')
  assert.ok(get(detail.workflow, 'post').progress > 0 && get(detail.workflow, 'post').progress < 100)
  assert.equal(detail.has_result, false)
  assert.equal(detail.artifacts.length, 0)
  assert.ok(detail.logs.lines.some(line => line.message.includes('结果编号归档')))
  setTime(started + created.planned_seconds * 1000)
  detail = read()
  assert.equal(detail.status, 'success')
  assert.equal(detail.has_result, true)
  assert.ok(detail.workflow.nodes.every(node => node.progress === 100 && node.status === 'success'))
  assert.equal(detail.cpu_cores, 18, 'internal entities do not invent operator resources')
})

test('internal failures block their descendants and historical internal failures keep their identity', () => {
  const names = new Set(catalog.map(operator => operator.name))
  const detail = {
    scenario_id: 'wave-propagation', status: 'success', progress: 100, elapsed_seconds: 240,
    selected_operator_ids: ['supg'],
    workflow: { nodes: [{ id: 'prepare' }, { id: 'post' }], edges: [] }, _operator_version: 6,
  }
  assert.ok(needsOperatorPlan(detail, names))
  applyOperatorPlan('geodynamics', detail, catalog)
  assert.ok(!needsOperatorPlan(detail, names))
  for (const node of detail.workflow.nodes) { node.status = 'pending'; node.progress = 0 }
  get(detail.workflow, 'runtime').status = 'failed'
  for (let tick = 0; tick < 20; tick++) assert.equal(advanceWorkflow(detail.workflow, 1, 1), false)
  assert.equal(get(detail.workflow, 'post').status, 'blocked')
  assert.equal(get(detail.workflow, 'post').progress, 0)
  detail.status = 'failed'
  detail.progress = 20
  applyOperatorPlan('geodynamics', detail, catalog)
  assert.equal(get(detail.workflow, 'runtime').status, 'failed')
  assert.equal(get(detail.workflow, 'post').progress, 0)
})
