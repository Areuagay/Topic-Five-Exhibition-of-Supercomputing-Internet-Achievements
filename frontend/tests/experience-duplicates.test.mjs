import test from 'node:test'
import assert from 'node:assert/strict'
import { preparedDataKey, findDuplicatePlan } from '../utils/experience-duplicates.ts'

const input = [{ dataset_id: 'a', uploaded: true, imported: true, size_bytes: 10, format: 'CSV' }]
const run = { run_id: 'run-a', origin: 'runtime', selected_operator_ids: ['solver', 'fft'] }
test('operator order and selection edits do not hide matching backend tasks', () => {
  assert.equal(findDuplicatePlan([run], ['fft', 'solver'], '', {})?.run.run_id, 'run-a')
  assert.equal(findDuplicatePlan([run], ['solver'], '', {}), null)
  assert.equal(findDuplicatePlan([run], ['solver', 'fft'], '', {})?.dataKnown, false)
})
test('known equal data matches; changed prepared data does not', () => {
  const key = preparedDataKey(input)
  const snapshots = { 'run-a': key }
  assert.equal(findDuplicatePlan([run], ['solver', 'fft'], key, snapshots)?.dataKnown, true)
  for (const changed of [[], [{ ...input[0], imported: false }], [{ ...input[0], size_bytes: 11 }]]) {
    assert.equal(findDuplicatePlan([run], ['solver', 'fft'], preparedDataKey(changed), snapshots), null)
  }
  assert.equal(preparedDataKey([{ ...input[0], updated_at: 'new date' }]), key)
})
test('exact data match takes precedence over unknown historical data', () => {
  const key = preparedDataKey(input)
  const unknown = { ...run, run_id: 'unknown' }
  assert.equal(findDuplicatePlan([unknown, run], ['solver', 'fft'], key, { 'run-a': key })?.run.run_id, 'run-a')
})
