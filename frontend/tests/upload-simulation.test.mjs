import assert from 'node:assert/strict'
import test from 'node:test'
import { uploadDurationMs, uploadPercentage, canViewResult } from '../utils/experience-simulation.ts'

test('upload duration grows with file size and stays suitable for a demonstration', () => {
  const sizes = [0, 8192, 1024 ** 2, 1024 ** 3, 1024 ** 4]
  const durations = sizes.map(uploadDurationMs)
  assert.ok(durations[0] >= 1500)
  assert.ok(durations.at(-1) <= 12000)
  for (let i = 1; i < durations.length; i++) assert.ok(durations[i] > durations[i - 1])
  assert.equal(uploadDurationMs(NaN), uploadDurationMs(0))
  assert.equal(uploadPercentage(500, 2000), 25)
  assert.equal(uploadPercentage(3000, 2000), 99, '100% waits for the server acknowledgement')
})
test('only successful completed runs with available output expose results', () => {
  assert.equal(canViewResult({ status: 'running', progress: 70, has_detail: true }), false)
  assert.equal(canViewResult({ status: 'failed', progress: 100, has_detail: true }), false)
  assert.equal(canViewResult({ status: 'success', progress: 100, has_detail: true, has_result: false }), false)
  assert.equal(canViewResult({ status: 'success', progress: 100, has_detail: true }), true)
})
