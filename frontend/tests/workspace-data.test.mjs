import assert from 'node:assert/strict'
import test from 'node:test'

test('quantity labels only include a supplied nonempty unit', async () => {
  const { quantityLabel } = await import('../utils/workspace.ts')
  assert.equal(quantityLabel('温度'), '温度')
  assert.equal(quantityLabel('温度', ' '), '温度')
  assert.equal(quantityLabel('温度', '℃'), '温度（℃）')
  assert.equal(quantityLabel('模拟时间', 'Myr'), '模拟时间（Myr）')
})

test('series units use API metadata or matching metric units without guessing', async () => {
  const { metricUnit } = await import('../utils/workspace.ts')
  assert.equal(metricUnit({ units: { temperature: ' K ' } }, 'temperature'), 'K')
  assert.equal(metricUnit({ metrics: [{ name: 'temperature', unit: '℃' }] }, 'temperature'), '℃')
  assert.equal(metricUnit({ metrics: [{ name: 'other', unit: '%' }] }, 'temperature'), '')
  assert.equal(metricUnit({ units: { temperature: ' ' } }, 'temperature'), '')
})

test('artifact URLs follow the configured API gateway and reject non-web schemes', async () => {
  const { resolveArtifactUrl } = await import('../utils/workspace.ts')
  assert.equal(resolveArtifactUrl('/api/v1/files/a/preview', 'https://host.test/gateway/api/v1'), 'https://host.test/gateway/api/v1/files/a/preview')
  assert.equal(resolveArtifactUrl('/api/v1/files/a/preview', ''), '/api/v1/files/a/preview')
  assert.equal(resolveArtifactUrl('gfs://placeholder', ''), '')
  assert.equal(resolveArtifactUrl('javascript:alert(1)', ''), '')
})

test('wave series preserve physical coordinates, negative amplitudes and missing values', async () => {
  const { waveSeries } = await import('../utils/workspace.ts')
  assert.deepEqual(waveSeries([{ time: 0, amplitude: -0.5 }, { time: 0.15, amplitude: null }], 'time', 'amplitude'), [[0, -0.5], [0.15, null]])
  assert.deepEqual(waveSeries(undefined, 'time', 'amplitude'), [])
})

test('registry distinguishes supported, planned and unknown scenarios', async () => {
  const { getScenarioWorkspace, scenarioWorkspaces } = await import('../config/scenario-workspaces.ts')
  assert.equal(Object.keys(scenarioWorkspaces).length, 12)
  assert.equal(getScenarioWorkspace('wave-propagation')?.available, true)
  assert.equal(getScenarioWorkspace('tectonic-evolution')?.available, true)
  assert.equal(getScenarioWorkspace('llm-pretraining')?.available, true)
  assert.equal(getScenarioWorkspace('pinn-acceleration')?.available, true)
  assert.equal(getScenarioWorkspace('vehicle-crash')?.available, true)
  assert.equal(getScenarioWorkspace('fatigue-life')?.available, true)
  assert.equal(getScenarioWorkspace('path-planning')?.available, true)
  assert.equal(getScenarioWorkspace('swarm-coordination')?.available, true)
  assert.equal(getScenarioWorkspace('virtual-screening')?.available, true)
  assert.equal(getScenarioWorkspace('admet-prediction')?.available, true)
  assert.equal(getScenarioWorkspace('band-dos')?.available, true)
  assert.equal(getScenarioWorkspace('high-throughput-screening')?.available, true)
  assert.equal(getScenarioWorkspace('plate-tectonics'), undefined)
  assert.equal(getScenarioWorkspace('toString'), undefined)
})
