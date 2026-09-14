import test from 'node:test'
import assert from 'node:assert/strict'
import { spatialBounds, sampleAt, trajectoryTimes } from '../utils/uav.ts'

test('spatial bounds keep negative coordinates and provide nonzero equal-scale spans', () => {
  const b = spatialBounds([{ x: -10, y: 4 }, { x: 10, y: 4 }, { x: NaN, y: 99 }])
  assert.ok(b.minX < -10 && b.maxX > 10)
  assert.ok(b.minY < 4 && b.maxY > 4)
  assert.equal(b.maxX - b.minX, b.maxY - b.minY)
  assert.deepEqual(spatialBounds([]), { minX: 0, maxX: 1, minY: 0, maxY: 1 })
})
test('timeline uses all unique finite times and samples only known observations', () => {
  const points = [{ t: 5, x: 5, y: 0, z: 0 }, { t: 0, x: 0, y: 0, z: 0 }, { t: 10, x: 10, y: 0, z: 0 }]
  assert.deepEqual(trajectoryTimes([{ points }, { points: [{ t: 2, x: 1, y: 1, z: 1 }, points[0]] }]), [0, 2, 5, 10])
  assert.equal(sampleAt(points, 4)?.t, 0)
  assert.equal(sampleAt(points, 5)?.x, 5)
  assert.equal(sampleAt(points, -1), undefined)
  assert.equal(sampleAt([], 0), undefined)
})
