import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveExperienceLocation } from '../utils/experience-navigation.ts'

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
