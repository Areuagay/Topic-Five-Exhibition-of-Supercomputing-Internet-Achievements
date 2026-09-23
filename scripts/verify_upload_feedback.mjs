import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000'
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  const datasets = (await (await page.request.get(`${base}/api/v1/geodynamics/datasets`)).json()).data
  const sample = datasets.filter(d => d.scenario_id === 'wave-propagation' && !d.builtin).sort((a,b) => a.size_bytes - b.size_bytes)[0]
  await page.request.delete(`${base}/api/v1/geodynamics/datasets/${sample.dataset_id}`)
  await page.goto(`${base}/domains/geodynamics/scenarios?scenario=wave-propagation&step=data`)
  const row = page.locator('.exp-dataprep .el-table__row').filter({ hasText: sample.dataset_id })
  await row.getByRole('button', {name:'上传数据', exact:true}).waitFor()
  await page.waitForTimeout(600)
  await page.evaluate(id => {
    window.feedbackFrames = []
    window.recordFeedback = true
    function record() {
      const row = [...document.querySelectorAll('.exp-dataprep .el-table__row')].find(r => r.textContent.includes(id))
      const box = row.getBoundingClientRect()
      const transform = getComputedStyle(row, '::after').transform
      window.feedbackFrames.push({ y: box.y + scrollY, height: box.height, width: box.width, state: row.className,
        sweepX: transform === 'none' ? null : new DOMMatrixReadOnly(transform).m41,
        animations: row.getAnimations({subtree:true}).map(a => a.animationName || '') })
      if (window.recordFeedback) requestAnimationFrame(record)
    }
    record()
  }, sample.dataset_id)
  await row.getByRole('button', {name:'上传数据', exact:true}).evaluate(el => el.click())
  await row.locator('.dataset-transfer').waitFor()
  await page.waitForTimeout(400)
  await page.screenshot({ path: '.runtime-logs/upload-redesign-progress.png', fullPage:true })
  await row.locator('.dataset-uploaded').waitFor({ timeout:20000 })
  await page.waitForTimeout(150)
  await page.screenshot({ path: '.runtime-logs/upload-redesign-success.png', fullPage:true })
  await page.waitForTimeout(1200)
  await row.getByRole('button', {name:'移除', exact:true}).evaluate(el => el.click())
  await row.getByRole('button', {name:'上传数据', exact:true}).waitFor()
  await page.waitForTimeout(150)
  await page.screenshot({ path: '.runtime-logs/upload-redesign-remove.png', fullPage:true })
  await page.waitForTimeout(1200)
  const frames = await page.evaluate(() => { window.recordFeedback = false; return window.feedbackFrames })
  const range = field => Math.max(...frames.map(f => f[field])) - Math.min(...frames.map(f => f[field]))
  assert.ok(range('height') < 1, `row height changed by ${range('height')}px`)
  assert.ok(range('y') < 1, `row position changed by ${range('y')}px`)
  assert.ok(frames.some(f => f.state.includes('dataset-row--uploaded') && f.animations.some(name => name.startsWith('dataset-sweep'))), 'upload has green sweep')
  assert.ok(frames.some(f => f.state.includes('dataset-row--removed') && f.animations.some(name => name.startsWith('dataset-sweep'))), 'remove has red sweep')
  for (const state of ['uploaded', 'removed']) {
    const sweep = frames.filter(f => f.state.includes(`dataset-row--${state}`) && f.sweepX !== null)
    assert.ok(sweep.some(f => f.sweepX < -f.width * .5), `${state} begins off the left side`)
    assert.ok(sweep.some(f => f.sweepX > f.width * .98), `${state} exits fully to the right before removal`)
  }
  const upload = row.getByRole('button', {name:'上传数据', exact:true})
  await upload.hover()
  await page.waitForTimeout(240)
  assert.ok(await upload.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 < 0), 'hover retains tactile lift')
  assert.equal(await upload.evaluate(el => getComputedStyle(el).borderTopWidth), '1px', 'top border stays present')
  assert.deepEqual(errors, [])
  console.log('PASS stable row height/position, green upload sweep, red removal sweep, no runtime errors')
} finally { await browser.close() }
