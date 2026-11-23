import assert from 'node:assert/strict'
import test from 'node:test'
import { nextOnlineUserDemoCount, onlineUserDemoDelay } from '../utils/online-user-simulation.ts'

test('demo refresh interval is between five and ten seconds', () => {
  assert.equal(onlineUserDemoDelay(() => 0), 5000)
  assert.equal(onlineUserDemoDelay(() => 0.5), 7500)
  assert.equal(onlineUserDemoDelay(() => 0.999999), 10000)
})

test('demo counts change gradually without drifting beyond the baseline range', () => {
  let seed = 42
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  let previous = 10200
  for (let tick = 0; tick < 10000; tick++) {
    const next = nextOnlineUserDemoCount(10200, previous, random)
    assert.ok(Number.isInteger(next))
    assert.ok(next >= 9996 && next <= 10404)
    assert.notEqual(next, previous)
    assert.ok(Math.abs(next - previous) <= 31)
    previous = next
  }
})

test('a boundary reverses direction and an empty baseline stays empty', () => {
  assert.equal(nextOnlineUserDemoCount(10200, 9996, () => 0), 9997)
  assert.equal(nextOnlineUserDemoCount(10200, 10404, () => 0.999999), 10403)
  assert.equal(nextOnlineUserDemoCount(0, 0), 0)
  assert.equal(nextOnlineUserDemoCount(Number.NaN, 100), 0)
  assert.ok(Number.isFinite(nextOnlineUserDemoCount(10200, Number.NaN)))
})
