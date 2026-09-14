import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
const out = process.env.SCREENSHOT_DIR || '../.runtime-logs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/domains/llm/runs/LLM-20260811-0001`)
  await page.locator('.llm-workspace canvas').first().waitFor()
  assert.equal(await page.locator('.gpu-grid button').count(), 12)
  await page.locator('.gpu-grid button').nth(3).focus()
  assert.equal(await page.locator('.gpu-grid button').nth(3).getAttribute('aria-pressed'), 'true')
  await page.getByRole('group', { name: 'GPU 显示指标' }).getByRole('button', { name: '温度', exact: true }).click()
  await page.locator('.checkpoint-list button').nth(1).click()
  assert.match(await page.locator('.checkpoint-detail').innerText(), /Step 2000/)
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 })
    await page.locator('.llm-workspace').screenshot({ path: `${out}/llm-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.goto(`${base}/domains/llm/runs/LLM-20260811-0010`)
  await page.locator('.pinn-workspace canvas').first().waitFor()
  assert.equal(await page.locator('.pinn-workspace canvas').count(), 3)
  const physics = page.getByRole('group', { name: '损失曲线显示' }).getByRole('button', { name: 'Physics Loss', exact: true })
  await physics.click()
  assert.equal(await physics.getAttribute('aria-pressed'), 'false')
  await physics.click()
  assert.match(await page.locator('.pinn-workspace .ai-stats').innerText(), /12,000/)
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 })
    await page.locator('.pinn-workspace').screenshot({ path: `${out}/pinn-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.route('**/LLM-20260811-0010/metrics', async route => {
    const response = await route.fetch(); const json = await response.json()
    delete json.data.domain_data.residual_field
    await route.fulfill({ response, json })
  })
  await page.reload()
  await page.getByText('暂无残差场数据', { exact: true }).waitFor()
  assert.equal(await page.locator('.pinn-workspace canvas').count(), 2)
  assert.deepEqual(errors, [])
  console.log('PASS: LLM GPU selection/checkpoints, PINN loss toggles/heatmap/samples, 1920/1366 layouts, missing-field fallback')
} finally { await browser.close() }
