import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
const out = process.env.SCREENSHOT_DIR || '../.runtime-logs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/domains/drug/runs/DRUG-20260811-0001`)
  const screening = page.locator('.screening-workspace')
  await page.waitForFunction(() => document.querySelector('.screening-workspace img')?.naturalWidth > 0)
  assert.equal(await screening.locator('tbody tr').count(), 16)
  assert.equal(await screening.locator('canvas').count(), 1)
  assert.equal(await screening.locator('.screening-stage').count(), 5)
  assert.match(await screening.locator('.screening-stage').first().innerText(), /1,000,000/)
  assert.match(await screening.locator('.screening-stage').nth(1).innerText(), /82%/)
  await screening.getByRole('button', { name: 'SIM-CMPD-0002', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.screening-workspace img')?.src.includes('VC02'))
  await screening.getByLabel('排序', { exact: true }).selectOption('docking_score')
  await screening.getByRole('button', { name: '升序', exact: true }).click()
  const values = await screening.locator('tbody tr').evaluateAll(rows => rows.map(r => Number(r.children[2].textContent)))
  assert.deepEqual(values, [...values].sort((a,b) => b-a))
  await screening.getByLabel('搜索编号').fill('CMPD-0002')
  assert.equal(await screening.locator('tbody tr').count(), 1)
  await screening.getByLabel('搜索编号').fill('no-match')
  await screening.getByText('无匹配候选', { exact: true }).waitFor()
  await screening.getByLabel('搜索编号').fill('')
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: 1080 })
    await screening.screenshot({ path: `${out}/screening-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.goto(`${base}/domains/drug/runs/DRUG-20260811-0010`)
  const admet = page.locator('.admet-workspace')
  await admet.locator('canvas').nth(3).waitFor()
  assert.equal(await admet.locator('tbody tr').count(), 36)
  await admet.getByLabel('通过状态').selectOption('passed')
  assert.equal(await admet.locator('tbody tr').count(), 7)
  await admet.getByRole('button', { name: 'SIM-ADMET-002', exact: true }).click()
  assert.equal(await admet.locator('.selected-candidate').innerText(), 'SIM-ADMET-002')
  await admet.getByLabel('查看性质').selectOption('toxicity')
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: 1080 })
    await admet.screenshot({ path: `${out}/admet-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  // Click second heatmap row and verify the selected radar candidate follows.
  const secondId = await admet.locator('tbody tr').nth(1).locator('button').innerText()
  const heat = admet.locator('.heatmap-scroll canvas')
  await heat.scrollIntoViewIfNeeded()
  const box = await heat.boundingBox()
  const heatHeight = Math.max(300, 7*26+120)
  await heat.click({ position: { x: 146+(box.width-146-28)/10, y: 44+(heatHeight-44-72)/7*1.5 } })
  assert.equal(await admet.locator('.selected-candidate').innerText(), secondId)
  await admet.getByLabel('搜索编号').fill('no-match')
  await admet.getByText('无匹配候选', { exact: true }).waitFor()
  assert.equal(await admet.locator('canvas').count(), 2)
  // Independent blocks survive missing candidate properties; rules and units use API values.
  await page.route('**/DRUG-20260811-0010/metrics', async route => {
    const response = await route.fetch(); const body = await response.json()
    body.data.domain_data.filter_rule.toxicity_lt = 0.25
    body.data.domain_data.units = { toxicity: '测试单位' }
    delete body.data.domain_data.candidate_properties
    await route.fulfill({ json: body })
  })
  await page.reload()
  await admet.getByText('暂无候选数据', { exact: true }).waitFor()
  assert.match(await admet.innerText(), /毒性.*测试单位.*< 0.25/)
  assert.equal(await admet.locator('canvas').count(), 2)
  // Missing preview and score distribution do not hide the ranking or funnel.
  await page.route('**/DRUG-20260811-0001/metrics', async route => {
    const response = await route.fetch(); const body = await response.json()
    for (const candidate of body.data.domain_data.top_candidates) delete candidate.preview_url
    delete body.data.domain_data.score_distribution
    await route.fulfill({ json: body })
  })
  await page.goto(`${base}/domains/drug/runs/DRUG-20260811-0001`)
  await screening.getByText('暂无候选图像', { exact: true }).waitFor()
  assert.equal(await screening.locator('canvas').count(), 0)
  assert.equal(await screening.locator('tbody tr').count(), 16)
  assert.deepEqual(errors, [])
  console.log('PASS: screening sort/search/preview, ADMET status/radar/heatmap selection, dynamic rules/units, missing blocks, 1920/1366 layouts')
} finally { await browser.close() }
