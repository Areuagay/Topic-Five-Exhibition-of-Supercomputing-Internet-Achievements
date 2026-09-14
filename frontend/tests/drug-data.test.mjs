import test from 'node:test'
import assert from 'node:assert/strict'
import { filterCandidates, sortCandidates, radarBounds } from '../utils/drug.ts'

test('candidate filtering respects API status, case insensitive IDs and unknown status', () => {
  const rows = [{ compound_id: 'A-01', passed: true }, { compound_id: 'A-02', passed: false }, { compound_id: 'B-01' }]
  assert.deepEqual(filterCandidates(rows, ' a- ', 'all'), rows.slice(0, 2))
  assert.deepEqual(filterCandidates(rows, '', 'failed'), [rows[1]])
  assert.deepEqual(filterCandidates(rows, '', 'passed'), [rows[0]])
})
test('numeric ordering keeps missing values last in either direction without mutating source', () => {
  const rows = [{ compound_id: 'a', score: -2 }, { compound_id: 'b', score: null }, { compound_id: 'c', score: -10 }]
  assert.deepEqual(sortCandidates(rows, 'score', true).map(r => r.compound_id), ['c', 'a', 'b'])
  assert.deepEqual(sortCandidates(rows, 'score', false).map(r => r.compound_id), ['a', 'c', 'b'])
  assert.equal(rows[0].compound_id, 'a')
})
test('radar bounds include actual negative and out-of-unit-range values', () => {
  assert.deepEqual(radarBounds([-2, 4, NaN]), { min: -2, max: 4 })
  assert.deepEqual(radarBounds([0, 0]), { min: 0, max: 1 })
  assert.deepEqual(radarBounds([5, 7]), { min: 0, max: 7 })
})
