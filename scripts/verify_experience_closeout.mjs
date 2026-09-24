import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
mkdirSync(".runtime-logs", { recursive: true });
import assert from "node:assert/strict";
const cases=[['geodynamics','wave-propagation','tectonic-evolution'],['llm','llm-pretraining','pinn-acceleration'],['automotive','vehicle-crash','fatigue-life'],['uav','swarm-coordination','path-planning'],['drug','virtual-screening','admet-prediction'],['dft','band-dos','high-throughput-screening']];
const base=process.env.UI_BASE_URL || "http://127.0.0.1:3000";
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 for(const [domain,...scenarios] of cases){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const scenario of scenarios){
   await page.goto(`${base}/domains/${domain}/scenarios?scenario=${scenario}&step=data`);
   await page.locator('.experience-flow:not([inert])').waitFor();
   for (const title of ['流程编排','执行监控','结果展示']) {
    assert.equal(await page.locator('.experience-step').filter({hasText:title}).isDisabled(),true,'all execution steps require submission');
   }
   assert.equal(await page.locator('.dataset-table th').filter({hasText:'更新时间'}).count(),1);
   const rows=await page.locator('.dataset-table .el-table__row').evaluateAll(rows=>rows.map(row=>({pending:row.textContent.includes('待上传'),cells:[...row.querySelectorAll('td')].map(td=>td.innerText.trim())})));
   assert.ok(rows.length>0);
   for(const row of rows.filter(row=>row.pending)) {
    assert.equal(row.cells[3],'—');assert.equal(row.cells[4],'—');assert.equal(row.cells[6],'—');
   }
   for (const step of ['workflow','monitor','result']) {
    await page.goto(`${base}/domains/${domain}/scenarios?scenario=${scenario}&step=${step}`);
    await page.locator('.operator-item').first().waitFor();
    await page.waitForURL(url=>url.searchParams.get('step')==='operator');
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS',domain,'both scenarios: fields, locked step and direct URL guard');
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/domains/drug/scenarios?scenario=virtual-screening&step=operator`);
 await page.locator('.operator-item').first().waitFor();
 await page.getByRole('button',{name:/采用场景推荐/}).click();
 await page.locator('.experience-next').click();
 await page.locator('.experience-step.is-active').filter({hasText:'流程编排'}).waitFor();
 const runId=new URL(page.url()).searchParams.get('run');assert.ok(runId);
 assert.equal(await page.locator('.experience-step').filter({hasText:'流程编排'}).isEnabled(),true);
 await page.locator('.vue-flow__node').first().waitFor();
 await page.reload();
 await page.locator('.vue-flow__node').first().waitFor();
 assert.equal(new URL(page.url()).searchParams.get('run'),runId);
 assert.match(await page.locator('.experience-step.is-active').innerText(),/流程编排/);
 for (const title of ['执行监控','结果展示']) {
  await page.locator('.experience-next').click();
  await page.locator('.experience-step.is-active').filter({hasText:title}).waitFor();
 }
 for (const title of ['执行监控','流程编排']) {
  await page.locator('.experience-previous').click();
  await page.locator('.experience-step.is-active').filter({hasText:title}).waitFor();
 }
 await page.locator('.experience-step').filter({hasText:'算子选择'}).click();
 await page.locator('.operator-select-button[aria-pressed=true]').first().click();
  assert.equal(await page.locator('.experience-step').filter({hasText:'流程编排'}).isDisabled(),true);
  await page.goBack();
  await page.waitForURL(url=>url.searchParams.get('step')==='operator');
  await page.reload();
  await page.locator('.experience-flow:not([inert])').waitFor();
  assert.equal(await page.locator('.experience-step').filter({hasText:'流程编排'}).isDisabled(),true,'restore remains locked after reload');
 await page.locator('.experience-start').click();
 await page.locator('.exp-dataprep').waitFor();
 for (const title of ['流程编排','执行监控','结果展示']) {
  assert.equal(await page.locator('.experience-step').filter({hasText:title}).isDisabled(),true);
 }
 await page.waitForTimeout(350); await page.screenshot({path:'.runtime-logs/closeout-data-1440.png',fullPage:true});
 await page.locator('.scenario-selector-runs').click();
 await page.getByRole('link',{name:runId,exact:true}).click();
 await page.waitForURL(`**/runs/${runId}`);await page.locator('.vue-flow__node').first().waitFor();
 await page.goBack();
 await page.locator('.scenario-selector-option').first().click();
 await page.locator('.experience-flow:not([inert])').waitFor();
 await page.locator('.experience-step').filter({hasText:'数据准备'}).click();await page.waitForTimeout(300);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.waitForTimeout(350); await page.screenshot({path:'.runtime-logs/closeout-data-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS submit/unlock, reload, modified selection relock, restore relock, historical workflow access, mobile');
 await page.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
