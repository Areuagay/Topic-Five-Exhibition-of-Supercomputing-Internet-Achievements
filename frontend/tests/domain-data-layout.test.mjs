import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { isCompactValue, layoutDataBlocks } from '../utils/domain-data-layout.ts'

test('coordinates stay compact without swallowing long vectors or nested data', () => {
  assert.equal(isCompactValue([5, 5]), true)
  assert.equal(isCompactValue([0, null, false]), true)
  assert.equal(isCompactValue(Array(9).fill(0)), false)
  assert.equal(isCompactValue([[5, 5]]), false)
  assert.equal(isCompactValue([{ x: 5 }]), false)
})

test('pair only comparable simple tables, keeping compound and wide data full width', () => {
  const rows = length => Array.from({ length }, (_, x) => ({ x, y: x }))
  const entries = [
    { key: 'environment', value: { width: 100, start: [5, 5], obstacles: rows(8) } },
    { key: 'path', value: rows(108) },
    { key: 'cost', value: rows(40) },
    { key: 'events', value: rows(1) },
    { key: 'wide', value: [{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 }] },
  ]
  assert.deepEqual(layoutDataBlocks(entries).map(({ fullWidth }) => fullWidth), [true, false, false, true, true])
  assert.deepEqual(layoutDataBlocks([{ key: 'large', value: rows(40) }, { key: 'small', value: rows(3) }]).map(({ fullWidth }) => fullWidth), [true, true])
})

test('all 12 scenario payloads retain every field and keep nested structures out of paired rows', async () => {
  const domains = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']
  const scenarios = new Set()
  function check(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const entries = Object.entries(value).map(([key, value]) => ({ key, value }))
    const facts = entries.filter(entry => isCompactValue(entry.value))
    const blocks = layoutDataBlocks(entries.filter(entry => !isCompactValue(entry.value)))
    assert.deepEqual([...facts, ...blocks].map(entry => entry.key).sort(), Object.keys(value).sort())
    for (const entry of blocks) {
      assert.equal(entry.value, value[entry.key])
      if (!Array.isArray(entry.value)) assert.equal(entry.fullWidth, true)
      check(entry.value)
    }
  }
  for (const domain of domains) {
    const dir = new URL(`../../mock-data/${domain}/run-details/`, import.meta.url)
    for (const name of await readdir(dir)) {
      const { data } = JSON.parse(await readFile(new URL(name, dir), 'utf8'))
      const payload = data.metrics?.domain_data ?? data.domain_data
      scenarios.add(payload.scenario_id)
      check(payload)
    }
  }
  assert.equal(scenarios.size, 12)
})
