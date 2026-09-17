import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('scenario page selects and renders details without a second click', async () => {
  const page = await read('../pages/domains/[domain]/scenarios/index.vue')

  assert.match(page, /<ScenarioSelector/)
  assert.match(page, /<ScenarioDetailContent/)
  assert.match(page, /route\.query\.scenario/)
  assert.match(page, /router\.push/)
  assert.match(page, /getBenchmarks/)
  assert.match(page, /getParamsSchemas/)
  assert.match(page, /<DomainSurfaceHeader/)
  assert.match(page, /<ScenarioSelector[\s\S]*:domain="domain"/)
  assert.doesNotMatch(page, /scenario-card/)
  assert.doesNotMatch(page, />\s*查看详情\s*</s)
})

test('run history moves into the lower scenario navigation', async () => {
  const page = await read('../pages/domains/[domain]/scenarios/index.vue')
  const selector = await read('../components/ScenarioSelector.vue')

  assert.doesNotMatch(page, /class="scenario-header-nav"/)
  assert.doesNotMatch(page, /class="scenario-runs-link"/)
  assert.doesNotMatch(page, /totalRunCount|getRuns/)
  assert.match(selector, /class="scenario-selector-runs"/)
  assert.match(selector, /:to="`\/domains\/\$\{domain\}\/runs`"/)
  assert.match(selector, /运行记录/)
  assert.match(selector, /\.scenario-selector-runs\.is-active/)
  assert.doesNotMatch(page, /条记录/)
})

test('scenario page uses a title-only domain header at a readable size', async () => {
  const header = await read('../components/DomainSurfaceHeader.vue')
  const page = await read('../pages/domains/[domain]/scenarios/index.vue')

  assert.match(header, /\.domain-surface-title h1\s*\{[^}]*font-size:\s*24px/s)
  assert.doesNotMatch(header, /subtitle\?:|v-if="subtitle"|\{\{ subtitle \}\}/)
  assert.doesNotMatch(page, /:subtitle=/)
  assert.match(header, />主页<\/span>/)
  assert.doesNotMatch(header, /eyebrow|ORCHESTRATION|APPLICATION DEMO/i)
})

test('scenario selection falls back to the first real scenario and keeps URL state', async () => {
  const page = await read('../pages/domains/[domain]/scenarios/index.vue')

  assert.match(page, /scenarioList\.value\.some\(\(item\) => item\.id === requested\)/)
  assert.match(page, /scenarioList\.value\[0\]\?\.id/)
  assert.match(page, /const \{ step, run, \.\.\.query \} = route\.query/)
  assert.match(page, /query:\s*\{\s*\.\.\.query,\s*scenario:\s*id\s*\}/s)
  assert.doesNotMatch(page, /const selectedScenarioId = ref/)
})

test('scenario selector exposes active state and keyboard-safe buttons', async () => {
  const selector = await read('../components/ScenarioSelector.vue')

  assert.match(selector, /<nav[^>]+aria-label="应用场景与运行记录"/s)
  assert.doesNotMatch(selector, /scenario-selector-label/)
  assert.match(selector, /<button/)
  assert.match(selector, /type="button"/)
  assert.match(selector, /aria-current/)
  assert.match(selector, /:focus-visible/)
  assert.match(selector, /min-height:\s*46px/)
  assert.match(selector, /overflow-x:\s*auto/)
  assert.match(selector, /\.scenario-selector\s*\{[^}]*padding:\s*0 28px/s)
  assert.match(selector, /\.scenario-selector-option,[\s\S]*\.scenario-selector-runs\s*\{[^}]*padding:\s*0 22px[^}]*color:\s*#657287[^}]*font-size:\s*13px/s)
  assert.doesNotMatch(selector, /width:\s*100%/)
})

test('scenario selector uses the same gentle sliding motion as the primary tabs', async () => {
  const selector = await read('../components/ScenarioSelector.vue')

  assert.match(selector, /class="scenario-selector-indicator"/)
  assert.match(selector, /function updateIndicator\(/)
  assert.match(selector, /const indicatorReady = ref\(false\)/)
  assert.match(selector, /:class="\{ 'is-ready': indicatorReady \}"/)
  assert.match(selector, /\.scenario-selector-indicator\s*\{[^}]*height:\s*2px[^}]*background:\s*var\(--scnet-primary\)[^}]*transition:\s*none/s)
  assert.match(
    selector,
    /\.scenario-selector-indicator\.is-ready\s*\{[^}]*transition:[^}]*transform 300ms cubic-bezier\(0\.645, 0\.045, 0\.355, 1\)[^}]*width 300ms cubic-bezier\(0\.645, 0\.045, 0\.355, 1\)/s,
  )
  assert.match(selector, /\.scenario-selector-option\.is-active,[\s\S]*\.scenario-selector-runs\.is-active\s*\{[^}]*background:\s*transparent/s)
  assert.doesNotMatch(selector, /\.scenario-selector-option::after/)
})

test('scenario selector carries the underline origin across run and scenario routes', async () => {
  const selector = await read('../components/ScenarioSelector.vue')

  assert.match(selector, /useState<NavigationTransition \| null>/)
  assert.match(selector, /function rememberNavigationOrigin\(targetKey: string, event: MouseEvent\)/)
  assert.match(selector, /from:\s*currentNavigationKey\(\)/)
  assert.match(selector, /to:\s*targetKey/)
  assert.match(selector, /transition\?\.to === activeKey/)
  assert.match(selector, /updateIndicator\(originKey\)/)
  assert.match(selector, /requestAnimationFrame\(\(\) => \{\s*updateIndicator\(\)\s*\}\)/s)
  assert.match(selector, /new ResizeObserver\(\(\) => updateIndicator\(\)\)/)
  assert.match(selector, /@click="rememberNavigationOrigin\(scenario\.id, \$event\)"/)
  assert.match(selector, /@click="rememberNavigationOrigin\('__runs__', \$event\)"/)
})

test('integrated detail keeps every original result section without invented fields', async () => {
  const detail = await read('../components/ScenarioDetailContent.vue')

  for (const field of [
    'summary_metrics',
    'background',
    'method',
    'tech_stack',
    'architecture',
    'operators',
    'highlights',
    'supported_clusters',
  ]) {
    assert.match(detail, new RegExp(`detail\\.${field}`))
  }
  assert.match(detail, /benchmark/)
  assert.match(detail, /params/)
  assert.match(detail, /未找到该场景详情/)
  assert.doesNotMatch(detail, /fake|placeholderMetric|mockMetric/i)
})

test('integrated detail uses a restrained readable hierarchy and responsive sections', async () => {
  const detail = await read('../components/ScenarioDetailContent.vue')

  assert.match(detail, /\.scenario-result-title\s*\{[^}]*font-size:\s*clamp\(24px,/s)
  assert.match(detail, /\.scenario-result-description\s*\{[^}]*font-size:\s*17px/s)
  assert.match(detail, /<div class="scenario-section-heading">\s*<h3>背景与方法<\/h3>\s*<\/div>/s)
  assert.doesNotMatch(detail, /<p>0[1-7]<\/p>/)
  assert.match(detail, /\.scenario-section-heading\s*\{[^}]*align-self:\s*center[^}]*justify-self:\s*center[^}]*text-align:\s*center/s)
  assert.match(detail, /\.scenario-section-heading h3\s*\{[^}]*font-size:\s*20px/s)
  assert.doesNotMatch(detail, /\.scenario-section-heading p\s*\{/)
  assert.match(detail, /\.scenario-overview-grid h4\s*\{[^}]*font-size:\s*19px/s)
  assert.match(detail, /\.scenario-overview-grid p,[^}]*font-size:\s*16px/s)
  assert.match(detail, /\.scenario-summary-metrics dt\s*\{[^}]*font-size:\s*14px/s)
  assert.match(detail, /\.scenario-tech-stack-item\s*\{[^}]*font-size:\s*14px/s)
  assert.match(detail, /\.scenario-table-wrap :deep\(\.el-table\)\s*\{[^}]*font-size:\s*16px/s)
  assert.match(detail, /\.scenario-table-wrap :deep\(\.el-table th\.el-table__cell\)\s*\{[^}]*font-size:\s*16px/s)
  assert.match(detail, /\.scenario-table-wrap :deep\(\.el-table th\.mono\.el-table__cell\)\s*\{[^}]*font-family:\s*var\(--scnet-font-sans\)/s)
  assert.match(detail, /\.scenario-table-wrap :deep\(\.el-table td\.mono\.el-table__cell\)\s*\{[^}]*font-family:\s*var\(--scnet-font-mono\)[^}]*font-size:\s*15px/s)
  assert.match(detail, /\.scenario-architecture-list\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*overflow-x:\s*auto[^}]*background:\s*#f8fafc/s)
  assert.match(detail, /\.scenario-architecture-list li\s*\{[^}]*min-width:\s*max-content/s)
  assert.match(detail, /\.scenario-architecture-list li\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/s)
  assert.match(detail, /\.scenario-architecture-list li:not\(:last-child\)::after\s*\{[^}]*content:\s*'→'/s)
  assert.match(detail, /\.scenario-architecture-index\s*\{[^}]*width:\s*auto[^}]*height:\s*auto[^}]*border-radius:\s*4px/s)
  assert.match(detail, /\.scenario-architecture-list h4\s*\{[^}]*text-align:\s*left/s)
  assert.doesNotMatch(detail, /\.scenario-architecture-list li \+ li\s*\{[^}]*border-left/s)
  assert.match(detail, /font-variant-numeric:\s*tabular-nums/)
  assert.match(detail, /@media \(max-width:\s*760px\)/)
  assert.match(detail, /@media \(prefers-reduced-motion:\s*reduce\)/)
  assert.doesNotMatch(detail, /transition:\s*all/)
})

test('mixed-unit benchmarks use compact per-metric comparison rows instead of one shared axis', async () => {
  const page = await read('../pages/domains/[domain]/scenarios/index.vue')
  const detail = await read('../components/ScenarioDetailContent.vue')
  const comparison = await read('../components/BenchmarkComparison.vue')

  assert.match(page, /:benchmark="selectedBenchmark"/)
  assert.doesNotMatch(page, /EChartsCoreOption|benchmarkOption|yAxis:/)
  assert.match(detail, /<BenchmarkComparison :benchmark="benchmark" \/>/)
  assert.doesNotMatch(detail, /<BaseChart|benchmarkOption/)
  assert.match(comparison, /v-for="dimension in benchmark\.dimensions"/)
  assert.match(comparison, /v-for="\(series, seriesIndex\) in benchmark\.series"/)
  assert.match(comparison, /const max = dimensionMax\(key\)/)
  assert.match(comparison, /barWidth\(dimension\.key, series\)/)
  assert.match(comparison, /class="benchmark-series-track"/)
  assert.match(comparison, /class="benchmark-series-fill"/)
  assert.match(comparison, /\.benchmark-metric-row\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:/s)
  assert.doesNotMatch(comparison, /<table|<el-table|yAxis|logarithmic/i)
})

test('scenario hero keeps real metrics compact and typography roles intentional', async () => {
  const detail = await read('../components/ScenarioDetailContent.vue')
  const globalCss = await read('../assets/css/main.css')

  assert.match(
    detail,
    /<header[^>]*class="scenario-result-hero"[^>]*>\s*<div class="scenario-result-heading">[\s\S]*class="scenario-tech-stack"[\s\S]*<\/div>\s*<dl[^>]+class="scenario-summary-metrics"[\s\S]*<\/dl>\s*<\/header>/s,
  )
  assert.match(detail, /\.scenario-result-hero\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 960px\) minmax\(420px, 640px\)[^}]*justify-content:\s*space-between/s)
  assert.match(detail, /\.scenario-summary-metrics\s*\{[^}]*width:\s*100%[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(120px, 1fr\)\)[^}]*margin:\s*0[^}]*border-left:\s*1px solid var\(--scnet-divider\)/s)
  assert.match(detail, /\.scenario-summary-metrics > div \+ div\s*\{[^}]*border-left:\s*1px solid var\(--scnet-divider\)/s)
  assert.doesNotMatch(detail, /\.scenario-summary-metrics > div:nth-child\(n \+ 3\)\s*\{[^}]*border-top/s)
  assert.match(detail, /\.scenario-summary-metrics dd\s*\{[^}]*font-size:\s*22px/s)
  assert.doesNotMatch(detail, /\.scenario-summary-metrics\s*\{[^}]*background/s)
  assert.match(globalCss, /--scnet-font-sans:\s*'Noto Sans SC'/)
  assert.match(globalCss, /--scnet-font-mono:\s*'Cascadia Mono'/)
  assert.match(globalCss, /html, body\s*\{[^}]*font-family:\s*var\(--scnet-font-sans\)/s)
})

test('technology stack belongs to the scenario description instead of floating on the right', async () => {
  const detail = await read('../components/ScenarioDetailContent.vue')

  assert.match(detail, /<p class="scenario-result-description">[^<]*<\/p>\s*<div v-if="detail\.tech_stack\.length" class="scenario-tech-stack"[^>]*>[\s\S]*<span class="scenario-tech-stack-label">技术栈<\/span>[\s\S]*class="scenario-tech-stack-item"[\s\S]*<\/div>\s*<\/div>\s*<dl[^>]+class="scenario-summary-metrics"/s)
  assert.match(detail, /\.scenario-tech-stack-label\s*\{[^}]*color:\s*var\(--scnet-text\)[^}]*font-size:\s*15px[^}]*font-weight:\s*600/s)
  assert.match(detail, /\.scenario-tech-stack-label::before\s*\{[^}]*background:\s*var\(--scnet-primary\)/s)
  assert.match(detail, /\.scenario-tech-stack-item\s*\{[^}]*padding:\s*0[^}]*border:\s*0[^}]*background:\s*transparent/s)
  assert.match(detail, /\.scenario-tech-stack-item \+ \.scenario-tech-stack-item::before\s*\{[^}]*content:\s*'·'/s)
  assert.doesNotMatch(detail, /\.scenario-tech-stack\s*\{[^}]*justify-content:\s*flex-end/s)
  assert.doesNotMatch(detail, /\.scenario-tech-stack\s*\{[^}]*flex:\s*0 1 420px/s)
})

test('long metric units and benchmark scheme names remain fully readable', async () => {
  const detail = await read('../components/ScenarioDetailContent.vue')
  const comparison = await read('../components/BenchmarkComparison.vue')

  assert.match(detail, /<span class="scenario-summary-value">\s*\{\{ metricValue\(metric\) \}\}\s*<\/span>/s)
  assert.match(detail, /\.scenario-summary-metrics dd\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible[^}]*white-space:\s*normal/s)
  assert.match(detail, /\.scenario-summary-value\s*\{[^}]*white-space:\s*nowrap/s)
  assert.doesNotMatch(detail, /\.scenario-summary-metrics dd\s*\{[^}]*text-overflow:\s*ellipsis/s)
  assert.match(comparison, /\.benchmark-series-item\s*\{[^}]*padding:\s*0 clamp\(10px, 1vw, 18px\)/s)
  assert.match(comparison, /\.benchmark-series-meta span\s*\{[^}]*overflow:\s*visible[^}]*text-overflow:\s*clip[^}]*white-space:\s*normal/s)
})

test('outcomes and supported centers finish the page as flat report rows', async () => {
  const detail = await read('../components/ScenarioDetailContent.vue')

  assert.match(detail, /class="scenario-result-section scenario-highlight-section"/)
  assert.match(detail, /\.scenario-highlight-grid\s*\{[^}]*border-top:\s*1px solid var\(--scnet-divider\)[^}]*border-bottom:\s*1px solid var\(--scnet-divider\)/s)
  assert.match(detail, /\.scenario-highlight-grid > div\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent/s)
  assert.match(detail, /\.scenario-highlight-grid > div \+ div\s*\{[^}]*border-left:\s*1px solid var\(--scnet-divider\)/s)
  assert.match(detail, /\.scenario-cluster-list\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(180px, 1fr\)\)[^}]*border-top:\s*1px solid var\(--scnet-divider\)[^}]*border-bottom:\s*1px solid var\(--scnet-divider\)/s)
  assert.match(detail, /\.scenario-cluster-list span \+ span\s*\{[^}]*border-left:\s*1px solid var\(--scnet-divider\)/s)
  assert.doesNotMatch(detail, /\.scenario-cluster-list span\s*\{[^}]*background:\s*#f2f6fc/s)
  assert.doesNotMatch(detail, /\.scenario-cluster-list span\s*\{[^}]*border-radius:\s*5px/s)
})

test('legacy scenario detail route redirects to the integrated page', async () => {
  const legacy = await read('../pages/domains/[domain]/scenarios/[scenarioId].vue')

  assert.match(legacy, /navigateTo/)
  assert.match(legacy, /scenario:\s*scenarioId/)
  assert.match(legacy, /replace:\s*true/)
  assert.doesNotMatch(legacy, /<MetricCards/)
  assert.doesNotMatch(legacy, /getScenarioDetails/)
})
