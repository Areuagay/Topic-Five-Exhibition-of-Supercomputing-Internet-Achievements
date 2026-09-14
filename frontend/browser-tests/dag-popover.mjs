import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
  const page = await browser.newPage({viewport:{width:1366,height:1000}})
  await page.goto(`${process.env.FRONTEND_URL || 'http://127.0.0.1:3000'}/domains/llm/runs/LLM-20260811-0001`)
  const frame = page.locator('.dag-canvas-frame'), node = page.locator('.vue-flow__node[data-id="prepare"]'), popup = page.locator('.dag-node-popover')
  await node.waitFor()
  await frame.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await node.click()
  await popup.waitFor({state:'visible'})
  async function pan(dx) {
    const f = await frame.boundingBox()
    await page.mouse.move(f.x+f.width/2,f.y+f.height-40)
    await page.mouse.down()
    await page.mouse.move(f.x+f.width/2+dx,f.y+f.height-40,{steps:15})
    await page.mouse.up()
    await page.waitForTimeout(250)
  }
  const f = await frame.boundingBox(), n = await node.boundingBox()
  await pan(f.x+10-n.x)
  await popup.waitFor({state:'visible'})
  const bounds = await popup.boundingBox(), nodeBounds = await node.boundingBox()
  const arrow = await popup.evaluate(el => parseFloat(getComputedStyle(el,'::after').left))
  const tip = bounds.x+arrow
  assert.ok(tip >= Math.max(f.x,nodeBounds.x)-2 && tip <= nodeBounds.x+nodeBounds.width+2)
  assert.ok(bounds.x >= f.x && bounds.x+bounds.width <= f.x+f.width)
  assert.ok(Math.abs(arrow-bounds.width/2)>20)
  await frame.screenshot({path:'../.runtime-logs/dag-left-edge.png'})
  await pan(-nodeBounds.width-60)
  await popup.waitFor({state:'hidden'})
  console.log('PASS: edge-clamped bubble arrow follows selected node while panning; hidden offscreen')
} finally { await browser.close() }
