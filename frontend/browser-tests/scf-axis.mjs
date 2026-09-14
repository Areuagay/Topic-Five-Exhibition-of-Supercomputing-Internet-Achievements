import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel:'chrome', headless:true })
try {
  const page = await browser.newPage({ viewport:{ width:1366, height:1000 } })
  const errors = []
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      (this.canvas.__drawnTexts ??= []).push(String(args[0]))
      return original.apply(this, args)
    }
  })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${process.env.FRONTEND_URL || 'http://127.0.0.1:3000'}/domains/dft/runs/DFT-20260811-0010`)
  const section = page.locator('section').filter({ has: page.locator('#extra-scf_series') }).last()
  await section.locator('canvas').waitFor()
  await page.waitForTimeout(1200) // Allow ECharts entry animation to finish before visual capture.
  assert.equal(await section.getByRole('button', { name:'总能量', exact:true }).getAttribute('aria-pressed'), 'true')
  await section.screenshot({ path:'../.runtime-logs/scf-total-only.png' })
  const totalTexts = await section.locator('canvas').evaluate(c => c.__drawnTexts)
  assert.ok(totalTexts.some(t => t.startsWith('总能量')))
  assert.ok(totalTexts.some(t => /^-108\./.test(t)))
  await section.locator('canvas').evaluate(c => { c.__drawnTexts = [] })
  await section.getByRole('button', { name:'能量变化', exact:true }).click()
  assert.equal(await section.getByRole('button', { name:'能量变化', exact:true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await section.getByRole('button', { name:'总能量', exact:true }).getAttribute('aria-pressed'), 'false')
  await page.waitForTimeout(1200)
  await section.screenshot({ path:'../.runtime-logs/scf-delta-only.png' })
  const deltaTexts = await section.locator('canvas').evaluate(c => c.__drawnTexts)
  assert.ok(deltaTexts.some(t => t.startsWith('能量变化')))
  assert.ok(!deltaTexts.some(t => t.startsWith('总能量')))
  assert.ok(deltaTexts.includes('0'))
  await section.getByRole('button', { name:'总能量', exact:true }).click()
  assert.equal(await section.getByRole('button', { name:'总能量', exact:true }).getAttribute('aria-pressed'), 'true')
  assert.deepEqual(errors, [])
  console.log('PASS: SCF single-metric switching in both directions; screenshots saved')
} finally { await browser.close() }
