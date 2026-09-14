import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  let release
  const gate = new Promise(resolve => { release = resolve })
  let requested
  const started = new Promise(resolve => { requested = resolve })
  await page.route('**/files/ART-GEO-W002/preview', async route => { requested(); await gate; await route.continue() })
  await page.goto(`${base}/domains/geodynamics/runs/GEO-20260811-0001`)
  await page.waitForFunction(() => document.querySelector('.wave-field img')?.naturalWidth > 0)
  const before = await page.locator('.wave-curves').evaluate(el => el.offsetTop)
  await page.locator('#wave-frame').fill('1')
  await started
  try {
    const during = await page.locator('.wave-curves').evaluate(el => el.offsetTop)
    assert.ok(Math.abs(during - before) <= 1, `Curves moved ${during - before}px while next frame was loading`)
    assert.ok(await page.locator('.wave-field img').evaluate(el => el.naturalWidth > 0), 'Previous frame must stay visible')
  } finally { release() }
  await page.waitForFunction(() => document.querySelector('.wave-field img')?.src.includes('W002') && document.querySelector('.wave-field img')?.naturalWidth > 0)
  const after = await page.locator('.wave-curves').evaluate(el => el.offsetTop)
  assert.ok(Math.abs(after - before) <= 1)
  console.log('PASS: delayed frame retains previous image; curve position stable before/during/after')
} finally { await browser.close() }
