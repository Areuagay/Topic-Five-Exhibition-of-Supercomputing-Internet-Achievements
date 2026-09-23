import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000'
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  const response = await page.request.post(`${base}/api/v1/llm/scenarios/pinn-acceleration/operators/submit`, { data: { operator_ids: ['ai-train-pinn', 'ai-eval-pinn'] } })
  const id = (await response.json()).data.run_id
  await page.goto(`${base}/domains/llm/scenarios?scenario=pinn-acceleration&step=monitor&run=${id}`)
  await page.locator('.exp-monitor .el-table__row').filter({ hasText: id }).waitFor({ timeout: 30000 })
  const listPattern = '**/api/v1/llm/runs'
  await page.route(listPattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'temporary test failure' }) }))
  await page.locator('.experience-live-message').waitFor({ timeout: 10000 })
  assert.equal(new URL(page.url()).searchParams.get('run'), id)
  assert.ok(await page.locator('.exp-monitor .el-table__row').filter({ hasText: id }).count())
  await page.unroute(listPattern)
  await page.locator('.experience-live-message').waitFor({ state: 'hidden', timeout: 10000 })
  assert.equal(new URL(page.url()).searchParams.get('run'), id)
  console.log('PASS list outage retains the selected run and recovers automatically')

  await page.goto(`${base}/domains/llm/runs/${id}`)
  await page.locator('.run-progress-summary strong').waitFor()
  assert.equal(await page.locator('.run-data-disclosure').count(), 0)
  const progressBefore = Number((await page.locator('.run-progress-summary strong').innerText()).replace('%', ''))
  const detailPattern = `**/api/v1/llm/runs/${id}`
  await page.route(detailPattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.locator('.run-poll-feedback').waitFor({ timeout: 10000 })
  await page.unroute(detailPattern)
  await page.locator('.run-poll-feedback').waitFor({ state: 'hidden', timeout: 10000 })
  const progressAfter = Number((await page.locator('.run-progress-summary strong').innerText()).replace('%', ''))
  assert.ok(progressAfter > progressBefore)
  console.log('PASS detail outage retries; unfinished runs expose no final data details')

  await page.goto(`${base}/domains/llm/scenarios?scenario=pinn-acceleration&step=operator`)
  await page.getByRole('button', { name: /采用场景推荐/ }).click()
  let releaseSnapshot
  let held = false
  await page.route(listPattern, async route => {
    if (held) return route.continue()
    held = true
    const response = await route.fetch()
    await new Promise(resolve => { releaseSnapshot = resolve })
    await route.fulfill({ response })
  })
  while (!releaseSnapshot) await page.waitForTimeout(100)
  const submitted = page.waitForResponse(response => response.url().endsWith('/operators/submit') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '提交算子', exact: true }).click()
  const newId = (await (await submitted).json()).data.run_id
  await page.waitForTimeout(700)
  releaseSnapshot()
  await page.locator('.experience-step.is-active').filter({ hasText: '流程编排' }).waitFor()
  await page.waitForTimeout(100)
  assert.equal(new URL(page.url()).searchParams.get('run'), newId, 'an older poll cannot replace the newly submitted selection')
  assert.ok((await page.locator('.exp-toolbar-field .el-select').innerText()).includes(newId), 'displayed workflow selection also remains on the new task')
  await page.unroute(listPattern)
  console.log('PASS delayed pre-submit polling cannot overwrite the new task')

  await page.request.delete(`${base}/api/v1/llm/datasets/DS-PINN-0001`)
  await page.goto(`${base}/domains/llm/scenarios?scenario=pinn-acceleration&step=data`)
  const row = page.locator('.exp-dataprep .el-table__row').filter({ hasText: 'DS-PINN-0001' })
  await row.getByRole('button', { name: '上传数据', exact: true }).waitFor()
  const uploadPattern = '**/api/v1/llm/datasets/DS-PINN-0001/upload'
  await page.route(uploadPattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '模拟网络异常，请重试' }) }))
  await row.getByRole('button', { name: '上传数据', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '模拟网络异常' }).waitFor({ timeout: 15000 })
  await page.unroute(uploadPattern)
  await row.getByRole('button', { name: '上传数据', exact: true }).click()
  await row.locator('.dataset-transfer').waitFor()
  await page.locator('.experience-step').filter({ hasText: '资源调度' }).click()
  await page.locator('.experience-step').filter({ hasText: '数据准备' }).click()
  await row.getByRole('button', { name: '上传数据', exact: true }).waitFor()
  const data = (await (await page.request.get(`${base}/api/v1/llm/datasets`)).json()).data
  assert.equal(data.find(d => d.dataset_id === 'DS-PINN-0001').uploaded, false)
  await row.getByRole('button', { name: '上传数据', exact: true }).click()
  await row.getByText('已上传', { exact: false }).waitFor({ timeout: 15000 })
  console.log('PASS upload failure, retry and navigation cancellation')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '.runtime-logs/experience-qa/mobile-data.png', fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  assert.equal(overflow, false, 'mobile page has no outer horizontal overflow')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS 390px layout and no browser runtime errors')
} finally { await browser.close() }
