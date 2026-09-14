import test from 'node:test'
import assert from 'node:assert/strict'
test('residual grid preserves row/column orientation and zero, excluding missing cells', async () => {
  const { residualCells } = await import('../utils/workspace.ts')
  assert.deepEqual(residualCells({ x: [0, 2], y: [0, 3], values: [[0, 0.5], [null, 0.8]] }), [[0, 0, 0], [1, 0, 0.5], [1, 1, 0.8]])
  assert.deepEqual(residualCells(undefined), [])
})
