import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExperienceStore } from '../../backend/experience-store.js'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = fileURLToPath(new URL('../../', import.meta.url))
const runtimeDir = mkdtempSync(resolve(tmpdir(), 'topic5-geo-browser-'))
const output = resolve(root, '.runtime-logs')
mkdirSync(output, { recursive: true })
let time = Date.parse('2026-11-24T02:00:00Z')
const store = createExperienceStore({ dataDir: resolve(root, 'mock-data'), runtimeDir, now: () => time })
store.read(['geodynamics', 'runs'])
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.setDefaultTimeout(20000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let submitted
  // Exercise the real store in an isolated directory; user runs are never changed.
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean).slice(2)
    if (parts[0] !== 'geodynamics') {
      if (request.method() === 'GET') return route.fallback()
      return route.abort()
    }
    const response = request.method() === 'GET'
      ? store.read(parts)
      : store.write(request.method(), parts, request.postDataJSON())
    if (!response) return request.method() === 'GET' ? route.fallback() : route.abort()
    if (request.method() === 'POST' && parts.at(-1) === 'submit') submitted = response.data
    return route.fulfill({ status: response.code, json: response })
  })
  for (const [scenario, fixed, optional] of [
    ['wave-propagation', 'supg', 'uzawa'], ['tectonic-evolution', 'uzawa', 'supg'],
  ]) {
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/domains/geodynamics/scenarios?scenario=${scenario}&step=operator`)
    const panel = page.locator('.operator-panel')
    await panel.waitFor()
    await page.waitForFunction(() => !document.querySelector('.experience-flow')?.hasAttribute('inert'))
    const fixedButton = panel.locator(`[data-selection-id="${fixed}"] .operator-select-button`)
    assert.equal(await fixedButton.isDisabled(), true)
    assert.equal(await fixedButton.getAttribute('aria-pressed'), 'true')
    assert.equal(await panel.locator('[data-operator-class="fixed"]').count(), 1)
    assert.equal(await panel.locator('[data-operator-class="optional"]').count(), 3)
    assert.equal(await panel.locator('[data-entity-id]').count(), 0)
    await panel.locator(`[data-selection-id="${optional}"] .operator-select-button`).click()
    await panel.getByRole('button', { name: '清空可选算子', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.operator-panel .selected-chip').length === 1)
    assert.equal(await panel.locator('.selected-chip').count(), 1)
    assert.equal(await fixedButton.getAttribute('aria-pressed'), 'true')
    await panel.getByRole('button', { name: '可选算子类 3', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('.operator-item[data-operator-class="fixed"]'))
    assert.equal(await panel.locator('.operator-item').count(), 3)
    await panel.getByRole('button', { name: '全部类型', exact: true }).click()
    await fixedButton.waitFor()
    for (const id of [optional, 'citcoms-global', 'citcoms-regional']) {
      await panel.locator(`[data-selection-id="${id}"] .operator-select-button`).click()
    }
    await panel.screenshot({ path: resolve(output, `geodynamics-${scenario}-operators.png`) })
    const queuedAt = time
    await page.getByRole('button', { name: '提交并编排', exact: true }).click()
    await page.locator('.exp-workflow').waitFor()
    assert.equal(submitted.selected_operator_ids.length, 4)
    assert.equal(await page.locator('.exp-internal-entities').count(), 0)
    await page.locator('.dag-flow:not(.is-layout-pending) .vue-flow__node').first().waitFor()
    assert.equal(await page.locator('.vue-flow__node').count(), 12)
    assert.equal(await page.locator('.workflow-node-kind').filter({ hasText: '内置实体' }).count(), 8)
    const runtime = submitted.workflow.nodes.find(node => node.id === 'runtime')
    time = queuedAt + 5000 + runtime.planned_seconds * 500
    await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="runtime"] .workflow-node-meta')?.textContent.includes('运行中 · 50%'))
    assert.match(await page.locator('.vue-flow__node[data-id="runtime"]').innerText(), /内置实体/)
    assert.match(await page.locator('.vue-flow__node').filter({ hasText: fixed === 'supg' ? 'SUPG稳定化' : 'Uzawa鞍点' }).innerText(), /固定算子/)
    const before = await page.locator('.vue-flow__viewport').getAttribute('style')
    const archive = submitted.workflow.nodes.find(node => node.id === 'post')
    time = queuedAt + 5000 + (archive.planned_start_seconds + archive.planned_seconds / 2) * 1000
    await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="post"] .workflow-node-meta')?.textContent.includes('运行中 · 50%'))
    assert.equal(await page.locator('.vue-flow__viewport').getAttribute('style'), before, 'polling keeps the viewport stable')
    assert.equal(store.read(['geodynamics', 'runs', submitted.run_id]).data.has_result, false)
    await page.getByRole('button', { name: '适应工作流视图' }).click()
    await page.waitForTimeout(350)
    await page.locator('.experience-step-content').screenshot({ path: resolve(output, `geodynamics-${scenario}-workflow.png`) })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(350)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.getByRole('button', { name: '适应工作流视图' }).click()
    await page.waitForTimeout(350)
    await page.locator('.exp-workflow').screenshot({ path: resolve(output, `geodynamics-${scenario}-mobile.png`) })
    await page.setViewportSize({ width: 1440, height: 1100 })
    time = queuedAt + 5000 + submitted.planned_seconds * 1000
    await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="post"] .workflow-node-meta')?.textContent.includes('已完成 · 100%'))
    assert.equal(store.read(['geodynamics', 'runs', submitted.run_id]).data.has_result, true)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: both geodynamics scenarios, fixed/optional selection, real isolated submissions, internal progress inside DAG only, stable DAG, archive result gating and mobile layout')
} finally {
  await browser.close()
  assert.ok(resolve(runtimeDir).startsWith(resolve(tmpdir()) + sep))
  rmSync(runtimeDir, { recursive: true, force: true })
}
