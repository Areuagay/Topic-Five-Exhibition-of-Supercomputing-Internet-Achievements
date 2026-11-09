import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  applyOperatorPlan,
  estimatePlanSeconds,
  LEGACY_OPERATOR_MAP,
  needsOperatorPlan,
  resolveRuntime,
} from '../operator-plan.js'

const ROOT = resolve(import.meta.dirname, '..', '..')
const readJson = (...parts) => JSON.parse(readFileSync(resolve(ROOT, ...parts), 'utf8').replace(/^\uFEFF/, ''))
const operators = domain => readJson('mock-data', domain, 'operators.json').data
const scenarios = domain => {
  const data = readJson('mock-data', domain, 'scenario-details.json').data
  return Array.isArray(data) ? data : Object.values(data)
}

test('runtime environment follows the real runtime, not the platform deployment mode', () => {
  const supg = resolveRuntime({ runtime_type: 'instance', runtime: '/public/home/wxn/image/scnet/common/supg.sif' })
  assert.equal(supg.kind, 'singularity')
  assert.equal(supg.label, 'Singularity')
  assert.equal(supg.deployment, '平台实例')

  const syncedSupg = resolveRuntime({ runtime_type: 'singularity', deployment_type: 'instance', runtime: '/public/home/wxn/image/scnet/common/supg.sif' })
  assert.equal(syncedSupg.kind, 'singularity')
  assert.equal(syncedSupg.deployment, '平台实例')

  const llm = resolveRuntime({ runtime_type: 'docker', runtime: 'local/ai-operator/ai-train-lightgbm-server:20260629' })
  assert.equal(llm.kind, 'docker')
  assert.equal(llm.label, 'Docker')

  const automotive = resolveRuntime({ runtime_type: 'docker', deployment_type: 'docker-run', runtime: 'hub.cngrid.org:5000/scnet/cars/ipfno:gpu20250827_nodata' })
  assert.equal(automotive.kind, 'docker')
  assert.equal(automotive.deployment, 'Docker 运行')
})

test('six domains do not all share one runtime environment', () => {
  const kinds = new Set()
  for (const domain of ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']) {
    for (const operator of operators(domain)) kinds.add(resolveRuntime(operator).kind)
  }
  assert.ok(kinds.has('singularity'))
  assert.ok(kinds.has('docker'))
})

test('historical operator ids are replaced by current operators with node resources', () => {
  const domain = 'geodynamics'
  const list = operators(domain)
  const detail = {
    status: 'success',
    progress: 100,
    elapsed_seconds: 3600,
    selected_operator_ids: ['fd-wave-solver', 'fft-operator'],
    workflow: {
      nodes: [{ id: 'prepare' }, { id: 'operator-0' }, { id: 'operator-1' }, { id: 'post' }],
      edges: [],
    },
  }
  assert.ok(needsOperatorPlan(detail, new Set(list.map(operator => operator.name))))
  assert.ok(applyOperatorPlan(domain, detail, list, scenarios(domain)[0].operators, { plannedSeconds: detail.elapsed_seconds }))

  const names = new Set(list.map(operator => operator.name))
  assert.ok(detail.selected_operator_ids.every(name => names.has(name)))
  assert.ok(detail.selected_operator_ids.includes('supg'))
  assert.ok(detail.workflow.nodes.every(node => !node.operator_id || names.has(node.operator_id)))
  assert.ok(detail.workflow.nodes.filter(node => node.operator_id).every(node => node.cpu_cores >= 1))
  assert.ok(detail.workflow.nodes.some(node => node.runtime_label === 'Singularity'))
  assert.equal(detail.nodes, detail.workflow.nodes.filter(node => node.operator_id).length)
  assert.equal(detail.cpu_cores, detail.workflow.nodes.reduce((sum, node) => sum + (node.cpu_cores || 0), 0))
  assert.equal(detail.elapsed_seconds, 3600)
  assert.equal(detail.planned_seconds, 3600)
  assert.ok(!needsOperatorPlan(detail, names))
})

test('all stored run-detail workflows reference current operators and operator-derived resources', () => {
  const domains = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']
  for (const domain of domains) {
    const list = operators(domain)
    const names = new Set(list.map(operator => operator.name))
    const legacy = new Set(Object.keys(LEGACY_OPERATOR_MAP))
    const dir = resolve(ROOT, 'mock-data', domain, 'run-details')
    for (const file of readdirSync(dir).filter(name => name.endsWith('.json'))) {
      const detail = readJson('mock-data', domain, 'run-details', file).data
      assert.ok(Array.isArray(detail.selected_operator_ids) && detail.selected_operator_ids.length > 0, `${file} selected operators`)
      for (const id of detail.selected_operator_ids) {
        assert.ok(names.has(id), `${file} references current operator ${id}`)
        assert.ok(!legacy.has(id), `${file} still references legacy operator ${id}`)
      }
      for (const node of detail.workflow.nodes) {
        if (!node.operator_id) continue
        assert.ok(names.has(node.operator_id), `${file} node ${node.id} operator ${node.operator_id}`)
        assert.ok(node.cpu_cores >= 1, `${file} node ${node.id} CPU from operator`)
        assert.ok(node.runtime_label === 'Singularity' || node.runtime_label === 'Docker', `${file} node ${node.id} runtime`)
      }
      if (['success', 'failed', 'stopped'].includes(detail.status) && detail.start_time) {
        const elapsed = (new Date(detail.end_time).getTime() - new Date(detail.start_time).getTime()) / 1000
        assert.equal(Math.round(elapsed), detail.elapsed_seconds, `${file} timestamps match elapsed`)
      }
    }
  }
})

test('planned demo duration grows with operator resources and stays bounded', () => {
  const light = operators('geodynamics').slice(0, 1)
  const heavy = operators('dft').filter(operator => operator.cpu_cores >= 30)
  assert.ok(estimatePlanSeconds(light) >= 240)
  assert.ok(estimatePlanSeconds(heavy) <= 900)
  assert.ok(estimatePlanSeconds(heavy) > estimatePlanSeconds(light))
})
