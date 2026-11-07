import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

test('HTTP sample -> raw upload -> preview -> exact download -> remove, with bounded input',async t=>{
  const runtime=mkdtempSync(resolve(tmpdir(),'topic5-http-'))
  const child=spawn(process.execPath,[resolve(import.meta.dirname,'../server.js')],{env:{...process.env,BACKEND_PORT:'0',MOCK_RUNTIME_DIR:runtime},stdio:['ignore','pipe','pipe']})
  t.after(async()=>{
    await new Promise(resolveExit=>{if(child.exitCode!==null)return resolveExit();child.once('exit',resolveExit);child.kill()})
    rmSync(runtime,{recursive:true,force:true})
  })
  const base=await new Promise((resolveReady,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server startup timed out')),10000)
    child.stdout.on('data',chunk=>{const match=String(chunk).match(/listening on (http:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolveReady(match[1])}})
    child.once('error',reject)
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('Server exited before startup'))})
  })
  const path=`${base}/geodynamics/datasets/DS-WAVE-0004`
  const sample=await fetch(path+'/sample'); assert.equal(sample.status,200)
  assert.match(sample.headers.get('content-disposition'),/attachment/)
  const bytes=Buffer.from(await sample.arrayBuffer())
  const uploaded=await fetch(path+'/upload?filename='+encodeURIComponent('台站演示.csv'),{method:'POST',body:bytes,headers:{'Content-Type':'application/octet-stream'}})
  assert.equal(uploaded.status,200)
  assert.equal((await uploaded.json()).data.file_name,'台站演示.csv')
  const preview=await (await fetch(path+'/preview')).json()
  assert.equal(preview.data.total_rows,10)
  assert.equal(preview.data.headers[0],'station_id')
  const downloaded=await fetch(path+'/download')
  assert.match(downloaded.headers.get('content-disposition'),/filename\*=UTF-8''%/)
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes)
  const malformed=await fetch(path+'/upload?filename=x.csv',{method:'POST',body:'invalid'})
  assert.equal(malformed.status,400)
  assert.equal((await (await fetch(path+'/preview')).json()).data.total_rows,10)
  const oversized=await fetch(path+'/upload?filename=large.csv',{method:'POST',body:Buffer.alloc(5*1024*1024+1)})
  assert.equal(oversized.status,413)
  const removed=await fetch(path,{method:'DELETE'});assert.equal(removed.status,200)
  assert.equal((await fetch(path+'/preview')).status,404)
  assert.equal((await fetch(path+'/download')).status,404)
})
