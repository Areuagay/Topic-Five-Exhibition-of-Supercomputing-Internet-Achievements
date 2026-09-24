import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveExperienceLocation, hasSubmittedSelection } from '../utils/experience-navigation.ts'

const runs = [{ run_id: 'a' }, { run_id: 'b', has_detail: true }, { run_id: 'c', has_detail: true }]
test('browser history restores the step and exact run from its URL', () => {
  assert.deepEqual(resolveExperienceLocation({ step: 'monitor', run: 'c' }, { step: 'result', runId: 'b' }, runs), { step: 'monitor', runId: 'c' })
})
test('returning from history without step parameters resumes the saved scenario location', () => {
  assert.deepEqual(resolveExperienceLocation({}, { step: 'monitor', runId: 'c' }, runs), { step: 'monitor', runId: 'c' })
})
test('unknown steps, repeated query values and runs from another scenario cannot leak into the flow', () => {
  assert.deepEqual(resolveExperienceLocation({ step: ['result'], run: 'other-scenario-run' }, { step: 'unknown', runId: 'missing' }, runs), { step: 'data', runId: 'b' })
})
test('a fresh or empty scenario has a deterministic safe initial record', () => {
  assert.deepEqual(resolveExperienceLocation({}, { step: 'data', runId: '' }, runs), { step: 'data', runId: 'b' })
  assert.deepEqual(resolveExperienceLocation({ step: 'result', run: 'missing' }, { step: 'data', runId: '' }, []), { step: 'result', runId: '' })
})

test('workflow entry requires a submitted selection, including URL and saved navigation', () => {
  assert.equal(resolveExperienceLocation({ step: 'workflow' }, { step: 'data', runId: 'b' }, runs, false).step, 'operator')
  assert.equal(resolveExperienceLocation({}, { step: 'workflow', runId: 'b' }, runs, false).step, 'operator')
  assert.equal(resolveExperienceLocation({ step: 'workflow' }, { step: 'data', runId: 'b' }, runs, true).step, 'workflow')
  assert.equal(resolveExperienceLocation({ step: 'monitor' }, { step: 'data', runId: 'b' }, runs, false).step, 'monitor')
})

test('changing selected operators invalidates the submitted plan; ordering does not', () => {
  const submitted = { origin: 'runtime', selected_operator_ids: ['solver', 'fft'] }
  assert.equal(hasSubmittedSelection(['fft', 'solver'], submitted), true)
  assert.equal(hasSubmittedSelection(['solver'], submitted), false)
  assert.equal(hasSubmittedSelection([], submitted), false)
  assert.equal(hasSubmittedSelection(['solver', 'fft'], { ...submitted, origin: 'seed' }), false)
  assert.equal(hasSubmittedSelection(['solver', 'fft']), false)
})
