import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000'
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' })
mkdirSync('.runtime-logs/experience-qa', { recursive: true })
const cases = [
  ['geodynamics', 'wave-propagation'], ['llm', 'llm-pretraining'],
  ['automotive', 'vehicle-crash'], ['uav', 'swarm-coordination'],
  ['drug', 'virtual-screening'], ['dft', 'band-dos'],
]
async function check(domain, scenario, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`${base}/domains/${domain}/scenarios?scenario=${scenario}&step=operator`)
    await page.locator('.operator-item').first().waitFor({ timeout: 60000 })
    await page.waitForTimeout(600)
    const clear = page.locator('.operator-batch-button.is-clear')
    if (await clear.isEnabled()) await clear.click()
    await page.waitForTimeout(500)
    const firstButton = page.locator('.operator-select-button:enabled').first()
    await firstButton.evaluate(button => button.click())
    await page.waitForTimeout(50)
    const selectionAnimations = await page.locator('.operator-item.is-chosen').evaluate(card =>
      card.getAnimations().filter(animation => animation.effect.getKeyframes().some(frame => 'scale' in frame)).length)
    assert.equal(selectionAnimations > 0, reducedMotion === 'no-preference', 'selection uses independent scale only when motion is allowed')
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.selected-chip').count(), 1)
    await page.locator('.selected-chip').click()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.operator-item.is-chosen').count(), 0)
    assert.equal(await page.locator('.operator-selected-frame').evaluate(el => el.getBoundingClientRect().height), 0)

    // Rapid repeated selection must finish in the state of the final click.
    for (let i = 0; i < 7; i++) {
      await firstButton.evaluate(button => button.click())
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(600)
    assert.equal(await firstButton.getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.selected-chip').count(), 1)
    assert.equal(await page.locator('.operator-item.is-chosen').evaluate(el => getComputedStyle(el).scale), 'none')

    await page.locator('.operator-batch-button.is-primary').click()
    // Interleave filtering with selection feedback instead of waiting for it to end.
    await page.locator('.operator-filters button').nth(1).evaluate(button => button.click())
    await page.waitForTimeout(60)
    await page.locator('.operator-filters button').first().evaluate(button => button.click())
    await page.waitForTimeout(650)
    const selected = await page.locator('.operator-item.is-chosen').count()
    assert.ok(selected > 0)
    assert.equal(await page.locator('.selected-chip').count(), selected)
    assert.equal(await page.locator('.operator-filter-leave-active, .operator-filter-enter-active').count(), 0)
    const cards = await page.locator('.operator-item').evaluateAll(items => items.map(el => ({
      opacity: getComputedStyle(el).opacity, position: getComputedStyle(el).position,
      scale: getComputedStyle(el).scale, transform: getComputedStyle(el).transform,
    })))
    for (const card of cards) {
      assert.equal(card.opacity, '1')
      assert.notEqual(card.position, 'absolute')
      assert.equal(card.scale, 'none')
      assert.equal(card.transform, 'none')
    }

    await page.locator('.experience-step').filter({ hasText: '资源调度' }).evaluate(button => button.click())
    await page.waitForTimeout(50)
    const stepAnimations = await page.locator('.experience-body').evaluate(el => el.getAnimations().length)
    assert.equal(stepAnimations > 0, reducedMotion === 'no-preference')
    for (const step of ['数据准备', '算子选择', '资源调度', '算子选择']) {
      await page.locator('.experience-step').filter({ hasText: step }).evaluate(button => button.click())
      await page.waitForTimeout(45)
    }
    await page.waitForTimeout(700)
    assert.match(await page.locator('.experience-step.is-active').innerText(), /算子选择/)
    assert.equal(await page.locator('.experience-body').evaluate(el => getComputedStyle(el).opacity), '1')
    assert.equal(await page.locator('.operator-item.is-chosen').count(), selected)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(400)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    if (domain === 'geodynamics') {
      await page.screenshot({ path: `.runtime-logs/experience-qa/motion-mobile-${reducedMotion}.png`, fullPage: true })
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: `.runtime-logs/experience-qa/motion-desktop-${reducedMotion}.png`, fullPage: true })
      await page.locator('.experience-step').filter({ hasText: '执行监控' }).click()
      await page.locator('.exp-monitor .el-progress-bar__inner').first().waitFor()
      assert.equal(await page.locator('.exp-monitor .el-progress-bar__inner').evaluateAll(bars =>
        bars.every(bar => getComputedStyle(bar).backgroundImage === 'none')), true, 'status colors are not obscured by a blue gradient')
      await page.locator('.experience-step').filter({ hasText: '数据准备' }).click()
      await page.locator('.dataset-state').first().waitFor()
      const contrasts = await page.evaluate(() => {
        function luminance(color) {
          const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
            const channel = value / 255
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          })
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
        }
        return Array.from(document.querySelectorAll('.dataset-state, .dataset-id, .exp-dataprep th.el-table__cell')).filter(el => el.checkVisibility()).map(el => {
          const style = getComputedStyle(el)
          const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : style.backgroundColor
          const a = luminance(style.color), b = luminance(background)
          return { text: el.textContent.trim(), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
        })
      })
      for (const item of contrasts) assert.ok(item.ratio >= 4.5, `${item.text} contrast ${item.ratio.toFixed(2)}`)
    }
    assert.deepEqual(errors, [])
    console.log(`PASS ${domain} ${reducedMotion}: selection, chips, rapid toggles, filtering, step interruption, mobile`)
  } finally { await page.close() }
}
try {
  for (const [domain, scenario] of cases) await check(domain, scenario)
  await check(...cases[0], 'reduce')
} finally { await browser.close() }
