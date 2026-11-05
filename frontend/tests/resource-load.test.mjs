import assert from 'node:assert/strict'
import test from 'node:test'
import { applyDatasetLoad, DATASET_LOAD_MAX_UPLOADS, datasetLoadGain } from '../utils/resource-load.ts'

test('未上传数据时资源利用率保持平台基线值', () => {
  assert.equal(applyDatasetLoad(73.2, 0), 73.2)
  assert.equal(applyDatasetLoad(22.2, 0), 22.2)
  assert.equal(datasetLoadGain(0), 0)
})

test('每上传一份数据，增幅不超过 0.5 个百分点且保留两位小数', () => {
  const bases = [0, 12.5, 22.2, 51, 73.2, 88.8, 99]
  for (const base of bases) {
    let previous = applyDatasetLoad(base, 0)
    for (let count = 1; count <= DATASET_LOAD_MAX_UPLOADS; count += 1) {
      const value = applyDatasetLoad(base, count)
      const delta = Number((value - previous).toFixed(2))
      assert.ok(delta >= 0, `${base}% 第 ${count} 次上传不应下降`)
      assert.ok(delta <= 0.5, `${base}% 第 ${count} 次上传增幅 ${delta} 应不超过 0.5 个百分点`)
      assert.equal(Number(value.toFixed(2)), value, `${value} 应保留两位小数`)
      assert.ok(value <= 100, '利用率不应超过 100%')
      previous = value
    }
  }
})

test('单次上传的相对增幅在 0.5% 以内', () => {
  for (const base of [22.2, 73.2, 99]) {
    const next = applyDatasetLoad(base, 1)
    assert.ok((next - base) / base <= 0.005)
    assert.ok((next - base) / base > 0)
  }
})

test('累计增幅在上传份数达到上限后不再增长', () => {
  const capped = applyDatasetLoad(73.2, DATASET_LOAD_MAX_UPLOADS)
  assert.equal(applyDatasetLoad(73.2, DATASET_LOAD_MAX_UPLOADS + 3), capped)
  assert.equal(datasetLoadGain(99), datasetLoadGain(DATASET_LOAD_MAX_UPLOADS))
})
