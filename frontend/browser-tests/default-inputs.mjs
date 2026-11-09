import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const root=fileURLToPath(new URL('../../',import.meta.url))
const runtime=mkdtempSync(resolve(tmpdir(),'topic5-default-inputs-'))
const require=createRequire(import.meta.url)
const { chromium }=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const children=[]
let browser
let page
async function launch(file,env,pattern) {
  const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']})
  children.push(child)
  return new Promise((resolveReady,reject)=>{
    let output=''
    const timer=setTimeout(()=>reject(Error(`Startup timeout: ${output}`)),15000)
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(pattern);if(match){clearTimeout(timer);resolveReady(match[1])}})
    child.stderr.on('data',chunk=>{output+=chunk})
    child.once('error',error=>{clearTimeout(timer);reject(error)})
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`Server exited ${code}: ${output}`))})
  })
}
async function freePort() {
  const socket=createServer()
  await new Promise(resolveReady=>socket.listen(0,'127.0.0.1',resolveReady))
  const port=socket.address().port
  await new Promise(resolveClose=>socket.close(resolveClose))
  return port
}
try {
  const api=await launch(resolve(root,'backend/server.js'),{BACKEND_PORT:'0',MOCK_RUNTIME_DIR:runtime},/listening on (http:\/\/[^\s]+)/)
  const port=await freePort()
  await launch(resolve(root,'frontend/.output/server/index.mjs'),{HOST:'127.0.0.1',PORT:String(port),NUXT_PUBLIC_API_BASE:api},/Listening on (http:\/\/[^\s]+)/i)
  const base=`http://127.0.0.1:${port}`
  browser=await chromium.launch({headless:true,channel:'msedge'})
  page=await browser.newPage({viewport:{width:1440,height:1000}})
  page.setDefaultTimeout(15000)
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  const datasets=(await (await fetch(`${api}/geodynamics/datasets`)).json()).data
  const dataset=datasets.find(row=>row.dataset_id==='DS-WAVE-0004')
  const wave=datasets.filter(row=>row.scenario_id==='wave-propagation')
  const url=`${base}/domains/geodynamics/scenarios?scenario=wave-propagation&step=data`
  const row=()=>page.locator('.exp-dataprep .el-table__row').filter({hasText:dataset.name})
  const dialog=()=>page.getByRole('dialog')
  const state=async()=> (await (await fetch(`${api}/geodynamics/datasets/${dataset.dataset_id}`)).json()).data
  const file={name:'我的观测配置.json',mimeType:'text/plain',buffer:Buffer.from('station_id,x,y,z,elevation_m\nMY-STATION,1,2,3,4\n')}
  async function selectFile(payload) {
    const selected=page.waitForEvent('filechooser')
    await row().getByRole('button',{name:'更换文件',exact:true}).click()
    await (await selected).setFiles(payload)
  }
  await page.goto(url)
  await row().getByRole('button',{name:'预览',exact:true}).waitFor()
  assert.equal(await page.locator('.exp-dataprep').getByRole('button',{name:'更换文件',exact:true}).count(),wave.filter(row=>!row.builtin).length)
  assert.ok((await row().textContent()).includes(dataset.file_name))
  await row().getByRole('button',{name:'预览',exact:true}).click()
  await dialog().locator('.preview-table tbody tr').first().waitFor()
  assert.equal(await dialog().locator('.preview-table tbody tr').count(),10)
  const downloadEvent=page.waitForEvent('download')
  await dialog().getByRole('button',{name:'下载文件',exact:true}).click()
  assert.equal((await downloadEvent).suggestedFilename(),dataset.file_name)
  await dialog().getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('button',{name:'导入并继续',exact:true}).click()
  await page.waitForURL(/step=resource/)
  assert.equal((await state()).imported,true)
  await page.goto(url)
  await selectFile({name:'错误文件.csv',mimeType:'text/csv',buffer:Buffer.from('wrong,columns\n1,2\n')})
  await row().getByRole('button',{name:'重试上传',exact:true}).waitFor()
  assert.match(await page.locator('.dataset-notice.is-error').textContent(),/缺少必填列/)
  assert.equal((await state()).input_source,'default')
  assert.equal((await state()).imported,true)
  await page.reload()
  const uploadPattern='**/datasets/DS-WAVE-0004/upload?*'
  let release
  const blocked=new Promise(resolveBlocked=>{release=resolveBlocked})
  await page.route(uploadPattern,async route=>{await blocked;await route.abort().catch(()=>{})})
  await selectFile(file)
  await row().getByRole('button',{name:'取消上传',exact:true}).click()
  release()
  await page.unroute(uploadPattern)
  await row().getByRole('button',{name:'更换文件',exact:true}).waitFor()
  assert.equal((await state()).input_source,'default')
  await selectFile(file)
  await dialog().locator('.preview-table tbody tr').first().waitFor()
  assert.equal(await dialog().locator('.preview-table tbody tr').count(),1)
  assert.ok((await dialog().textContent()).includes(file.name))
  assert.ok((await dialog().textContent()).includes('MY-STATION'))
  assert.equal((await state()).input_source,'upload')
  assert.equal((await state()).imported,false)
  await dialog().getByRole('button',{name:'关闭',exact:true}).click()
  await page.reload()
  await row().getByRole('button',{name:'预览',exact:true}).click()
  await dialog().getByRole('button',{name:'恢复默认',exact:true}).click()
  await dialog().waitFor({state:'hidden'})
  assert.equal((await state()).input_source,'default')
  await row().getByRole('button',{name:'预览',exact:true}).click()
  await dialog().locator('.preview-table tbody tr').first().waitFor()
  assert.equal(await dialog().locator('.preview-table tbody tr').count(),10)
  await dialog().getByRole('button',{name:'关闭',exact:true}).click()
  await dialog().waitFor({state:'hidden'})
  mkdirSync(resolve(root,'.runtime-logs'),{recursive:true})
  await page.locator('.exp-dataprep').screenshot({path:resolve(root,'.runtime-logs/default-inputs.png')})
  await page.setViewportSize({width:390,height:844})
  await row().getByRole('button',{name:'更换文件',exact:true}).waitFor()
  await row().getByRole('button',{name:'预览',exact:true}).click()
  await dialog().locator('.preview-table tbody tr').first().waitFor()
  const bounds=await dialog().boundingBox()
  assert.ok(bounds.x>=0 && bounds.x+bounds.width<=391)
  assert.deepEqual(errors,[])
  console.log('PASS: ready defaults, Chinese filenames, direct import, failed/cancelled replacement, arbitrary-name upload, reload, restore and mobile preview')
} catch(error) {
  if (page) {
    console.error(await page.locator('.exp-dataprep').innerText().catch(()=>''))
    await page.screenshot({path:resolve(root,'.runtime-logs/default-inputs-failure.png')}).catch(()=>{})
  }
  throw error
} finally {
  await browser?.close()
  for (const child of children.reverse()) {
    if (child.exitCode===null) await new Promise(resolveExit=>{child.once('exit',resolveExit);child.kill()})
  }
  rmSync(runtime,{recursive:true,force:true})
}
