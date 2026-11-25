import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.FRONTEND_URL || 'http://localhost:3000'
const output = resolve(import.meta.dirname, '../../.runtime-data/logs')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto(`${base}/domains/uav/scenarios?scenario=path-planning&step=operator`)
  await page.locator('.operator-panel').waitFor()
  const actions = await page.locator('.experience-guide-actions').boundingBox()
  const summary = await page.locator('.experience-guide-summary').boundingBox()
  assert.equal(await page.locator('.experience-guide-hint').count(), 0, 'guidance uses the existing summary, with no extra row')
  assert.ok(summary.x + summary.width <= actions.x && summary.y < actions.y + actions.height, 'guidance stays beside the buttons')
  const previous = await page.locator('.experience-previous').boundingBox()
  const next = await page.locator('.experience-next').boundingBox()
  assert.ok(previous.x < next.x && Math.abs(previous.y - next.y) < 1, 'buttons retain their row and order')
  console.log('Guide geometry:', JSON.stringify({ actions, summary }))
  await page.locator('.experience-guide').screenshot({ path: resolve(output, 'guide-after.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.locator('.experience-guide').screenshot({ path: resolve(output, 'guide-mobile.png') })
  await page.setViewportSize({ width: 1600, height: 1000 })
  const buttonGeometry = () => page.locator('.experience-guide-actions').evaluate(el => {
    const rect = el.getBoundingClientRect()
    const guide = el.closest('.experience-guide').getBoundingClientRect()
    return { x: rect.x - guide.x, y: rect.y - guide.y, width: rect.width, height: rect.height }
  })
  const beforeChoice = await buttonGeometry()
  await page.getByRole('button', { name: '采用场景推荐', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.experience-guide-summary')?.textContent.includes('已选'))
  const afterChoice = await buttonGeometry()
  console.log('Selection geometry:', JSON.stringify({ beforeChoice, afterChoice }))
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(beforeChoice[key] - afterChoice[key]) < 1, `selection must not move buttons: ${key}`)
  await page.locator('.experience-guide').screenshot({ path: resolve(output, 'guide-selected.png') })
  assert.equal(await page.getByRole('button', { name: '提交并编排', exact: true }).isEnabled(), true)

  for (const [domain, scenario, count] of [['automotive', 'vehicle-crash', 4], ['uav', 'path-planning', 2]]) {
    const videos = (await (await page.request.get(`${base}/api/v1/${domain}/scenarios/${scenario}/videos`)).json()).data
    assert.equal(videos.length, count)
    assert.ok(videos.every(item => item.available))
    const runs = (await (await page.request.get(`${base}/api/v1/${domain}/runs`)).json()).data
    const run = runs.find(item => item.scenario_id === scenario && item.has_detail && item.status === 'success')
    assert.ok(run, `${domain} has a completed example`)
    await page.goto(`${base}/domains/${domain}/runs/${run.run_id}`)
    await page.locator('.scenario-videos-choices button').first().waitFor()
    assert.equal(await page.locator('.scenario-videos-choices button').count(), count)
    const order = await page.locator('.scenario-videos').evaluate(el => ({ before: el.previousElementSibling?.className, after: el.nextElementSibling?.className }))
    assert.equal(order.before, 'run-workflow-panel')
    assert.equal(order.after, 'run-data-panel')
    for (const video of videos) {
      const oldPlayer = await page.locator('.scenario-video-stage video').elementHandle()
      await page.getByRole('button', { name: new RegExp(video.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
      if (oldPlayer) { assert.equal(await oldPlayer.evaluate(el => el.paused), true); await oldPlayer.dispose() }
      await page.waitForFunction(() => document.querySelector('.scenario-video-stage video')?.readyState >= 1)
      assert.equal(await page.locator('.scenario-video-stage video').count(), 1)
      const player = page.locator('.scenario-video-stage video')
      const duration = await player.evaluate(el => el.duration)
      assert.ok(Math.abs(duration - video.duration_seconds) < 1)
      await player.evaluate(async el => { el.muted = true; await el.play() })
      await page.waitForFunction(() => document.querySelector('.scenario-video-stage video')?.currentTime > 0)
      await player.evaluate(el => { el.pause(); el.currentTime = el.duration / 2 })
      await page.waitForFunction(() => { const el = document.querySelector('.scenario-video-stage video'); return el && !el.seeking && Math.abs(el.currentTime - el.duration / 2) < 1 })
      const range = await page.request.get(`${base}${video.video_url}`, { headers: { Range: 'bytes=0-511' } })
      assert.equal(range.status(), 206)
      assert.equal((await range.body()).length, 512)
      console.log(`PASS ${video.id}: playback, duration, seek, proxy range`)
    }
    await page.locator('.scenario-videos').screenshot({ path: resolve(output, `${domain}-videos.png`) })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.locator('.scenario-videos').screenshot({ path: resolve(output, `${domain}-videos-mobile.png`) })
    await page.setViewportSize({ width: 1600, height: 1000 })
  }
  // A failed recording can be retried, without removing the scenario results.
  const broken = '**/api/v1/scenario-videos/uav-visual-avoidance/content'
  await page.route(broken, route => route.fulfill({ status: 404, body: 'missing' }))
  await page.getByRole('button', { name: /RGB \/ 深度视觉避障/ }).click()
  await page.locator('.scenario-video-failure').waitFor()
  await page.unroute(broken)
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.scenario-video-stage video')?.readyState >= 1)
  const oldPlayer = await page.locator('.scenario-video-stage video').elementHandle()
  await oldPlayer.evaluate(async el => { el.muted = true; await el.play() })
  await page.getByRole('link', { name: '返回运行记录', exact: true }).click()
  await page.locator('.scenario-videos').waitFor({ state: 'detached' })
  assert.equal(await oldPlayer.evaluate(el => el.paused), true)
  await oldPlayer.dispose()

  await page.goto(`${base}/domains/uav/runs/UAV-20260811-0001`)
  await page.locator('.run-data-panel').waitFor()
  await page.waitForFunction(() => !document.querySelector('.scenario-videos'))
  assert.deepEqual(errors, [])
  console.log('PASS desktop/mobile layout, retry, departure pause, and no unrelated scene videos')
} finally { await browser.close() }
