import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

// Import dynamically so the missing implementation is reported as an assertion.
test('six domains share uploads, isolated runs, elapsed-time progress and result gating', async (t) => {
  const module = await import('../experience-store.js').catch(() => null)
  assert.ok(module?.createExperienceStore, 'shared experience store must exist')
  const runtimeDir = mkdtempSync(resolve(tmpdir(), 'topic5-experience-'))
  t.after(() => rmSync(runtimeDir, { recursive: true, force: true }))
  let time = Date.parse('2026-09-23T10:00:00Z')
  const options = { dataDir: resolve(import.meta.dirname, '../../mock-data'), runtimeDir, now: () => time }
  let store = module.createExperienceStore(options)
  for (const domain of ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']) {
    const datasets = store.read([domain, 'datasets']).data
    const scenarios = [...new Set(datasets.map(d => d.scenario_id))]
    assert.equal(scenarios.length, 2)
    for (const scenario of scenarios) {
      const dataset = datasets.find(d => d.scenario_id === scenario && !d.builtin)
      assert.ok(dataset, `${scenario} has an uploadable sample`)
      assert.equal(store.write('POST', [domain, 'datasets', dataset.dataset_id, 'upload']).data.uploaded, true)
      assert.equal(store.write('POST', [domain, 'scenarios', scenario, 'import']).data.status, 'imported')
      assert.equal(store.write('POST', [domain, 'scenarios', scenario, 'import']).data.status, 'already_all')
      assert.equal(store.write('DELETE', [domain, 'datasets', dataset.dataset_id]).data.uploaded, false)
      const before = store.read([domain, 'runs']).data.length
      const operators = store.operators(domain).filter(o => ['available', 'registered'].includes(o.status)).slice(0, 2).map(o => o.name)
      const created = store.write('POST', [domain, 'scenarios', scenario, 'operators', 'submit'], { operator_ids: operators })
      assert.equal(created.code, 200, `${domain}/${scenario} can submit`)
      const id = created.data.run_id
      assert.equal(store.read([domain, 'runs']).data.length, before + 1)
      const initial = store.read([domain, 'runs', id]).data
      assert.equal(initial.scenario_id, scenario)
      assert.equal(initial.progress, 0)
      assert.equal(initial.has_result, false)
      assert.equal(initial.domain_data, undefined, 'unfinished runs do not leak the template through data details')
      assert.equal(initial.core_hours, 0)
      assert.equal(initial.workflow.nodes.filter(n => n.operator_id).length, 2)
      time += 2600
      const next = store.read([domain, 'runs', id]).data
      assert.ok(next.progress > 0 && next.progress < 100)
      assert.equal(next.progress, Math.round(next.workflow.nodes.reduce((s,n) => s + n.progress, 0) / next.workflow.nodes.length))
      assert.equal(store.read([domain, 'runs', id]).data.progress, next.progress, 'polls do not accelerate a run')
      store = module.createExperienceStore(options)
      assert.equal(store.read([domain, 'runs', id]).data.progress, next.progress, 'restart preserves progress')
      time += 240000
      const finished = store.read([domain, 'runs', id]).data
      assert.equal(finished.status, 'success')
      assert.equal(finished.progress, 100)
      assert.equal(finished.has_result, true)
      assert.ok(finished.metrics.domain_data, `${scenario} retains its professional results`)
      assert.equal(finished.metrics.domain_data.scenario_id, scenario)
      const elapsed = finished.elapsed_seconds
      const summary = store.read([domain, 'runs']).data.find(r => r.run_id === id)
      assert.equal(finished.core_hours, summary.core_hours, 'list and detail share resource accounting')
      time += 10000
      assert.equal(store.read([domain, 'runs', id]).data.elapsed_seconds, elapsed)
    }
    const runs = store.read([domain, 'runs']).data
    assert.ok(runs.some(r => r.status === 'success' && r.has_result))
    assert.ok(runs.some(r => r.status === 'success' && !r.has_result))
    const failed = runs.find(r => r.status === 'failed')
    const before = store.read([domain, 'runs', failed.run_id]).data
    time += 5000
    assert.equal(store.read([domain, 'runs', failed.run_id]).data.progress, before.progress)
    const builtin = datasets.find(d => d.builtin)
    assert.equal(store.write('DELETE', [domain, 'datasets', builtin.dataset_id]).code, 400)
    assert.equal(store.write('POST', [domain, 'scenarios', scenarios[0], 'operators', 'submit'], { operator_ids: [] }).code, 400)
    assert.equal(store.write('POST', [domain, 'scenarios', scenarios[0], 'operators', 'submit'], { operator_ids: ['unknown'] }).code, 400)
  }
})
