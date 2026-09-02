import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('run list uses the integrated scenario-page surface without breadcrumbs or nested cards', async () => {
  const page = await read('../pages/domains/[domain]/runs/index.vue')

  assert.match(page, /class="run-page"/)
  assert.match(page, /class="run-surface"/)
  assert.match(page, /<DomainSurfaceHeader/)
  assert.match(page, /<ScenarioSelector[\s\S]*runs-active/)
  assert.match(page, /class="run-workspace"/)
  assert.match(page, /<div class="run-workspace">/)
  assert.doesNotMatch(page, /<main class="run-workspace">/)
  assert.match(page, /class="run-record-panel"/)
  assert.match(page, /class="run-status-strip"/)
  assert.match(page, /class="run-status-heading"[\s\S]*<h2>运行记录<\/h2>/)
  assert.doesNotMatch(page, /class="run-title-group"[\s\S]*<p>运行记录<\/p>/)
  assert.match(page, /class="run-filter-bar"/)
  assert.match(page, /class="run-table-region"/)
  assert.doesNotMatch(page, /<el-breadcrumb/)
  assert.doesNotMatch(page, /<el-card/)
  assert.doesNotMatch(page, /class="stat-grid"/)
  assert.doesNotMatch(page, /class="run-result-summary"/)
})

test('run list navigation and filters are semantic, labeled, and keyboard-visible', async () => {
  const page = await read('../pages/domains/[domain]/runs/index.vue')

  assert.doesNotMatch(page, /class="run-header-nav"/)
  assert.doesNotMatch(page, /class="run-home-link"/)
  assert.doesNotMatch(page, /class="run-scenarios-link"/)
  assert.match(page, /:domain="domain"/)
  assert.match(page, /runs-active/)
  assert.match(page, /role="search"/)
  assert.match(page, /aria-label="搜索运行记录"/)
  assert.match(page, /aria-label="按状态筛选"/)
  assert.match(page, /aria-label="按场景筛选"/)
  assert.match(page, /role="status"/)
  assert.match(page, /aria-live="polite"/)
  assert.match(page, /<p[^>]+class="run-filter-result"[^>]+role="status"/)
  assert.match(page, /\.run-filter-result\s*\{[^}]*font-size:\s*14px/s)
  assert.match(page, /\.run-filter-result strong\s*\{[^}]*font-size:\s*18px/s)
  assert.doesNotMatch(page, /显示\s*<strong>[\s\S]*\/\s*\{\{\s*runs\?\.length/)
  assert.match(page, /\.run-status-heading h2\s*\{[^}]*font-size:\s*19px[^}]*font-weight:\s*650/s)
  assert.doesNotMatch(page, /按任务当前状态汇总|\.run-status-heading small\s*\{/)
  assert.doesNotMatch(page, /:subtitle=/)
  assert.match(page, /\.run-table-link:focus-visible/)
  assert.doesNotMatch(page, /🔍/)
})

test('run list keeps dense data readable and responsive without hiding columns', async () => {
  const page = await read('../pages/domains/[domain]/runs/index.vue')

  assert.match(page, /\.run-table-region\s*\{[^}]*overflow-x:\s*auto/s)
  assert.match(page, /\.run-workspace\s*\{[^}]*padding:\s*clamp\(/s)
  assert.match(page, /\.run-record-panel\s*\{[^}]*border:\s*1px solid var\(--scnet-divider\)[^}]*border-radius:\s*10px/s)
  assert.match(page, /\.run-table-region :deep\(\.el-table\)\s*\{[^}]*min-width:/s)
  assert.match(page, /\.run-table-link\s*\{[^}]*min-height:\s*44px/s)
  assert.match(page, /font-variant-numeric:\s*tabular-nums/)
  assert.match(page, /@media \(max-width:\s*760px\)/)
  assert.match(page, /\.run-status-item:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*1 \/ -1/s)
  assert.match(page, /@media \(prefers-reduced-motion:\s*reduce\)/)
  assert.doesNotMatch(page, /transition:\s*all/)
})

test('run rows use restrained status-aware hover feedback', async () => {
  const page = await read('../pages/domains/[domain]/runs/index.vue')

  assert.match(page, /function runRowClassName\(/)
  assert.match(page, /:row-class-name="runRowClassName"/)
  assert.match(page, /tr\.run-row-status-running:hover > td\.el-table__cell\)\s*\{[^}]*background:\s*#f2f6fc/s)
  assert.match(page, /tr\.run-row-status-success:hover > td\.el-table__cell\)\s*\{[^}]*background:\s*#f2f8f4/s)
  assert.match(page, /tr\.run-row-status-failed:hover > td\.el-table__cell\)\s*\{[^}]*background:\s*#fdf3f3/s)
  assert.match(page, /tr\.run-row-status-(?:queued|pending):hover > td\.el-table__cell\)\s*\{[^}]*background:\s*#faf6ef/s)
  assert.doesNotMatch(page, /transition:\s*all/)
})
