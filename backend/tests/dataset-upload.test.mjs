import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createExperienceStore, EXPERIENCE_DOMAINS } from '../experience-store.js'
import { MAX_UPLOAD_BYTES, parseCsv } from '../dataset-files.js'

function setup(t) {
  const runtimeDir=mkdtempSync(resolve(tmpdir(),'topic5-upload-'))
  t.after(()=>rmSync(runtimeDir,{recursive:true,force:true}))
  const options={dataDir:resolve(import.meta.dirname,'../../mock-data'),runtimeDir}
  return {options,store:createExperienceStore(options)}
}

test('all 33 default inputs are ready, previewable, replaceable and restorable with exact file bytes',t=>{
  const {options,store}=setup(t)
  let count=0
  for(const domain of EXPERIENCE_DOMAINS) {
    for(const dataset of store.read([domain,'datasets']).data.filter(d=>!d.builtin)) {
      count++
      assert.equal(dataset.uploaded,true)
      assert.equal(dataset.input_source,'default')
      assert.equal(dataset.preview_available,true)
      const initial=store.read([domain,'datasets',dataset.dataset_id,'preview'])
      assert.equal(initial.code,200)
      assert.equal(initial.data.size_bytes,dataset.size_bytes)
      assert.equal(initial.data.format,dataset.upload_format)
      assert.ok(dataset.file_name.startsWith(dataset.name))
      const file=store.file(domain,dataset.dataset_id,'sample')
      assert.ok(file,`${domain}/${dataset.dataset_id} has a sample`)
      const buffer=readFileSync(file.path)
      const result=store.write('POST',[domain,'datasets',dataset.dataset_id,'upload'],{buffer,file_name:`自定义输入-${count}.data`})
      assert.equal(result.code,200,`${dataset.dataset_id}: ${result.message}`)
      assert.equal(result.data.size_bytes,buffer.length)
      assert.equal(result.data.preview_available,true)
      assert.equal(result.data.upload_file,undefined,'internal storage paths are private')
      assert.equal(result.data.source,'用户上传')
      const restarted=createExperienceStore(options)
      const preview=restarted.read([domain,'datasets',dataset.dataset_id,'preview'])
      assert.equal(preview.code,200)
      assert.ok(preview.data.summary)
      assert.equal(preview.data.size_bytes,buffer.length)
      assert.deepEqual(readFileSync(restarted.file(domain,dataset.dataset_id,'download').path),buffer)
      assert.equal(store.write('DELETE',[domain,'datasets',dataset.dataset_id]).code,200)
      assert.equal(store.read([domain,'datasets',dataset.dataset_id,'preview']).code,200)
      assert.equal(store.read([domain,'datasets',dataset.dataset_id]).data.input_source,'default')
      assert.equal(store.read([domain,'datasets',dataset.dataset_id]).data.imported,false)
      assert.deepEqual(readFileSync(store.file(domain,dataset.dataset_id,'download').path),buffer)
      assert.equal(createExperienceStore(options).read([domain,'datasets',dataset.dataset_id]).data.input_source,'default')
    }
  }
  assert.equal(count,33)
})

test('defaults import directly, legacy empty slots migrate, and user files survive migration',t=>{
  const {store,options}=setup(t)
  for (const domain of EXPERIENCE_DOMAINS) {
    const rows=store.read([domain,'datasets']).data
    for (const scenario of new Set(rows.map(row=>row.scenario_id))) {
      const imported=store.write('POST',[domain,'scenarios',scenario,'import'])
      assert.equal(imported.code,200)
      assert.equal(imported.data.total_imported,rows.filter(row=>row.scenario_id===scenario).length)
    }
  }
  const domain='geodynamics',id='DS-WAVE-0004'
  const bytes=Buffer.from('station_id,x,y,z,elevation_m\nMY-STATION,1,2,3,4\n')
  assert.equal(store.write('POST',[domain,'datasets',id,'upload'],{buffer:bytes,file_name:'观测数据_新版本.txt'}).code,200)
  store.write('POST',[domain,'scenarios','wave-propagation','import'])
  const path=resolve(options.runtimeDir,`${domain}.json`)
  const legacy=JSON.parse(readFileSync(path,'utf8'))
  for (const row of legacy.datasets) {
    delete row.input_source
    if (!row.builtin&&!row.upload_file) { row.uploaded=false;row.imported=false;row.status='pending' }
  }
  writeFileSync(path,JSON.stringify(legacy))
  const restarted=createExperienceStore(options)
  const rows=restarted.read([domain,'datasets']).data
  assert.ok(rows.every(row=>row.uploaded))
  const custom=rows.find(row=>row.dataset_id===id)
  assert.equal(custom.input_source,'upload')
  assert.equal(custom.file_name,'观测数据_新版本.txt')
  assert.equal(custom.imported,true)
  assert.deepEqual(readFileSync(restarted.file(domain,id,'download').path),bytes)
  const defaultId='DS-WAVE-0002'
  restarted.write('POST',[domain,'scenarios','wave-propagation','import'])
  const invalid=restarted.write('POST',[domain,'datasets',defaultId,'upload'],{buffer:Buffer.from('{}'),file_name:'anything.json'})
  assert.equal(invalid.code,400)
  const unchanged=restarted.read([domain,'datasets',defaultId]).data
  assert.equal(unchanged.input_source,'default')
  assert.equal(unchanged.imported,true)
  assert.equal(createExperienceStore(options).read([domain,'datasets',defaultId]).data.imported,true)
})

test('invalid uploads do not overwrite valid files or import state',t=>{
  const {store}=setup(t), domain='geodynamics', id='DS-WAVE-0004', parts=[domain,'datasets',id,'upload']
  const sample=store.file(domain,id,'sample')
  const buffer=readFileSync(sample.path)
  assert.equal(store.write('POST',parts,{buffer,file_name:'台站.csv'}).code,200)
  store.write('POST',[domain,'scenarios','wave-propagation','import'])
  const invalid=[
    undefined,
    {buffer:Buffer.alloc(0),file_name:'empty.csv'},
    {buffer:Buffer.alloc(MAX_UPLOAD_BYTES+1),file_name:'large.csv'},
    {buffer,file_name:'../../escape.csv'},
    {buffer:Buffer.from('{"wrong":"content"}'),file_name:sample.name},
    {buffer:Buffer.from('bad,headers\n1,2'),file_name:'bad.csv'},
    {buffer:Buffer.from('station_id,x,y,z,elevation_m\nSTA-1,no,0,0,0'),file_name:'bad.csv'},
    {buffer:Buffer.from('station_id,x,y,z,elevation_m\nSTA-1,0,0,0,0\nSTA-1,1,1,1,1'),file_name:'duplicate.csv'},
    {buffer:Buffer.from([0xff,0xfe,0x00]),file_name:'encoding.csv'},
  ]
  for(const body of invalid) {
    assert.equal(store.write('POST',parts,body).code,400)
    assert.deepEqual(readFileSync(store.file(domain,id,'download').path),buffer)
    assert.equal(store.read([domain,'datasets',id]).data.imported,true)
  }
  assert.equal(store.write('POST',[domain,'datasets','DS-WAVE-0001','upload'],{buffer,file_name:'x.csv'}).code,400)
  assert.equal(store.write('POST',[domain,'datasets','missing','upload'],{buffer,file_name:'x.csv'}).code,404)
})

test('CSV handles quoted commas, newlines and BOM, with bounded preview but full download',t=>{
  assert.deepEqual(parseCsv('\uFEFFid,note\r\n1,"a,b"\r\n2,"hello\nworld"\r\n').rows,[['1','a,b'],['2','hello\nworld']])
  assert.throws(()=>parseCsv('a,b\n1,"unfinished'))
  assert.throws(()=>parseCsv('a,a\n1,2'))
  const {store}=setup(t)
  const content='station_id,x,y,z,elevation_m,comment\n'+Array.from({length:70},(_,i)=>`STA-${i},${i},0,0,0,"<script>alert(1)</script>, literal"`).join('\n')
  assert.equal(store.write('POST',['geodynamics','datasets','DS-WAVE-0004','upload'],{buffer:Buffer.from(content),file_name:'stations.csv'}).code,200)
  const preview=store.read(['geodynamics','datasets','DS-WAVE-0004','preview']).data
  assert.equal(preview.rows.length,50)
  assert.equal(preview.total_rows,70)
  assert.equal(preview.truncated,true)
  assert.match(preview.rows[0][5],/<script>/,'display component must render cells as escaped text')
})

test('JSON and binary schema errors fail before saving, and removed physical files are not marked ready',t=>{
  const {store,options}=setup(t)
  assert.equal(store.write('POST',['geodynamics','datasets','DS-WAVE-0002','upload'],{buffer:Buffer.from('{}'),file_name:'source.json'}).code,400)
  assert.equal(store.write('POST',['llm','datasets','DS-LLM-0003','upload'],{buffer:Buffer.from('not a tensor'),file_name:'bad.safetensors'}).code,400)
  const sample=store.file('llm','DS-LLM-0003','sample')
  const corrupted=readFileSync(sample.path); corrupted.writeBigUInt64LE(999999n)
  assert.equal(store.write('POST',['llm','datasets','DS-LLM-0003','upload'],{buffer:corrupted,file_name:sample.name}).code,400)
  const json=store.file('geodynamics','DS-WAVE-0002','sample'), value=JSON.parse(readFileSync(json.path,'utf8'))
  value.dataset_id='DS-WAVE-0003'
  assert.equal(store.write('POST',['geodynamics','datasets','DS-WAVE-0002','upload'],{buffer:Buffer.from(JSON.stringify(value)),file_name:'任意震源配置.txt'}).code,200)
  store.write('POST',['geodynamics','datasets','DS-WAVE-0002','upload'],{buffer:readFileSync(json.path),file_name:json.name})
  rmSync(store.file('geodynamics','DS-WAVE-0002','download').path)
  assert.equal(createExperienceStore(options).read(['geodynamics','datasets','DS-WAVE-0002']).data.uploaded,false)
})

test('content validation ignores sample names and metadata, but rejects wrong JSON fields and types',t=>{
  const {store}=setup(t)
  const parts=['geodynamics','datasets','DS-WAVE-0002','upload']
  const file=store.file('geodynamics','DS-WAVE-0002','sample')
  const value=JSON.parse(readFileSync(file.path,'utf8'))
  delete value.dataset_id; delete value.scenario_id; delete value.source_type
  assert.equal(store.write('POST',parts,{buffer:Buffer.from(JSON.stringify(value)),file_name:'我的配置'}).code,200)
  assert.equal(store.read(['geodynamics','datasets','DS-WAVE-0002','preview']).data.format,'JSON')
  const missing=structuredClone(value); delete missing.source_location.x
  assert.match(store.write('POST',parts,{buffer:Buffer.from(JSON.stringify(missing)),file_name:file.name}).message,/缺少字段.*source_location.x/)
  const wrong=structuredClone(value); wrong.time_step_seconds='not a number'
  assert.match(store.write('POST',parts,{buffer:Buffer.from(JSON.stringify(wrong)),file_name:file.name}).message,/time_step_seconds.*类型/)
  assert.equal(store.write('POST',parts,{buffer:Buffer.from('{broken'),file_name:file.name}).code,400)
  const csv=store.file('geodynamics','DS-WAVE-0004','sample')
  assert.equal(store.write('POST',['geodynamics','datasets','DS-WAVE-0004','upload'],{buffer:readFileSync(csv.path),file_name:'观测文件.json'}).code,200)
  assert.equal(store.read(['geodynamics','datasets','DS-WAVE-0004','preview']).data.format,'CSV')
})

test('wave demo station and pick pairs agree with the stated constant-speed source',()=>{
  const root=resolve(import.meta.dirname,'../../mock-data/uploads/geodynamics')
  const source=JSON.parse(readFileSync(resolve(root,'DS-WAVE-0002.json'),'utf8'))
  const stations=parseCsv(readFileSync(resolve(root,'DS-WAVE-0004.csv'),'utf8')).rows
  const picks=parseCsv(readFileSync(resolve(root,'DS-WAVE-0005.csv'),'utf8')).rows
  for(const pick of picks) {
    const station=stations.find(row=>row[0]===pick[1]); assert.ok(station)
    const expected=Math.hypot(+station[1]-source.source_location.x,+station[2]-source.source_location.y,+station[3]-source.source_location.z)/source.assumed_p_velocity_m_s
    assert.ok(Math.abs(+pick[3]-expected)<1e-6)
  }
})
