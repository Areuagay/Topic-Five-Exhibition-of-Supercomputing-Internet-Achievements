import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { createExperienceStore, EXPERIENCE_DOMAINS } from '../experience-store.js'

const dataDir = resolve(import.meta.dirname, '../../mock-data')
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const resources = detail => ({
  core_hours: detail.core_hours,
  cpu_cores: detail.cpu_cores,
  gpu_count: detail.gpu_count,
  memory_gb: detail.memory_gb,
  workflow: detail.workflow,
})

test('legacy runs recover configured targets without changing resource accounting', t => {
  const runtimeDir = mkdtempSync(resolve(tmpdir(), 'topic5-target-core-hours-'))
  t.after(() => {
    const target = resolve(runtimeDir)
    assert.ok(target.startsWith(resolve(tmpdir()) + sep))
    assert.ok(target.split(sep).at(-1).startsWith('topic5-target-core-hours-'))
    rmSync(target, { recursive: true, force: true })
  })
  const options = { dataDir, runtimeDir, now: () => Date.parse('2026-11-23T00:00:00Z') }
  let store = createExperienceStore(options)

  for (const domain of EXPERIENCE_DOMAINS) {
    store.read([domain, 'runs'])
    const statePath = resolve(runtimeDir, `${domain}.json`)
    const state = readJson(statePath)
    const expectedByRun = new Map()
    const expectedByScenario = new Map()
    for (const run of readJson(resolve(dataDir, domain, 'runs.json')).data) {
      let seed
      try { seed = readJson(resolve(dataDir, domain, 'run-details', `${run.run_id}.json`)).data } catch { continue }
      expectedByRun.set(seed.run_id, seed.target_core_hours)
      if (!expectedByScenario.has(seed.scenario_id) || seed.status === 'success') {
        expectedByScenario.set(seed.scenario_id, seed.target_core_hours)
      }
    }
    for (const record of [...state.runs, ...Object.values(state.details), ...Object.values(state.templates)]) {
      delete record.target_core_hours
    }
    const template = Object.values(state.templates)[0]
    const extra = [
      { suffix: '9001' },
      { suffix: '9002', target_core_hours: 765432 },
      { suffix: '9003', target_core_hours: 0 },
      { suffix: '9004', execution_mode: 'real', source_type: 'real' },
      { suffix: '9005', scenario_id: 'unconfigured-scenario' },
    ]
    for (const { suffix, ...overrides } of extra) {
      const detail = {
        ...structuredClone(state.details[template.run_id]),
        run_id: `${domain.toUpperCase()}-20261123-${suffix}`,
        origin: 'runtime',
        _clock: 'static',
        ...overrides,
      }
      state.details[detail.run_id] = detail
      const summary = structuredClone(detail)
      delete summary.workflow
      state.runs.push(summary)
    }
    writeFileSync(statePath, JSON.stringify(state))
    store = createExperienceStore(options)
    const runs = store.read([domain, 'runs']).data
    for (const run of runs) {
      const before = state.details[run.run_id]
      const detail = store.read([domain, 'runs', run.run_id]).data
      const isUnconfigured = before.scenario_id === 'unconfigured-scenario' || before.execution_mode === 'real'
      const expected = before.target_core_hours ?? (isUnconfigured
        ? undefined
        : expectedByRun.get(run.run_id) ?? expectedByScenario.get(run.scenario_id))
      assert.equal(detail.target_core_hours, expected, `${run.run_id} target`)
      assert.equal(run.target_core_hours, expected, `${run.run_id} summary target`)
      assert.deepEqual(resources(detail), resources(before), `${run.run_id} accounting is unchanged`)
    }
    // Reading repaired metadata must not persist a synthetic resource plan.
    assert.deepEqual(readJson(statePath), state)

    for (const scenario of Object.keys(state.templates)) {
      const operator = store.operators(domain).find(item => ['available', 'registered'].includes(item.status))
      const created = store.write('POST', [domain, 'scenarios', scenario, 'operators', 'submit'], {
        operator_ids: [operator.name],
      })
      assert.equal(created.code, 200)
      const detail = store.read([domain, 'runs', created.data.run_id]).data
      assert.equal(detail.target_core_hours, expectedByScenario.get(scenario))
      assert.equal(detail.core_hours, 0, 'a target must not become consumed core hours')
      assert.equal(detail.execution_mode, 'simulated')
      const paused = store.write('POST', [domain, 'runs', detail.run_id, 'pause']).data
      assert.equal(paused.target_core_hours, detail.target_core_hours)
      assert.equal(paused.status, 'paused')
      const resumed = store.write('POST', [domain, 'runs', detail.run_id, 'resume']).data
      assert.equal(resumed.target_core_hours, detail.target_core_hours)
      assert.equal(resumed.status, 'queued')
      assert.equal(readJson(statePath).details[detail.run_id].target_core_hours, detail.target_core_hours)
      store = createExperienceStore(options)
      assert.equal(store.read([domain, 'runs', detail.run_id]).data.target_core_hours, detail.target_core_hours)
    }
  }
})
