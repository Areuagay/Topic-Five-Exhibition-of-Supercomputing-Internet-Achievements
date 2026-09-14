import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
const out = process.env.SCREENSHOT_DIR || '../.runtime-logs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1080 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/domains/dft/runs/DFT-20260811-0001`)
  const band = page.locator('.band-workspace')
  await band.locator('canvas').nth(2).waitFor()
  assert.equal(await band.locator('canvas').count(), 3)
  assert.match(await band.innerText(), /费米能级：0/)
  await band.getByRole('button', { name: '能量变化', exact: true }).click()
  assert.equal(await band.getByRole('button', { name: '能量变化', exact: true }).getAttribute('aria-pressed'), 'true')
  await band.getByLabel('选择原子').selectOption('1')
  assert.match(await band.locator('.atom-values').innerText(), /0\.25/)
  await band.getByRole('button', { name: 'X–Z', exact: true }).click()
  assert.equal(await band.getByRole('button', { name: 'X–Z', exact: true }).getAttribute('aria-pressed'), 'true')
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: 1080 })
    await band.screenshot({ path: `${out}/band-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.goto(`${base}/domains/dft/runs/DFT-20260811-0010`)
  const batch = page.locator('.throughput-workspace')
  await batch.locator('canvas').nth(1).waitFor()
  const allCount = await batch.locator('tbody tr').count()
  assert.ok(allCount > 10)
  await batch.getByLabel('计算中心', { exact: true }).selectOption('changsha')
  assert.ok(await batch.locator('tbody tr').count() < allCount)
  await batch.getByLabel('状态', { exact: true }).selectOption('unconverged')
  for (const value of await batch.locator('tbody tr td:nth-child(6)').allInnerTexts()) assert.equal(value, '否')
  await batch.locator('.ranking-list button').first().click()
  assert.match(await batch.locator('.selected-material').innerText(), /SIM-MAT-0086/)
  assert.equal(await batch.getByLabel('状态', { exact: true }).inputValue(), 'all')
  assert.equal(await batch.getByLabel('计算中心', { exact: true }).inputValue(), '')
  await batch.getByLabel('搜索材料').fill('SIM-MAT-0002')
  assert.equal(await batch.locator('tbody tr').count(), 1)
  assert.match(await batch.locator('.selected-material').innerText(), /SIM-MAT-0002/)
  await batch.getByLabel('搜索材料').fill('')
  await batch.getByLabel('排序', { exact: true }).selectOption('band_gap')
  await batch.getByRole('button', { name: '升序', exact: true }).click()
  const gaps = await batch.locator('tbody tr td:nth-child(4)').allInnerTexts()
  assert.deepEqual(gaps.map(Number), gaps.map(Number).sort((a,b) => b-a))
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: 1080 })
    await batch.screenshot({ path: `${out}/throughput-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  // Isolate missing panels; preserve zero Fermi and dynamically supplied units.
  await page.route('**/DFT-20260811-0001/metrics', async route => {
    const response = await route.fetch(); const body = await response.json()
    delete body.data.domain_data.dos_series
    delete body.data.domain_data.structure
    body.data.domain_data.units = { energy: 'eV' }
    await route.fulfill({ json: body })
  })
  await page.goto(`${base}/domains/dft/runs/DFT-20260811-0001`)
  await band.getByText('暂无态密度数据', { exact: true }).waitFor()
  assert.equal(await band.locator('canvas').count(), 2)
  assert.match(await band.innerText(), /费米能级.*eV.*0/)
  await band.getByText('暂无原子数据', { exact: true }).waitFor()
  await page.route('**/DFT-20260811-0010/metrics', async route => {
    const response = await route.fetch(); const body = await response.json()
    delete body.data.domain_data.materials
    await route.fulfill({ json: body })
  })
  await page.goto(`${base}/domains/dft/runs/DFT-20260811-0010`)
  await batch.getByText('暂无材料属性数据', { exact: true }).waitFor()
  assert.equal(await batch.locator('canvas').count(), 1)
  assert.equal(await batch.locator('.ranking-list button').first().isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('PASS: band/DOS/SCF, atom projection, material filters/sort/ranking, dynamic units, missing blocks, 1920/1366 layouts')
} finally { await browser.close() }
