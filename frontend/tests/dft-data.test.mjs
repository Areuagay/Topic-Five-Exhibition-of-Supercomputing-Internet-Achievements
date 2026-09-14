import test from 'node:test'
import assert from 'node:assert/strict'
import { bandPoints, filterMaterials, energyRange } from '../utils/dft.ts'
test('band coordinates retain nonuniform sampling, zero and missing energy gaps', () => {
  assert.deepEqual(bandPoints([0, .1, .7, 2], [-4, 0, null]), [[0,-4],[.1,0],[.7,null],[2,null]])
  assert.deepEqual(bandPoints([NaN, 1], [3, -2]), [[1,-2]])
})
test('shared energy range includes both panels and only finite values', () => {
  const r = energyRange([-4, 2, NaN], [-8, 6])
  assert.ok(r.min < -8 && r.max > 6)
  assert.equal(energyRange([], []), undefined)
})
test('material filters distinguish unknown convergence and ranking from qualification', () => {
  const rows = [{ material_id:'M1', formula:'Si', cluster_id:'a', converged:true }, { material_id:'M2', formula:'SiO2', cluster_id:'b', converged:false }, { material_id:'M3', formula:'C', cluster_id:'a' }]
  assert.deepEqual(filterMaterials(rows, 'sio', '', 'all', []), [rows[1]])
  assert.deepEqual(filterMaterials(rows, '', 'a', 'converged', []), [rows[0]])
  assert.deepEqual(filterMaterials(rows, '', '', 'ranked', ['M2']), [rows[1]])
  assert.deepEqual(filterMaterials(rows, '', '', 'unconverged', []), [rows[1]])
  assert.equal(rows.length, 3)
})
