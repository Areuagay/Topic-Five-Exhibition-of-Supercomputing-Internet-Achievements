import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('global shell is content-only and ready to embed in SCNet', async () => {
  const [layout, css] = await Promise.all([
    read('../layouts/default.vue'),
    read('../assets/css/main.css'),
  ])

  assert.match(layout, /class="embedded-shell"/)
  assert.match(layout, /class="layout-content"/)
  assert.doesNotMatch(layout, /<AppHeader/)
  assert.doesNotMatch(layout, /app-footer/)
  assert.match(css, /--scnet-bg:\s*#f4f6f9/)
  assert.match(css, /--scnet-primary:\s*#2563eb/)
  assert.match(css, /--scnet-radius:\s*8px/)
})

test('application landing is a direct six-domain hub without redundant filters', async () => {
  const page = await read('../pages/index.vue')

  assert.match(page, /class="application-overview"/)
  assert.match(page, /class="application-overview-icon"/)
  assert.match(page, /class="application-card-grid"/)
  assert.match(page, /class="application-card"/)
  assert.match(page, /v-for="domain in domains"/)
  assert.doesNotMatch(page, /application-category-rail/)
  assert.doesNotMatch(page, /placeholder="搜索应用名称或描述"/)
  assert.doesNotMatch(page, /selectedDomain/)
  assert.doesNotMatch(page, /Mock 模拟数据/)
})

test('each application domain is one large entry into its integrated result surface', async () => {
  const page = await read('../pages/index.vue')
  const cardRegion = page.slice(
    page.indexOf('<div v-if="domains.length" class="application-card-grid">'),
    page.indexOf('<el-empty v-else'),
  )

  assert.match(
    cardRegion,
    /<NuxtLink[\s\S]*v-for="domain in domains"[\s\S]*class="application-card"[\s\S]*:to="`\/domains\/\$\{domain\.domain\}\/scenarios`"/,
  )
  assert.match(
    cardRegion,
    /<footer class="application-card-entry">\s*<span>进入应用成果<\/span>\s*<span aria-hidden="true">→<\/span>\s*<\/footer>/s,
  )
  assert.doesNotMatch(cardRegion, /\/runs|查看应用场景|secondary-link|<small/)
  assert.match(page, /\.application-card:focus-visible\s*\{[^}]*outline:\s*2px solid/s)
})

test('application cards keep a white interior with a soft blue perimeter hover', async () => {
  const page = await read('../pages/index.vue')

  assert.match(page, /\.application-card:hover,\s*\.application-card:focus-visible/)
  assert.match(page, /border-radius:\s*10px/)
  assert.match(
    page,
    /\.application-card:hover,\s*\.application-card:focus-visible\s*\{[^}]*background:\s*#fff/s,
  )
  assert.match(page, /border-color:\s*var\(--scnet-primary\)/)
  assert.match(page, /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/)
  assert.match(page, /\.application-card:hover \.application-code/)
  assert.match(
    page,
    /\.application-card:hover \.application-code,[^}]*background:\s*var\(--scnet-primary\);[^}]*color:\s*#fff/s,
  )
  assert.match(page, /@media \(prefers-reduced-motion:\s*reduce\)/)
})

test('overview and temporary card icons stay subordinate to their titles', async () => {
  const page = await read('../pages/index.vue')

  assert.match(page, /\.application-overview-main\s*\{[^}]*align-items:\s*center/s)
  assert.match(page, /\.application-overview-icon\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s)
  assert.match(page, /\.application-overview-icon svg\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px/s)
  assert.match(page, /\.application-overview h2\s*\{[^}]*font-size:\s*17px;[^}]*line-height:\s*22px/s)
  assert.match(page, /\.application-overview-main p\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*20px/s)
  assert.match(page, /\.application-code\s*\{[^}]*min-width:\s*44px;[^}]*height:\s*44px/s)
})

test('homepage removes redundant microcopy and promotes the remaining headings', async () => {
  const page = await read('../pages/index.vue')

  assert.doesNotMatch(page, /platform-eyebrow|cluster-board-eyebrow/)
  assert.doesNotMatch(page, /class="multicenter-description"/)
  assert.doesNotMatch(page, /\{\{ domain\.category \}\}/)
  assert.doesNotMatch(page, /四中心资源状态、函数部署矩阵、跨中心调用链路、工作负载扩缩容与迁移。/)
  assert.match(page, /\.application-card-title h3\s*\{[^}]*font-size:\s*19px/s)
  assert.match(page, /\.platform-section-heading h2\s*\{[^}]*font-size:\s*18px/s)
  assert.match(page, /\.multicenter-card h3\s*\{[^}]*font-size:\s*18px/s)
  assert.match(page, /\.cluster-board-head h3\s*\{[^}]*font-size:\s*17px/s)
})

test('application hub separates domain entries from platform capability and cluster health', async () => {
  const page = await read('../pages/index.vue')

  assert.match(page, /class="platform-section"/)
  assert.match(page, /class="multicenter-card"/)
  assert.match(page, /to="\/multicenter"/)
  assert.match(page, /class="cluster-status-grid"/)
  assert.match(page, /v-for="cluster in clusters"/)
  assert.match(page, /CPU 利用率/)
  assert.match(page, /内存利用率/)
  assert.doesNotMatch(page, /跨中心大规模解算云原生应用成果/)
  assert.doesNotMatch(page, /选择一个领域查看场景与运行成果/)
})

test('multicenter capability is one large keyboard-accessible entry', async () => {
  const page = await read('../pages/index.vue')
  const multicenterRegion = page.slice(
    page.indexOf('<div class="platform-console">'),
    page.indexOf('<section class="cluster-board">'),
  )

  assert.match(
    multicenterRegion,
    /<NuxtLink[\s\S]*v-if="multicenter"[\s\S]*to="\/multicenter"[\s\S]*class="multicenter-card"[\s\S]*aria-label="进入函数多中心联调"/,
  )
  assert.match(
    multicenterRegion,
    /<footer class="multicenter-link">\s*进入联调视图\s*<span aria-hidden="true">→<\/span>\s*<\/footer>/s,
  )
  assert.equal(multicenterRegion.match(/<NuxtLink\b/g)?.length, 1)
  assert.match(page, /\.multicenter-card:focus-visible\s*\{[^}]*outline:\s*2px solid/s)
})

test('multicenter capability and cluster health share one integrated control surface', async () => {
  const page = await read('../pages/index.vue')

  assert.match(page, /class="platform-console"/)
  assert.match(page, /class="cluster-board"/)
  assert.match(page, /class="cluster-board-head"/)
  assert.match(page, /onlineClusterCount/)
  assert.match(page, /degradedClusterCount/)
  assert.match(page, /排队/)
  assert.match(page, /status-offline/)
  assert.match(
    page,
    /\.platform-console\s*\{[^}]*overflow:\s*hidden;[^}]*border:\s*1px solid var\(--scnet-border\)/s,
  )
  assert.match(
    page,
    /\.cluster-status-grid\s*\{[^}]*gap:\s*1px;[^}]*background:\s*var\(--scnet-divider\)/s,
  )
  assert.doesNotMatch(page, /\.cluster-status-card\s*\{[^}]*border:\s*1px solid/s)
})

test('degraded cluster hover uses a restrained amber state without an unexplained connector dot', async () => {
  const page = await read('../pages/index.vue')

  assert.match(page, /'is-degraded':\s*cluster\.status === 'degraded'/)
  assert.match(
    page,
    /\.cluster-status-card\.is-degraded:hover\s*\{[^}]*background:\s*#fff9f0;[^}]*box-shadow:\s*inset 0 0 0 1px rgba\(217,\s*140,\s*40,\s*0\.24\)/s,
  )
  assert.match(
    page,
    /\.multicenter-card\s*\{[^}]*box-shadow:\s*inset -16px 0 22px -26px rgba\(11,\s*91,\s*211,\s*0\.28\)/s,
  )
  assert.doesNotMatch(page, /\.cluster-board\s*\{[^}]*box-shadow:/s)
  assert.doesNotMatch(page, /\.multicenter-card::after/)
})
