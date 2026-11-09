import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { advanceWorkflow, buildOperatorWorkflow } from '../../backend/workflow-engine.js'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true })
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3000'
const runId = 'DRUG-20260811-0001'
const summary = JSON.parse(readFileSync(new URL(`../../mock-data/drug/run-details/${runId}.json`, import.meta.url), 'utf8')).data
const catalog = JSON.parse(readFileSync(new URL('../../mock-data/drug/operators.json', import.meta.url), 'utf8')).data
const output = fileURLToPath(new URL('../../.runtime-logs/', import.meta.url))
mkdirSync(output, { recursive: true })

function plan(ids) {
  return buildOperatorWorkflow('drug', [
    { id: 'prepare', name: '输入数据准备', status: 'running', progress: 0 },
    ...ids.map((id, i) => ({ id: `op-${i}`, operator_id: id, name: catalog.find(op => op.name === id).title, status: 'pending', progress: 0 })),
    { id: 'post', name: '结果整理与输出', status: 'pending', progress: 0 },
  ], 4)
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let workflow = plan(['receptor-preparation', 'molecule-generation-diffusion', 'ligand-preparation', 'receptor-grid-generation', 'molecular-docking-gpu', 'molecular-docking-cpu'])
  workflow.nodes.forEach(node => { node.status = 'success'; node.progress = 100 })
  await page.route(`**/api/v1/drug/runs/${runId}`, route => route.fulfill({ json: { code: 200, data: { ...summary, status: 'running' } } }))
  await page.route(`**/api/v1/drug/runs/${runId}/workflow`, route => route.fulfill({ json: { code: 200, data: structuredClone(workflow) } }))
  // Fixtures stay in browser responses: never submit tasks or alter user data.
  await page.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.fallback() : route.abort())
  await page.goto(`${base}/domains/drug/runs`)
  await page.getByRole('link', { name: runId, exact: true }).click()
  const frame = page.locator('.dag-canvas-frame')
  const node = id => page.locator(`.vue-flow__node[data-id="${id}"]`)
  async function ready() {
    await page.locator('.dag-flow:not(.is-layout-pending) .vue-flow__node').first().waitFor()
    await frame.scrollIntoViewIfNeeded()
    await page.waitForTimeout(350)
  }
  async function geometry() {
    return page.locator('.dag-flow').evaluate(el => ({
      nodes: [...el.querySelectorAll('.vue-flow__node')].map(n => [n.dataset.id, n.style.transform, n.style.height]),
      edges: [...el.querySelectorAll('.vue-flow__edge-path')].map(path => path.getAttribute('d')),
      viewport: el.querySelector('.vue-flow__viewport').style.transform,
    }))
  }
  async function assertNoNodeCrossings() {
    assert.deepEqual(await frame.evaluate(el => {
      const nodes = [...el.querySelectorAll('.vue-flow__node')].map(n => ({ id: n.dataset.id, rect: n.getBoundingClientRect() }))
      const collisions = []
      for (const path of el.querySelectorAll('.vue-flow__edge-path')) {
        const matrix = path.getScreenCTM(), length = path.getTotalLength()
        for (let t = 2; t < length - 2; t += 3) {
          const p = path.getPointAtLength(t).matrixTransform(matrix)
          for (const { id, rect: r } of nodes) if (p.x > r.left + 2 && p.x < r.right - 2 && p.y > r.top + 2 && p.y < r.bottom - 2) collisions.push(id)
        }
      }
      return [...new Set(collisions)]
    }), [])
  }
  await ready()
  assert.equal(await page.locator('.vue-flow__edge-path').count(), workflow.edges.length)
  await assertNoNodeCrossings()
  await page.getByRole('button', { name: '适应工作流视图' }).click()
  await page.waitForTimeout(350)
  await page.locator('.dag-viewer').screenshot({ path: `${output}/dag-drug-parallel.png` })

  workflow = plan(['receptor-preparation', 'molecule-generation-diffusion', 'receptor-grid-generation', 'molecular-docking-gpu'])
  const get = id => workflow.nodes.find(node => node.id === id)
  Object.assign(get('prepare'), { duration_ticks: 1 })
  Object.assign(get('op-0'), { duration_ticks: 1 })
  Object.assign(get('op-1'), { duration_ticks: 6 })
  Object.assign(get('op-2'), { duration_ticks: 3 })
  advanceWorkflow(workflow, 4, 120)
  await node('op-4').waitFor({ state: 'detached' })
  await ready()
  const longStart=await node('op-0').boundingBox(),longEnd=await node('op-2').boundingBox(),short=await node('op-1').boundingBox()
  assert.ok(Math.abs(short.x+short.width/2-(longStart.x+longEnd.x+longEnd.width)/2)<1,'unequal branches share a center')
  await page.getByRole('button', { name: '放大工作流' }).click()
  await page.waitForTimeout(250)
  const f = await frame.boundingBox()
  await page.mouse.move(f.x + f.width / 2, f.y + f.height - 24)
  await page.mouse.down()
  await page.mouse.move(f.x + f.width / 2 - 70, f.y + f.height - 24, { steps: 8 })
  await page.mouse.up()
  const before = await geometry()
  advanceWorkflow(workflow, 4, 120)
  advanceWorkflow(workflow, 4, 120)
  await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="op-2"] .workflow-node-meta')?.textContent.includes('33%'))
  assert.deepEqual(await geometry(), before, 'progress polling preserves node positions, edge paths, pan and zoom')
  assert.ok(await node('op-1').innerText().then(text => text.includes('运行中')))
  assert.ok(await node('op-3').innerText().then(text => text.includes('等待汇合')))
  await page.getByRole('button', { name: '适应工作流视图' }).click()
  await page.waitForTimeout(350)
  await assertNoNodeCrossings()
  await page.locator('.dag-viewer').screenshot({ path: `${output}/dag-asymmetric-running.png` })
  await node('op-2').click()
  await page.locator('.dag-node-popover').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.dag-node-popover').waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '适应工作流视图' }).click()
  await page.waitForTimeout(350)
  const mobileFrame = await frame.boundingBox()
  for (const item of await page.locator('.vue-flow__node').all()) {
    const rect = await item.boundingBox()
    assert.ok(rect.x >= mobileFrame.x && rect.x + rect.width <= mobileFrame.x + mobileFrame.width)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.ok((await page.locator('.is-flowing .vue-flow__edge-path').evaluateAll(paths => paths.map(path => getComputedStyle(path).animationName))).every(name => name === 'none'))
  await page.setViewportSize({width:1440,height:1100})
  const autoCatalog=JSON.parse(readFileSync(new URL('../../mock-data/automotive/operators.json',import.meta.url),'utf8')).data
  const branches=[
    ['auto-thermal-flow','auto-species-transport','auto-combustion'],
    ['isothermal-film','film-evolution'],['auto-external-flow'],['particle-spray'],
    ['oil-multiphase-transport','oil-multiphase-interface'],['wading-free-surface','wading-impact'],
  ]
  workflow=buildOperatorWorkflow('automotive',[
    {id:'prepare',name:'输入数据准备',status:'running',progress:0},
    ...branches.flat().map(id=>({id,operator_id:id,name:autoCatalog.find(op=>op.name===id).title,status:'pending',progress:0})),
    {id:'post',name:'结果整理与输出',status:'pending',progress:0},
  ],4)
  await node('auto-thermal-flow').waitFor()
  await ready()
  await page.getByRole('button',{name:'适应工作流视图'}).click()
  const start=await node('prepare').boundingBox(),end=await node('post').boundingBox()
  const center=(start.x+start.width+end.x)/2
  for(const branch of branches){
    const first=await node(branch[0]).boundingBox(),last=await node(branch.at(-1)).boundingBox()
    assert.ok(Math.abs((first.x+last.x+last.width)/2-center)<1,branch.join(' -> '))
  }
  await assertNoNodeCrossings()
  await page.locator('.dag-viewer').screenshot({path:`${output}/dag-centered-automotive.png`})
  assert.deepEqual(errors, [])
  console.log('PASS: branch layout, real routed paths, asymmetric scheduling display, stable polling, pan/zoom, popovers and mobile overview')
} finally {
  await browser.close()
}
