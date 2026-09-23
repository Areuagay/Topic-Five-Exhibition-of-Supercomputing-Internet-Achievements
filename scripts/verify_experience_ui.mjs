// npm install playwright in a tool environment, then set PLAYWRIGHT_MODULE to
// its absolute package path if it is not available in this repository.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000'
const output = '.runtime-logs/experience-qa'
mkdirSync(output, { recursive: true })
const cases = [
  ['geodynamics', 'wave-propagation'], ['geodynamics', 'tectonic-evolution'],
  ['llm', 'llm-pretraining'], ['llm', 'pinn-acceleration'],
  ['automotive', 'vehicle-crash'], ['automotive', 'fatigue-life'],
  ['uav', 'swarm-coordination'], ['uav', 'path-planning'],
  ['drug', 'virtual-screening'], ['drug', 'admet-prediction'],
  ['dft', 'band-dos'], ['dft', 'high-throughput-screening'],
]
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' })
const report = []
async function check(domain, scenario) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const result = { domain, scenario, errors }
  try {
    await page.goto(`${base}/domains/${domain}/scenarios?scenario=${scenario}`)
    await page.locator('.exp-dataprep .el-table__row').first().waitFor({ timeout: 60000 })
    // Use a small upload sample, resetting only this runtime dataset when needed.
    const api = async path => (await (await page.request.get(`${base}/api/v1/${domain}/${path}`)).json()).data
    const datasets = await api('datasets')
    const sample = datasets.filter(d => d.scenario_id === scenario && !d.builtin).sort((a,b) => a.size_bytes - b.size_bytes)[0]
    const row = page.locator('.exp-dataprep .el-table__row').filter({ hasText: sample.dataset_id })
    if (sample.uploaded) { await row.getByRole('button', { name: '移除', exact: true }).click(); await row.getByRole('button', { name: '上传数据', exact: true }).waitFor() }
    await row.getByRole('button', { name: '上传数据', exact: true }).click()
    await row.locator('.dataset-transfer').waitFor()
    await page.waitForTimeout(450)
    assert.match(await row.locator('.dataset-transfer').innerText(), /[1-9]\d?%/)
    await row.getByText('已上传', { exact: false }).waitFor({ timeout: 20000 })
    result.upload = 'passed'
    await page.screenshot({ path: `${output}/${scenario}-data.png`, fullPage: true })
    await page.getByRole('button', { name: '一键导入', exact: true }).click()
    await page.locator('.experience-step.is-active').filter({ hasText: '资源调度' }).waitFor()
    await page.locator('.experience-step').filter({ hasText: '算子选择' }).click()
    await page.getByRole('button', { name: /采用场景推荐/ }).click()
    await page.getByRole('button', { name: '提交算子', exact: true }).click()
    await page.locator('.experience-step.is-active').filter({ hasText: '流程编排' }).waitFor()
    const runId = new URL(page.url()).searchParams.get('run')
    assert.ok(runId, 'submission selects a new run in the URL')
    result.runId = runId
    await page.locator('.vue-flow__node').first().waitFor()
    await page.locator('.experience-step').filter({ hasText: '执行监控' }).click()
    const runRow = page.locator('.exp-monitor .el-table__row').filter({ hasText: runId })
    await runRow.waitFor()
    assert.equal(await runRow.getByRole('button', { name: '查看结果' }).count(), 0)
    const before = (await api(`runs/${runId}`)).progress
    await page.waitForTimeout(2800)
    const after = (await api(`runs/${runId}`)).progress
    assert.ok(after > before, 'run advances while monitor is open')
    await page.reload()
    await page.locator('.exp-monitor .el-table__row').filter({ hasText: runId }).waitFor({ timeout: 30000 })
    assert.equal(new URL(page.url()).searchParams.get('run'), runId)
    assert.ok((await api(`runs/${runId}`)).progress >= after)
    result.monitorAndReload = 'passed'
    await page.locator('.experience-step').filter({ hasText: '结果展示' }).click()
    await page.getByText('任务尚未完成', { exact: true }).waitFor()
    await page.locator('.experience-step').filter({ hasText: '执行监控' }).click()
    await page.locator('.exp-monitor .el-table__row').filter({ hasText: runId }).getByRole('button', { name: '查看结果' }).waitFor({ timeout: 90000 })
    await page.locator('.exp-monitor .el-table__row').filter({ hasText: runId }).getByRole('button', { name: '查看结果' }).click()
    await page.getByText('指标展示', { exact: true }).waitFor({ timeout: 30000 })
    await page.screenshot({ path: `${output}/${scenario}-result.png`, fullPage: true })
    result.result = 'passed'
    assert.equal(errors.length, 0, 'no browser runtime errors')
    result.status = 'passed'
  } catch (error) { result.status = 'failed'; result.error = error.message; await page.screenshot({ path: `${output}/${scenario}-failure.png`, fullPage: true }).catch(() => {}) }
  finally { report.push(result); console.log(JSON.stringify(result)); await page.close() }
}
try {
  // Three independent browser sessions exercise concurrent clients as well.
  let next = 0
  await Promise.all(Array.from({ length: 3 }, async () => { while (next < cases.length) { const [domain, scenario] = cases[next++]; await check(domain, scenario) } }))
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
if (report.some(r => r.status !== 'passed')) process.exitCode = 1
