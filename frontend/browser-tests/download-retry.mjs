import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER || 'msedge', headless: true })
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/domains/llm/runs/LLM-20260811-0001`)
  const row = page.locator('.el-table__row').filter({ hasText: 'checkpoint-4200' })
  const trigger = row.locator('.download-trigger')
  await trigger.click()
  const notice = page.locator('.artifact-download-popover:visible')
  await notice.waitFor()
  await page.waitForTimeout(250)
  assert.equal(await notice.getByRole('button', { name: '关闭', exact: true }).count(), 0)
  const requestUrl = (await page.request.get(`${base}/api/v1/llm/runs/LLM-20260811-0001/artifacts`).then(r => r.json())).data.find(a => a.name === 'checkpoint-4200').download_url
  const pathname = new URL(requestUrl, page.url()).pathname
  let requests = 0
  const pending = []
  await page.route(`**${pathname}`, async route => {
    requests++
    const status = await new Promise(resolve => pending.push(resolve))
    await route.fulfill({ status, body: status === 200 ? 'available' : 'missing' })
  })
  // Track actual rendered geometry and visibility throughout both retry paths.
  for (const button of [notice.locator('.retry-download'), trigger]) {
    const before = await notice.boundingBox()
    const rowBefore = await row.boundingBox()
    const triggerBefore = await trigger.boundingBox()
    const count = requests
    await page.evaluate(() => {
      const panel = document.querySelector('.artifact-download-popover:not([style*="display: none"])')
      window.retryFrames = []
      window.retryTracking = true
      const sample = () => {
        const rect = panel.getBoundingClientRect(), style = getComputedStyle(panel)
        window.retryFrames.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity: Number(style.opacity), display: style.display })
        if (window.retryTracking) requestAnimationFrame(sample)
      }
      sample()
    })
    await button.click()
    await page.waitForFunction(() => document.querySelector('.download-failure .retry-download')?.disabled)
    await page.waitForTimeout(200)
    assert.equal(await trigger.isDisabled(), true)
    assert.equal(await notice.locator('.retry-download').isDisabled(), true)
    assert.equal(requests, count + 1)
    pending.shift()(404)
    await page.waitForFunction(() => !document.querySelector('.download-failure .retry-download')?.disabled)
    await page.waitForTimeout(200)
    const frames = await page.evaluate(() => { window.retryTracking = false; return window.retryFrames })
    assert.ok(frames.length > 5)
    assert.ok(frames.every(f => f.display !== 'none' && f.opacity === 1), 'retry must not close or reanimate the notice')
    assert.ok(frames.every(f => ['x','y','width','height'].every(k => Math.abs(f[k] - before[k]) < 1)), 'notice must not move or resize')
    assert.deepEqual(await row.boundingBox(), rowBefore)
    assert.deepEqual(await trigger.boundingBox(), triggerBefore)
  }
  // Closing while a request is pending must not reopen on its failure.
  await notice.locator('.retry-download').click()
  await page.waitForTimeout(100)
  await notice.getByRole('button', { name: '关闭下载提示' }).click()
  pending.shift()(404)
  await notice.waitFor({ state: 'hidden' })
  await page.waitForTimeout(200)
  assert.equal(await notice.count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: both retry paths keep the notice and table stationary, reject duplicate clicks, and respect close during a pending request')
} finally {
  await browser.close()
}
