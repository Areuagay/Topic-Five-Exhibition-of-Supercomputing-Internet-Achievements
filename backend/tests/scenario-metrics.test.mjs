import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('secondary scenarios report their own scientific quantities from the plotted data', async () => {
  const module = await import('../scenario-metrics.js').catch(() => null)
  assert.ok(module?.scenarioMetrics)
  for (const [domain, prefix, expected, absent] of [
    ['llm', 'LLM', 'physics_loss', 'tokens_per_second'],
    ['automotive', 'AUTO', 'damage_ratio', 'kinetic_energy'],
    ['uav', 'UAV', 'best_cost', 'formation_error'],
    ['drug', 'DRUG', 'passed_compounds', 'best_docking_score'],
    ['dft', 'DFT', 'completed_materials', 'total_energy'],
  ]) {
    const detail = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../mock-data/${domain}/run-details/${prefix}-20260811-0010.json`))).data
    const metrics = module.scenarioMetrics(detail.scenario_id, detail.metrics.domain_data, 100)
    assert.ok(metrics.some(m => m.name === expected))
    assert.ok(!metrics.some(m => m.name === absent))
    if (domain === 'llm') assert.equal(metrics.find(m => m.name === 'physics_loss').value, detail.metrics.domain_data.pinn_training_series.at(-1).physics_loss)
  }
})
