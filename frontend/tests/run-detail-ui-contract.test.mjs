import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('run detail uses the approved integrated task-record surface and shared navigation', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  assert.match(page, /class="run-detail-page"/)
  assert.match(page, /class="run-detail-surface"/)
  assert.match(page, /<DomainSurfaceHeader/)
  assert.match(page, /<ScenarioSelector[\s\S]*:domain="domain"[\s\S]*runs-active/)
  assert.match(page, /getScenarios/)
  assert.match(page, /class="run-detail-workspace"/)
  assert.match(page, /class="run-detail-record"/)
  assert.match(page, /<header class="run-record-header">[\s\S]*class="run-detail-back-link"[\s\S]*返回运行记录[\s\S]*<\/header>/)
  assert.match(page, /class="run-detail-back-link"[\s\S]*:to="`\/domains\/\$\{domain\}\/runs`"/)
  assert.doesNotMatch(page, /class="run-detail-surface-header"/)
  assert.doesNotMatch(page, /class="run-detail-header-nav"/)
  assert.doesNotMatch(page, /class="run-detail-title-group"/)
  assert.match(page, /class="run-summary-strip"/)
  assert.match(page, /class="run-dag-section"/)
  assert.match(page, /class="run-resource-strip"/)
  assert.doesNotMatch(page, /class="run-section-heading run-dag-heading"/)
  assert.doesNotMatch(page, /class="run-simulation-label"/)
  assert.match(page, /\.run-record-id\s*\{[^}]*font-size:\s*20px/s)
  assert.doesNotMatch(page, /:subtitle=/)
  assert.doesNotMatch(page, /当前阶段：\{\{ stageText\(detail\.current_stage\) \}\}/)
  assert.doesNotMatch(page, /\.run-record-identity p span\s*\{/)
  assert.doesNotMatch(page, /<el-breadcrumb/)
  assert.doesNotMatch(page, /返回列表/)
})

test('run detail keeps secondary information restrained, semantic, and responsive', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  assert.match(page, /class="run-detail-section"/)
  assert.match(page, /class="run-metric-grid"/)
  assert.match(page, /class="run-facts-grid"/)
  assert.match(page, /class="run-artifact-kind"/)
  assert.doesNotMatch(page, /📊|🖼️|💾|📄|📜|🧠|📦/)
  assert.match(page, /class="run-detail-table-region"/)
  assert.match(page, /.run-detail-table-region\s*\{[^}]*overflow-x:\s*auto/s)
  assert.match(page, /@media \(max-width:\s*700px\)/)
  assert.match(page, /:focus-visible/)
  assert.match(page, /\.run-detail-back-link\s*\{[^}]*min-height:\s*44px/s)
  assert.match(page, /\.run-detail-back-link\s*\{[^}]*border:\s*1px solid #c9d9ec[^}]*background:\s*#f5f8fc/s)
  assert.match(page, /\.run-detail-back-link\s*\{[^}]*font-size:\s*15px[^}]*font-weight:\s*600/s)
  assert.doesNotMatch(page, /transition:\s*all/)
})

test('run detail removes explanatory subtitles and promotes section headings', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  for (const copy of [
    '任务最近一次上报的关键计算指标',
    '调度标识、时间与数据来源',
    '该应用场景产生的专项计算数据',
    '按时间顺序记录任务调度与计算过程',
    '计算过程中生成的数据、图像与报告文件',
  ]) {
    assert.doesNotMatch(page, new RegExp(copy))
  }

  assert.doesNotMatch(page, /\.run-section-heading p\s*\{/)
  assert.match(page, /\.run-section-heading h2\s*\{[^}]*font-size:\s*19px/s)
})

test('run detail separates overview, workflow, data, and records into exhibition sections', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  assert.match(page, /class="run-overview-panel"/)
  assert.match(page, /class="run-workflow-panel"/)
  assert.match(page, /class="run-data-panel"/)
  assert.match(page, /class="run-records-panel"/)
  assert.match(page, /\.run-detail-record\s*\{[^}]*display:\s*grid[^}]*gap:\s*clamp\(/s)
  assert.match(page, /\.run-overview-panel,[\s\S]*\.run-records-panel\s*\{[^}]*border:\s*1px solid/s)
  assert.match(page, /\.run-data-layout\s*\{[^}]*grid-template-columns:\s*1fr/s)
  assert.match(page, /\.run-data-secondary\s*\{[^}]*border-top:\s*1px solid var\(--scnet-divider\)/s)
})

test('run metrics remain reusable when metric counts vary', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  assert.match(page, /\.run-metric-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)[^}]*gap:\s*12px[^}]*padding:\s*18px 24px 22px[^}]*background:\s*#fbfcfe/s)
  assert.match(page, /\.run-metric-grid > div\s*\{[^}]*border:\s*1px solid #e2e8f0[^}]*border-radius:\s*6px[^}]*background:\s*#fff/s)
  assert.doesNotMatch(page, /\.run-data-primary \.run-metric-grid\s*\{[^}]*grid-auto-rows/s)
  assert.doesNotMatch(page, /\.run-data-primary \.run-metric-grid > div:nth-child/)
})

test('resource summary uses exhibition-readable label and value sizes', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  assert.match(page, /\.run-resource-strip dt\s*\{[^}]*font-size:\s*13px/s)
  assert.match(page, /\.run-resource-strip dd\s*\{[^}]*font-size:\s*18px/s)
})

test('run logs read as a command stream without pretending to be an input terminal', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  assert.match(page, /class="run-log-prompt"[^>]*aria-hidden="true"[^>]*>›<\/span>/)
  assert.match(page, /class="run-log-origin">\[\{\{ clusterName\(line\.cluster_id\) \}\}\]<\/span>/)
  assert.match(page, /class="run-log-content">\{\{ line\.message \}\}<\/span>/)
  assert.match(page, /\.run-log-line\s*\{[^}]*grid-template-columns:\s*14px 148px 64px minmax\(0,\s*1fr\)/s)
  assert.match(page, /\.run-log-origin\s*\{[^}]*color:\s*#aebed1/s)
  assert.doesNotMatch(page, /<input|<textarea|contenteditable/)
  assert.doesNotMatch(page, /class="run-log-message"[\s\S]*<b/)
})

test('cross-center progress uses a readable comparison list instead of a raw object table', async () => {
  const page = await read('../pages/domains/[domain]/runs/[runId].vue')

  assert.match(page, /key === 'cluster_progress'[\s\S]*kind:\s*'cluster-progress'/)
  assert.match(page, /class="run-cluster-progress-list"[^>]+role="list"/)
  assert.match(page, /class="run-cluster-progress-row"[^>]+role="listitem"/)
  assert.match(page, /class="run-cluster-progress-track"[^>]+role="progressbar"/)
  assert.match(page, /function clusterProgressPercent\(/)
  assert.match(page, /吞吐量/)
  assert.match(page, /statusText\(row\.status\)/)
  assert.doesNotMatch(page, /section\.kind === 'table'/)
  assert.doesNotMatch(page, /Object\.keys\(\(section\.payload/)
})

test('workflow DAG is a polished read-only Vue Flow viewport with accessible controls', async () => {
  const dag = await read('../components/WorkflowDag.vue')

  assert.match(dag, /from '@vue-flow\/core'/)
  assert.match(dag, /from '@vue-flow\/background'/)
  assert.match(dag, /<VueFlow/)
  assert.match(dag, /function computeLayeredLayout/)
  assert.match(dag, /:nodes-draggable="false"/)
  assert.match(dag, /:nodes-connectable="false"/)
  assert.match(dag, /:zoom-on-scroll="false"/)
  assert.match(dag, /fit-view-on-init/)
  assert.match(dag, /padding:\s*'36px'/)
  assert.match(dag, /function handleCanvasWheel/)
  assert.match(dag, /function zoomIn/)
  assert.match(dag, /function zoomOut/)
  assert.match(dag, /function fitView/)
  assert.match(dag, /class="dag-control-button"/)
  assert.match(dag, /aria-label="放大工作流"/)
  assert.match(dag, /aria-label="缩小工作流"/)
  assert.match(dag, /aria-label="适应工作流视图"/)
  assert.match(dag, /aria-label="工作流 DAG 画布"/)
  assert.match(dag, /class="sr-only"/)
  assert.match(dag, /<h2 id="dag-viewer-title">工作流 DAG<\/h2>/)
  assert.match(dag, /Ctrl\/⌘ \+ 滚轮缩放/)
  assert.doesNotMatch(dag, /按计算依赖展示执行链路|拖动画布/)
  assert.doesNotMatch(dag, /@antv\/x6/)
})

test('workflow DAG keeps Vue Flow inside a fixed frame', async () => {
  const dag = await read('../components/WorkflowDag.vue')

  assert.match(dag, /class="dag-canvas-frame"/)
  assert.match(dag, /\.dag-canvas-frame\s*\{[^}]*height:\s*390px/s)
  assert.match(dag, /\.dag-flow\s*\{[^}]*height:\s*100%/s)
  assert.doesNotMatch(dag, /autoResize/)
})

test('workflow DAG uses a collision-safe node-anchored popover', async () => {
  const dag = await read('../components/WorkflowDag.vue')

  assert.match(dag, /const selectedNode = computed/)
  assert.match(dag, /function updatePopoverPosition/)
  assert.match(dag, /const spaceAbove/)
  assert.match(dag, /const spaceBelow/)
  assert.match(dag, /class="dag-node-popover(?:\s|")/)
  assert.match(dag, /data-placement/)
  assert.match(dag, /aria-live="polite"/)
  assert.doesNotMatch(dag, /aria-label="取消节点选择"/)
  assert.doesNotMatch(dag, /class="dag-node-popover-close"/)
  assert.match(dag, /if \(selectedNodeId\.value === node\.id\)[\s\S]*clearSelection\(\)/)
  assert.match(dag, /if \(selectedNodeId\.value === id\)[\s\S]*clearSelection\(\)/)
  assert.match(dag, /@pane-click="clearSelection"/)
  assert.match(dag, /@keydown\.esc="clearSelection"/)
  assert.match(dag, /Math\.min\([^\n]+Math\.max/)
  assert.doesNotMatch(dag, /dag-node-inspector/)
})

test('workflow DAG follows interaction and heading guidance', async () => {
  const dag = await read('../components/WorkflowDag.vue')

  assert.match(dag, /\.dag-toolbar-copy h2\s*\{[^}]*font-size:\s*19px[^}]*text-wrap:\s*balance/s)
  assert.match(dag, /\.dag-flow\s*\{[^}]*user-select:\s*none/s)
  assert.match(dag, /\.workflow-node\.is-selected\s*\{[^}]*border-color:\s*#d4dde8/s)
  assert.match(dag, /\.dag-node-popover-title\s*\{[^}]*font-size:\s*16px/s)
  assert.match(dag, /\.dag-node-popover\s*\{[^}]*padding:\s*12px/s)
  assert.match(dag, /\.dag-node-popover-facts dd\s*\{[^}]*font-size:\s*14px/s)
  assert.match(dag, /\.dag-popover-enter-active\s*\{[^}]*opacity 220ms[^}]*transform 220ms/s)
  assert.match(dag, /\.dag-popover-leave-active\s*\{[^}]*opacity 150ms[^}]*transform 150ms/s)
  assert.match(dag, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.dag-popover-enter-active/)
  assert.doesNotMatch(dag, /transition:\s*all/)
})
