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
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/domains/automotive/runs/AUTO-20260811-0001`)
  await page.waitForFunction(() => document.querySelector('.crash-workspace img')?.naturalWidth > 0)
  assert.equal(await page.getByRole('group', { name: '碰撞结果切换' }).getByRole('button').count(), 3)
  await page.getByRole('button', { name: '最终应力', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.crash-workspace img')?.src.includes('C03'))
  assert.equal(await page.locator('.crash-workspace canvas').count(), 3)
  assert.match(await page.locator('.crash-workspace .auto-stats').innerText(), /39.64/)
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 })
    await page.locator('.crash-workspace').screenshot({ path: `${out}/crash-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.goto(`${base}/domains/automotive/runs/AUTO-20260811-0010`)
  await page.waitForFunction(() => document.querySelector('.fatigue-workspace img')?.naturalWidth > 0)
  await page.locator('.location-list button').nth(1).click()
  assert.equal(await page.locator('.location-list button').nth(1).getAttribute('aria-pressed'), 'true')
  assert.match(await page.locator('.selected-location').innerText(), /焊趾 A/)
  assert.match(await page.locator('.location-facts').innerText(), /37,193/)
  assert.equal(await page.locator('.fatigue-workspace canvas').count(), 2)
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 })
    await page.locator('.fatigue-workspace').screenshot({ path: `${out}/fatigue-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  let fail = true
  await page.route('**/AUTO-20260811-0010/artifacts', route => fail ? route.fulfill({ status: 503, json: { code: 503, data: null } }) : route.continue())
  await page.reload()
  await page.locator('.fatigue-workspace').getByText('损伤图像加载失败', { exact: true }).waitFor()
  assert.equal(await page.locator('.fatigue-workspace canvas').count(), 2)
  fail = false
  await page.locator('.fatigue-workspace').getByRole('button', { name: '重试', exact: true }).click()
  await page.locator('.fatigue-workspace img').waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: collision keyframes/results, fatigue selection/life, 1920/1366 layouts, artifact failure isolation/retry')
} finally { await browser.close() }
