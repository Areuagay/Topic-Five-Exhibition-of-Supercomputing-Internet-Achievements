import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProvidedResults } from '../provided-results.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const store = createProvidedResults(root)
const index = JSON.parse(readFileSync(resolve(root, 'artifacts/provided/index.json')))

test('provided results are scoped to matching scenes and preserve source bytes', () => {
  assert.equal(store.find('geodynamics', 'tectonic-evolution').id, 'citcomcu-caseA-12500')
  assert.equal(store.find('llm', 'llm-pretraining').training.operators.length, 4)
  for (const [domain, scenario] of [['geodynamics', 'wave-propagation'], ['uav', 'path-planning'], ['automotive', 'vehicle-crash'], ['llm', 'tectonic-evolution']]) assert.equal(store.find(domain, scenario), null)
  for (const asset of index.assets) {
    const file = store.file(asset.id)
    const bytes = readFileSync(file.path)
    assert.equal(bytes.length, asset.size)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256)
  }
  assert.equal(store.file('citcomcu-archive', true), null)
  assert.equal(store.file('../index.json'), null)
  assert.equal(store.file('toString'), null)
})

test('missing files and paths escaping the package are unavailable', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'provided-results-'))
  t.after(() => rmSync(temporary, { recursive: true, force: true }))
  assert.equal(createProvidedResults(temporary).find('llm', 'llm-pretraining'), null)
  mkdirSync(join(temporary, 'artifacts/provided'), { recursive: true })
  writeFileSync(join(temporary, 'outside.txt'), 'private')
  writeFileSync(join(temporary, 'artifacts/provided/index.json'), JSON.stringify({ results: [], assets: [{ id: 'escape', path: '../../outside.txt' }, { id: 'missing', path: 'missing.txt' }] }))
  const files = createProvidedResults(temporary)
  assert.equal(files.file('escape'), null)
  assert.equal(files.file('missing'), null)
})

test('49×49 slice and global statistics agree with the original VTR field ordering', () => {
  const geo = store.find('geodynamics', 'tectonic-evolution').snapshot
  const xml = readFileSync(store.file('citcomcu-caseA-12500.vtr').path, 'utf8')
  const arrays = Object.fromEntries([...xml.matchAll(/<DataArray\b[^>]*Name="([^"]+)"[^>]*>([\s\S]*?)<\/DataArray>/g)].map(([, name, content]) => [name, content.trim().split(/\s+/).map(Number)]))
  assert.deepEqual(geo.grid_shape, [49, 49, 49])
  assert.equal(geo.point_count, 117649)
  assert.equal(geo.snapshot_count, 1)
  assert.equal(geo.simulation_time, 0.0347853)
  const speeds = Array.from({ length: geo.point_count }, (_, i) => Math.hypot(...arrays.velocity.slice(i * 3, i * 3 + 3)))
  for (const [field, values] of [['temperature', arrays.temperature], ['velocity', speeds]]) {
    assert.equal(geo.slice[field].length, 2401)
    for (const [theta, radius, value] of geo.slice[field]) assert.ok(Math.abs(value - values[(24 * 49 + theta) * 49 + radius]) < 1e-8)
    assert.ok(Math.abs(geo.statistics[field].mean - values.reduce((sum, value) => sum + value, 0) / values.length) < 1e-8)
  }
})

test('training preserves distinct operator and trial measurements without fabricated model artifacts', () => {
  const result = store.find('llm', 'llm-pretraining')
  const ops = Object.fromEntries(result.training.operators.map(op => [op.id, op]))
  assert.equal(result.training.run_id, 'sim-word-image-training-001')
  assert.deepEqual(ops['ai-data-prep'].splits.map(row => [row.images, row.samples]), [[9,18], [5,10], [4,8]])
  assert.deepEqual(ops['transformers-trainer'].series.map(row => row.loss), [.1317,.0612,.0438])
  assert.equal(ops['peft-lora'].series[0].eval_loss, 1.3928)
  assert.equal(ops['pytorch-ddp'].series.length, 9)
  assert.deepEqual(ops['pytorch-ddp'].trials.map(row => row.parallel_seconds), [26.22,26.14,26.07])
  assert.deepEqual(result.artifacts.map(a => a.format), ['md'])
})
