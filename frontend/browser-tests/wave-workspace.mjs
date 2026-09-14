// Run against a started frontend and HTTP backend. See README professional workspace section.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
const out = process.env.SCREENSHOT_DIR || '../.runtime-logs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const run = '/domains/geodynamics/runs/GEO-20260811-0001'
const metricsPath = '**/api/v1/geodynamics/runs/GEO-20260811-0001/metrics'
const errors = []
const requests = new Set()
async function open(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', request => requests.add(new URL(request.url()).pathname))
  if (options.metrics) await page.route(metricsPath, options.metrics)
  if (options.artifacts) await page.route('**/api/v1/geodynamics/runs/GEO-20260811-0001/artifacts', options.artifacts)
  await page.goto(base + run)
  await page.locator('.run-record-id').waitFor()
  return page
}
try {
  const page = await open()
  await page.locator('.wave-field img').waitFor()
  for (const resource of ['workflow', 'metrics', 'logs', 'artifacts']) {
    assert.ok(requests.has(`/api/v1/geodynamics/runs/GEO-20260811-0001/${resource}`))
  }
  await page.waitForFunction(() => document.querySelector('.wave-field img').naturalWidth > 0)
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('#wave-frame').value) > 0)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.locator('#wave-frame').fill('9')
  assert.equal(await page.locator('.wave-controls output').innerText(), '10 / 10')
  for (const [width, height] of [[1920, 1080], [1366, 768]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.scenario-workspace').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: `${out}/wave-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  const csvRow = page.locator('.el-table__row').filter({ hasText: 'residual_series.csv' })
  await csvRow.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('.el-dialog .csv-scroll table').waitFor()
  assert.match(await page.locator('.el-dialog .csv-scroll thead').innerText(), /iteration/)
  await page.getByRole('button', { name: 'Close this dialog' }).click()
  const oldRow = page.locator('.el-table__row').filter({ hasText: 'wave_snapshot_6300.png' })
  await oldRow.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('.el-dialog [role="alert"]').waitFor()
  await page.getByRole('button', { name: 'Close this dialog' }).click()
  await oldRow.getByRole('button', { name: '下载', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '暂时无法下载' }).waitFor()
  assert.equal(new URL(page.url()).pathname, run)
  await page.close()
  console.log('PASS: wave playback/slider, desktop sizes, CSV preview, missing artifact feedback')

  let fail = true
  const failed = await open({ metrics: route => fail ? route.fulfill({ status: 503, json: { code: 503, message: 'test outage', data: null } }) : route.continue() })
  await failed.locator('.scenario-workspace').getByText('专业数据加载失败', { exact: true }).waitFor()
  await failed.locator('.run-log-line').first().waitFor()
  await failed.locator('.el-table__row').first().waitFor()
  fail = false
  await failed.locator('.scenario-workspace').getByRole('button', { name: '重试', exact: true }).click()
  await failed.locator('.wave-field img').waitFor()
  await failed.close()
  console.log('PASS: metrics outage preserves logs/artifacts and retry restores workspace')

  const noFrames = await open({ metrics: async route => {
    const response = await route.fetch(); const json = await response.json()
    json.data.domain_data.wavefield_frames = []
    await route.fulfill({ response, json })
  }, artifacts: route => route.fulfill({ status: 503, json: { code: 503, message: 'test outage', data: null } }) })
  await noFrames.getByText('暂无波场快照，仍可查看下方曲线。', { exact: true }).waitFor()
  await noFrames.getByText('输出产物加载失败', { exact: true }).waitFor()
  assert.equal(await noFrames.locator('.wave-curves canvas').count(), 2)
  await noFrames.locator('.run-log-line').first().waitFor()
  await noFrames.close()
  console.log('PASS: missing frames and artifact outage preserve both curves and logs')

  let release
  const gate = new Promise(resolve => { release = resolve })
  const slow = await open({ metrics: async route => { await gate; await route.continue() } })
  await slow.getByText('正在加载专业数据…', { exact: true }).waitFor()
  await slow.locator('.run-log-line').first().waitFor()
  release()
  await slow.locator('.wave-field img').waitFor()
  await slow.reload()
  await slow.locator('.wave-field img').waitFor()
  await slow.close()
  assert.deepEqual(errors, [])
  console.log('PASS: slow metrics do not block summary/logs; refresh restores; no runtime errors')

  const regression = await browser.newPage()
  regression.on('pageerror', e => errors.push(e.message))
  for (const [domain, prefix] of [['geodynamics', 'GEO'], ['llm', 'LLM'], ['automotive', 'AUTO'], ['uav', 'UAV'], ['drug', 'DRUG'], ['dft', 'DFT']]) {
    for (const suffix of ['0001', '0010']) {
      await regression.goto(`${base}/domains/${domain}/runs/${prefix}-20260811-${suffix}`)
      await regression.locator('.run-log-line').first().waitFor()
      assert.equal(await regression.locator('.run-record-id').innerText(), `${prefix}-20260811-${suffix}`)
      await regression.locator('#scenario-workspace-title').waitFor()
    }
  }
  await regression.close()
  assert.deepEqual(errors, [])
  console.log('PASS: all 12 representative run pages retain summary/logs and scenario routing')
} finally { await browser.close() }
