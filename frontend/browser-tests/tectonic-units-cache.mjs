import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
try {
  const page = await browser.newPage()
  await page.addInitScript(() => performance.setResourceTimingBufferSize(3000))
  const requests = []
  page.on('request', r => { if (r.url().includes('/files/ART-GEO-T')) requests.push(r.url()) })
  await page.goto(`${base}/domains/geodynamics/runs/GEO-20260811-0010`)
  await page.waitForFunction(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/files/ART-GEO-T')).length >= 16)
  const before = requests.length
  for (const label of ['速度场', '温度场', '速度场', '温度场']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.waitForFunction(prefix => document.querySelector('.tectonic-field img')?.src.includes(prefix), label === '温度场' ? 'TT01' : 'TV01')
  }
  assert.equal(requests.length, before, 'Warm switches must not re-request no-store images')
  assert.equal(await page.locator('.tectonic-stats dt').first().innerText(), '当前帧最高温度')
  await page.route('**/GEO-20260811-0010/metrics', async route => {
    const response = await route.fetch(); const json = await response.json()
    json.data.domain_data.units = { temperature: '℃', velocity: 'm/s', time: 'Myr' }
    await route.fulfill({ response, json })
  })
  await page.reload()
  await page.getByText('当前帧最高温度（℃）', { exact: true }).waitFor()
  assert.match(await page.locator('.tectonic-time').innerText(), /Myr/)
  await page.getByRole('button', { name: '速度场', exact: true }).click()
  await page.getByText('当前帧最高速度（m/s）', { exact: true }).waitFor()
  console.log(`PASS: 4 warm field switches added 0 requests (${before} initial frames); absent/present API units update automatically`)
} finally { await browser.close() }
