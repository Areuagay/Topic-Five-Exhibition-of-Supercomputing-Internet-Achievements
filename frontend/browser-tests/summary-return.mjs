import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
  const page = await browser.newPage()
  await page.goto(`${process.env.FRONTEND_URL || 'http://127.0.0.1:3000'}/domains/geodynamics/runs/NOT-FOUND`)
  const back = page.getByRole('link',{name:'返回运行列表',exact:true})
  await back.waitFor()
  assert.equal(await back.getAttribute('href'),'/domains/geodynamics/runs')
  await page.getByRole('button',{name:'重试',exact:true}).waitFor()
  await back.click()
  await page.waitForURL('**/domains/geodynamics/runs')
  console.log('PASS: failed summary provides retry and working return-to-list navigation')
} finally { await browser.close() }
