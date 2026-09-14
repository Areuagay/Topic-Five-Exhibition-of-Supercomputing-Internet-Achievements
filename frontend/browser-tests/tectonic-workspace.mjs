import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
const out = process.env.SCREENSHOT_DIR || '../.runtime-logs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const payload = page.waitForResponse(response => response.url().endsWith('/GEO-20260811-0010/metrics'))
  await page.goto(`${base}/domains/geodynamics/runs/GEO-20260811-0010`)
  const data = (await (await payload).json()).data.domain_data
  await page.waitForFunction(() => document.querySelector('.tectonic-field img')?.naturalWidth > 0)
  assert.equal(await page.locator('.tectonic-stats dd').first().innerText(), data.temperature_series[0].max_temperature.toLocaleString('zh-CN', { maximumFractionDigits: 2 }))
  await page.getByRole('button', { name: '速度场', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.tectonic-field img')?.src.includes('TV01'))
  assert.equal(await page.locator('.tectonic-stats dd').first().innerText(), data.velocity_series[0].max_velocity.toExponential(3))
  await page.getByRole('slider', { name: '板块场时间帧' }).fill('7')
  await page.waitForFunction(() => document.querySelector('.tectonic-field img')?.src.includes('TV08'))
  assert.equal(await page.locator('.tectonic-controls output').innerText(), '8 / 8')
  const last = data.velocity_series.find(row => row.time === data.field_frames[7].time)
  assert.equal(await page.locator('.tectonic-stats dd').first().innerText(), last.max_velocity.toExponential(3))
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.tectonic-controls input').value !== '7')
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '温度场', exact: true }).click()
  await page.getByRole('slider', { name: '板块场时间帧' }).fill('0')
  await page.waitForFunction(() => document.querySelector('.tectonic-field img')?.src.includes('TT01'))
  for (const [width, height] of [[1920, 1080], [1366, 768]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.tectonic-workspace').screenshot({ path: `${out}/tectonic-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.route('**/GEO-20260811-0010/metrics', async route => {
    const response = await route.fetch()
    const json = await response.json()
    json.data.domain_data.field_frames = []
    await route.fulfill({ response, json })
  })
  await page.reload()
  await page.getByText('暂无温度场图像', { exact: true }).waitFor()
  await page.locator('.tectonic-trend canvas').waitFor()
  await page.locator('.tectonic-convergence canvas').waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: temperature/velocity media + charts + sampled values, slider/playback, desktop layouts, missing-frame fallback')
} finally { await browser.close() }
