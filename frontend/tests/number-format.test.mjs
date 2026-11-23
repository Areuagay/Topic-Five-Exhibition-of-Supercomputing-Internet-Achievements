import assert from 'node:assert/strict'
import test from 'node:test'
import { formatNumber, formatChineseCount } from '../composables/useFormat.ts'

test('small nonzero scientific metrics do not silently become zero', () => {
  assert.equal(formatNumber('1.2e-05', 2), '1.2e-5')
  assert.equal(formatNumber(-0.000034, 2), '-3.4e-5')
  assert.equal(formatNumber(0, 2), '0')
  assert.equal(formatNumber(8600, 2), '8,600')
})

test('large counts render in 万/亿 units for achievement indicators', () => {
  assert.equal(formatChineseCount(0), '0')
  assert.equal(formatChineseCount(8600), '8,600')
  assert.equal(formatChineseCount(10000), '1万')
  assert.equal(formatChineseCount(1000000), '100万')
  assert.equal(formatChineseCount(1234567), '123.46万')
  assert.equal(formatChineseCount(100000000), '1亿')
  assert.equal(formatChineseCount('-'), '-')
  assert.equal(formatChineseCount(null), '-')
})

test('fractional core hours remain visible instead of rounding to zero or whole hours', () => {
  assert.equal(formatChineseCount(0.02), '0.02')
  assert.equal(formatChineseCount(0.22), '0.22')
  assert.equal(formatChineseCount(2.12), '2.12')
  assert.equal(formatChineseCount('6.76'), '6.76')
  assert.equal(formatChineseCount(0.0047), '0.0047')
  assert.equal(formatChineseCount(0.0001), '0.0001')
  assert.equal(formatChineseCount(0.000034), '3.4e-5')
  assert.equal(formatChineseCount(-0.22), '-0.22')
  assert.equal(formatChineseCount(51), '51')
  assert.equal(formatChineseCount(undefined), '-')
})
