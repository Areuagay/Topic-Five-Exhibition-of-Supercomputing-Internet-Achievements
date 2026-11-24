import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExperienceStore } from '../../backend/experience-store.js'
import { DOMAIN_WORKFLOW_TEMPLATES } from '../../backend/domain-workflows.js'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = fileURLToPath(new URL('../../', import.meta.url))
const runtimeDir = mkdtempSync(resolve(tmpdir(), 'topic5-domain-browser-'))
const output = resolve(root, '.runtime-logs')
mkdirSync(output, { recursive: true })
let time = Date.parse('2026-11-24T04:00:00Z')
const store = createExperienceStore({ dataDir: resolve(root, 'mock-data'), runtimeDir, now: () => time })
const domains = new Set(Object.values(DOMAIN_WORKFLOW_TEMPLATES).map(template => template.domain))
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let submitted
  // Submissions exercise the real store in a temporary directory only.
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean).slice(2)
    if (!domains.has(parts[0])) return request.method() === 'GET' ? route.fallback() : route.abort()
    const response = request.method() === 'GET' ? store.read(parts) : store.write(request.method(), parts, request.postDataJSON())
    if (!response) return request.method() === 'GET' ? route.fallback() : route.abort()
    if (request.method() === 'POST' && parts.at(-1) === 'submit') submitted = response.data
    return route.fulfill({ status: response.code, json: response })
  })
  for (const [scenario, template] of Object.entries(DOMAIN_WORKFLOW_TEMPLATES)) {
    const details = JSON.parse(readFileSync(resolve(root, 'mock-data', template.domain, 'scenario-details.json'), 'utf8')).data
    const recommended = Object.values(details).find(item => item.id === scenario).operators
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/domains/${template.domain}/scenarios?scenario=${scenario}&step=operator`)
    await page.locator('.operator-panel').waitFor()
    await page.waitForFunction(() => !document.querySelector('.experience-flow')?.hasAttribute('inert'))
    await page.getByRole('button', { name: '采用场景推荐', exact: true }).click()
    await page.waitForFunction(count => document.querySelectorAll('.selected-chip').length === count, recommended.length)
    const queuedAt = time
    await page.getByRole('button', { name: '提交并编排', exact: true }).click()
    await page.locator('.exp-workflow').waitFor()
    await page.waitForFunction(count => document.querySelectorAll('.dag-flow:not(.is-layout-pending) .vue-flow__node').length === count, template.nodes.length + recommended.length)
    assert.equal(await page.locator('.exp-internal-entities').count(), 0, 'no separate entity panel')
    assert.equal(await page.locator('.workflow-node-kind').filter({ hasText: '内置实体' }).count(), template.nodes.length)
    assert.equal(await page.locator('.exp-chain-note').innerText(), template.summary)
    assert.ok(submitted.workflow.template_id === template.id)
    const first = submitted.workflow.nodes.find(node => node.id === 'prepare')
    time = queuedAt + 5000 + first.planned_seconds * 500
    await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="prepare"] .workflow-node-meta')?.textContent.includes('运行中 · 50%'))
    const geometry = await page.locator('.vue-flow__viewport').getAttribute('style')
    const archive = submitted.workflow.nodes.find(node => node.id === 'post')
    time = queuedAt + 5000 + (archive.planned_start_seconds + archive.planned_seconds / 2) * 1000
    await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="post"] .workflow-node-meta')?.textContent.includes('运行中 · 50%'))
    assert.equal(await page.locator('.vue-flow__viewport').getAttribute('style'), geometry)
    assert.equal(store.read([template.domain, 'runs', submitted.run_id]).data.has_result, false)
    await page.getByRole('button', { name: '适应工作流视图' }).click()
    await page.waitForTimeout(350)
    await page.locator('.exp-workflow').screenshot({ path: resolve(output, `${scenario}-fixed-workflow.png`) })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '适应工作流视图' }).click()
    await page.waitForTimeout(350)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.locator('.exp-workflow').screenshot({ path: resolve(output, `${scenario}-fixed-workflow-mobile.png`) })
    await page.setViewportSize({ width: 1440, height: 1100 })
    time = queuedAt + 5000 + submitted.planned_seconds * 1000
    await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="post"] .workflow-node-meta')?.textContent.includes('已完成 · 100%'))
    assert.equal(store.read([template.domain, 'runs', submitted.run_id]).data.has_result, true)
    console.log(`PASS ${scenario}: ${template.nodes.length} fixed entities + ${recommended.length} selected operators; progress, archive gating, desktop and mobile`)
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
  assert.ok(resolve(runtimeDir).startsWith(resolve(tmpdir()) + sep))
  rmSync(runtimeDir, { recursive: true, force: true })
}
