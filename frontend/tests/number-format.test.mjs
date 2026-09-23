import assert from 'node:assert/strict'
import test from 'node:test'
import { formatNumber } from '../composables/useFormat.ts'

test('small nonzero scientific metrics do not silently become zero', () => {
  assert.equal(formatNumber('1.2e-05', 2), '1.2e-5')
  assert.equal(formatNumber(-0.000034, 2), '-3.4e-5')
  assert.equal(formatNumber(0, 2), '0')
  assert.equal(formatNumber(8600, 2), '8,600')
})
