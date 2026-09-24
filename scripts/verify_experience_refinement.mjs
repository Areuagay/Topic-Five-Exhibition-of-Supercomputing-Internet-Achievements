import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000'
const path = '/domains/geodynamics/scenarios?scenario=wave-propagation'
const api = '/api/v1/geodynamics'
const errors = []
mkdirSync('.runtime-logs', { recursive: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', e => errors.push(e.message))
const envelope = data => JSON.stringify({ code: 200, message: 'ok', data })
async function submitFromOperator(choice = '仍然创建') {
 await page.locator('.experience-next').click()
 const dialog = page.getByRole('dialog')
 await Promise.race([dialog.waitFor(), page.locator('.operator-submit-panel').waitFor(), page.locator('.vue-flow__node').first().waitFor()])
 if (await dialog.isVisible()) await dialog.getByRole('button', { name: choice, exact: true }).click()
}
try {
 const runs = (await (await page.request.get(base + api + '/runs')).json()).data
 const template = runs.find(r => r.origin === 'runtime' && r.scenario_id === 'wave-propagation')
 assert.ok(template, 'existing task for read-only review')
 const workflow = (await (await page.request.get(base + api + '/runs/' + template.run_id + '/workflow')).json()).data
 let accepted = false, offline = true, posts = 0, submittedIds = [], rejectSubmission = true
 const id = 'REVIEW-SYNC-ONLY'
 // Intercept all writes: this check never creates a task or modifies uploaded data.
 await page.route('**/operators/submit', async route => {
   if (rejectSubmission) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: '请选择有效且可用的算子' }) })
   posts++; submittedIds = route.request().postDataJSON().operator_ids; accepted = true
   await route.fulfill({ status: 200, contentType: 'application/json', body: envelope({ run_id: id, workflow, progress: 0, selected_operator_ids: submittedIds }) })
 })
 await page.route('**/geodynamics/runs', async route => {
   if (!accepted) return route.continue()
   if (offline) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary read outage' }) })
   return route.fulfill({ status: 200, contentType: 'application/json', body: envelope([{ ...template, run_id: id, selected_operator_ids: submittedIds }, ...runs]) })
 })
 await page.route('**/runs/REVIEW-SYNC-ONLY/workflow', route => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(workflow) }))
 await page.goto(base + path + '&step=operator')
 await page.locator('.experience-flow:not([inert])').waitFor()
 await page.getByRole('button', { name: /采用场景推荐/ }).click()
 await submitFromOperator()
 await page.getByText('请选择有效且可用的算子', { exact: true }).waitFor()
 assert.equal(await page.locator('.experience-next').isDisabled(), false, 'rejected POST permits correction/retry')
 rejectSubmission = false
 await submitFromOperator()
 await page.getByText('任务已创建，正在同步运行状态…', { exact: true }).waitFor()
 await page.waitForTimeout(2200)
 assert.equal(await page.getByText('算子提交失败，请稍后重试', { exact: true }).count(), 0)
 assert.equal(await page.locator('.experience-next').isDisabled(), true)
 assert.equal(await page.getByRole('button', { name: '清空选择', exact: true }).isDisabled(), true)
 assert.equal(posts, 1)
 offline = false
 await page.locator('.vue-flow__node').first().waitFor({ timeout: 12000 })
 assert.equal(new URL(page.url()).searchParams.get('plan'), id)
 assert.equal(posts, 1, 'GET recovery must never repeat POST')
 console.log('PASS accepted POST + failed GET, disabled duplicate submit, automatic recovery')
 await page.locator('.experience-previous').click()
 await page.locator('.operator-panel').waitFor()
 assert.equal(await page.locator('.experience-next').innerText(), '提交并编排')
 await submitFromOperator('查看已有任务')
 await page.locator('.vue-flow__node').first().waitFor()
 assert.equal(posts, 1, 'returning from step 4 to step 3 with unchanged operators must reuse the submitted task')
 assert.equal(new URL(page.url()).searchParams.get('run'), id)
 console.log('PASS step 4 -> step 3 -> continue reuses the original task without POST')
 await page.locator('.experience-step').filter({ hasText: '执行监控' }).click()
 await page.locator('.exp-monitor').waitFor(); await page.waitForTimeout(300)
 assert.equal(await page.locator('.exp-monitor .el-table__row').count(), 8)
 assert.equal(await page.getByText('当前任务', { exact: true }).count(), 1)
 assert.equal(await page.getByText('本次运行', { exact: true }).count(), 0)
 assert.equal(await page.locator('.exp-status-item').count(), 5)
 const firstId = await page.locator('.run-identity').first().innerText()
 await page.getByRole('button', { name: '下一页运行记录' }).click()
 assert.notEqual(await page.locator('.run-identity').first().innerText(), firstId)
 await page.waitForTimeout(1600)
 assert.match(await page.locator('.monitor-pagination nav').innerText(), /2 \/ /, 'poll must not reset the page')
 await page.locator('.exp-monitor .el-table__row').first().click()
 const selection = new URL(page.url()).searchParams.get('run')
 await page.locator('.experience-next').click()
 await page.locator('.experience-step.is-active').filter({ hasText: '结果展示' }).waitFor()
 assert.equal(new URL(page.url()).searchParams.get('run'), selection)
 await page.locator('.experience-previous').click()
 await page.locator('.exp-monitor').waitFor()
 assert.match(await page.locator('.monitor-pagination nav').innerText(), /2 \/ /)
 await page.getByRole('button', { name: '上一页运行记录' }).click()
 await page.screenshot({ path: '.runtime-logs/refined-monitor.png', fullPage: true })
 // A historical row may be selected; continuing the current plan must use its
 // submitted ID, not whichever historical result was last inspected.
 await page.locator('.experience-step').filter({ hasText: '算子选择' }).click()
 await page.locator('.operator-panel').waitFor()
 await submitFromOperator('查看已有任务')
 await page.locator('.vue-flow__node').first().waitFor()
 assert.equal(new URL(page.url()).searchParams.get('run'), id)
 assert.equal(posts, 1)
 console.log('PASS pagination, current/history labels, polling stability, selected-result navigation')
 await page.locator('.experience-step').filter({ hasText: '数据准备' }).click()
 await page.locator('.exp-dataprep').waitFor(); await page.waitForTimeout(350)
 const frames = await page.evaluate(async () => {
   const samples = []; const start = performance.now()
   ;[...document.querySelectorAll('.experience-step')].find(el => el.textContent.includes('算子选择')).click()
   while (performance.now() - start < 400) {
     const body = document.querySelector('.experience-body')
     const panels = [...document.querySelector('.experience-step-content').children]
     samples.push({ height: body.getBoundingClientRect().height, visible: panels.filter(el => Number(getComputedStyle(el).opacity) > .05).length })
     await new Promise(requestAnimationFrame)
   }
   return samples
 })
 assert.ok(frames.every(f => f.height > 200), 'working area never collapses')
 assert.ok(frames.every(f => f.visible <= 1), 'old/new text never overlaps')
 for (const title of ['资源调度', '数据准备', '算子选择', '数据准备', '算子选择']) {
   await page.locator('.experience-step').filter({ hasText: title }).evaluate(el => el.click())
   await page.waitForTimeout(40)
 }
 await page.waitForTimeout(450)
 assert.equal(await page.locator('.experience-step-content > *').count(), 1)
 assert.equal(await page.locator('.operator-panel').getAttribute('inert'), null)
 await page.screenshot({ path: '.runtime-logs/refined-operator.png', fullPage: true })
 console.log('PASS sequential transition, preserved working area, rapid step switching')
 await page.locator('.experience-step').filter({ hasText: '数据准备' }).click()
 await page.locator('.exp-dataprep').waitFor(); await page.waitForTimeout(350)
 await page.screenshot({ path: '.runtime-logs/refined-data.png', fullPage: true })
 await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300)
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
 const cells = await page.locator('.dataset-table td').evaluateAll(els => els.map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })))
 assert.ok(cells.every(c => c.left >= 0 && c.right <= 391), 'all dataset fields fit without pinned-column obstruction')
 await page.screenshot({ path: '.runtime-logs/refined-data-mobile.png', fullPage: true })
 await page.emulateMedia({ reducedMotion: 'reduce' })
 await page.locator('.experience-step').filter({ hasText: '算子选择' }).click()
 await page.locator('.operator-panel').waitFor()
 await page.locator('.operator-detail-trigger').first().click()
 const popover = page.locator('.operator-runtime-popover:visible'); await popover.waitFor()
 const rect = await popover.boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= 391)
 await popover.getByRole('button', { name: '关闭运行详情' }).click()
 await page.locator('.operator-select-button[aria-pressed=true]').first().click()
 assert.equal(await page.locator('.experience-next').innerText(), '提交并编排')
 assert.equal(await page.locator('.experience-step').filter({ hasText: '流程编排' }).isDisabled(), true)
 await submitFromOperator()
 await page.locator('.vue-flow__node').first().waitFor()
 assert.equal(posts, 2, 'changed selection must still submit')
 assert.ok(submittedIds.length > 0)
 console.log('PASS original-plan navigation after browsing history; changed selection submits normally')
 assert.deepEqual(errors, [])
 console.log('PASS mobile dataset fields, reduced motion, popover and no page errors')
} finally { await browser.close() }
