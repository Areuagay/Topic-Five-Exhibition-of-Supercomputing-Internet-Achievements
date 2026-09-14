import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
const out = process.env.SCREENSHOT_DIR || '../.runtime-logs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/domains/uav/runs/UAV-20260811-0001`)
  const swarm = page.locator('.swarm-workspace')
  await swarm.locator('.flight-path').first().waitFor()
  assert.equal(await swarm.locator('.flight-path').count(), 40)
  assert.equal(await swarm.locator('canvas').count(), 2)
  await page.getByLabel('查看无人机').selectOption('UAV-007')
  assert.match(await swarm.locator('.current-position').innerText(), /采样时间 0/)
  const before = await swarm.locator('.flight-path').first().getAttribute('d')
  await swarm.getByRole('button', { name: '侧视 X–Z' }).click()
  assert.notEqual(await swarm.locator('.flight-path').first().getAttribute('d'), before)
  await swarm.getByRole('button', { name: '播放', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('#swarm-time').value) > 1)
  await swarm.getByRole('button', { name: '暂停', exact: true }).click()
  await page.locator('#swarm-time').fill('10')
  assert.match(await swarm.locator('.current-position').innerText(), /17\.391/)
  await swarm.getByRole('button', { name: /步 22/ }).click()
  assert.match(await swarm.locator('svg').textContent(), /碰撞 · 步 22/)
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: 1080 })
    await swarm.screenshot({ path: `${out}/swarm-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.goto(`${base}/domains/uav/runs/UAV-20260811-0010`)
  const planning = page.locator('.planning-workspace')
  await planning.locator('.obstacle').first().waitFor()
  assert.equal(await planning.locator('rect.obstacle').count(), 5)
  assert.equal(await planning.locator('circle.obstacle').count(), 3)
  assert.equal(await planning.locator('.flight-path').count(), 1)
  assert.equal(await planning.locator('canvas').count(), 1)
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: 1080 })
    await planning.screenshot({ path: `${out}/planning-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  const height = await planning.boundingBox()
  await planning.getByRole('button', { name: '原始结果图', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.planning-workspace img')?.naturalWidth > 0)
  assert.equal((await planning.boundingBox()).height, height.height)
  // Missing geometry must not remove the independent cost chart; supplied units appear.
  await page.route('**/UAV-20260811-0010/metrics', async route => {
    const response = await route.fetch(); const body = await response.json()
    delete body.data.domain_data.environment
    delete body.data.domain_data.best_path
    body.data.domain_data.units = { best_cost: 'J' }
    await route.fulfill({ json: body })
  })
  await page.reload()
  await planning.getByText('暂无航迹与环境数据', { exact: true }).waitFor()
  assert.equal(await planning.locator('canvas').count(), 1)
  assert.match(await planning.locator('dl').innerText(), /最终最优代价（J）|最终最优代价 \(J\)/)
  // Preview error is local and leaves metrics available.
  await page.route('**/ART-UAV-PIMG1/preview', route => route.fulfill({ status: 404, body: '' }))
  await planning.getByRole('button', { name: '原始结果图', exact: true }).click()
  await planning.getByText('暂时无法预览此文件', { exact: true }).waitFor()
  assert.equal(await planning.locator('canvas').count(), 1)
  // Missing trajectory and event fields differ from an explicitly empty events list.
  await page.route('**/UAV-20260811-0001/metrics', async route => {
    const response = await route.fetch(); const body = await response.json()
    delete body.data.domain_data.trajectory_samples
    delete body.data.domain_data.collision_events
    await route.fulfill({ json: body })
  })
  await page.goto(`${base}/domains/uav/runs/UAV-20260811-0001`)
  await swarm.getByText('暂无轨迹数据', { exact: true }).waitFor()
  await swarm.getByText('暂无碰撞事件数据', { exact: true }).waitFor()
  assert.equal(await swarm.locator('canvas').count(), 2)
  assert.deepEqual(errors, [])
  console.log('PASS: swarm projection/playback/selection/events, path geometries/preview, conditional units, missing blocks, 1920/1366 layouts')
} finally { await browser.close() }
