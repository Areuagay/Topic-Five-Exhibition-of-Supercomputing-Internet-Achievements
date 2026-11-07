import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { analyzeWorkflow, advanceWorkflow, buildOperatorWorkflow, OPERATOR_DEPENDENCIES } from '../workflow-engine.js'
import { createExperienceStore } from '../experience-store.js'

function plan(domain, ids, ticks=3) {
  return buildOperatorWorkflow(domain,[
    {id:'prepare',name:'输入数据准备',progress:0,status:'running'},
    ...ids.map((id,i)=>({id:`op-${i}`,operator_id:id,name:id,progress:0,status:'pending'})),
    {id:'post',name:'结果输出',progress:0,status:'pending'},
  ],ticks)
}
const get = (workflow, name) => workflow.nodes.find(n=>n.operator_id===name||n.id===name)
function step(workflow) {
  const before=new Map(workflow.nodes.map(n=>[n.id,{...n}]))
  const done=advanceWorkflow(workflow,3,120)
  for(const n of workflow.nodes) if(n.progress>before.get(n.id).progress) {
    for(const edge of workflow.edges.filter(e=>e.target===n.id)) assert.equal(before.get(edge.source).status,'success',`${n.name} must wait for ${edge.source}`)
  }
  return done
}

test('parallel branches differ in speed, wait at the join, and cannot release output early',()=>{
  const workflow=plan('geodynamics',['uzawa','citcoms-global','citcoms-regional'])
  assert.equal(analyzeWorkflow(workflow).parallel,true)
  for(let i=0;i<3;i++) step(workflow)
  assert.equal(workflow.nodes.filter(n=>n.status==='running').length,3)
  for(let i=0;i<3;i++) step(workflow)
  const branches=workflow.nodes.filter(n=>n.operator_id)
  assert.ok(branches.some(n=>n.progress===100&&n.waiting_at_join))
  assert.ok(branches.some(n=>n.progress>0&&n.progress<100))
  assert.equal(get(workflow,'post').progress,0)
  assert.equal(get(workflow,'post').status,'pending')
  while(branches.some(n=>n.status!=='success')) { assert.equal(get(workflow,'post').progress,0); step(workflow) }
  assert.equal(get(workflow,'post').progress,0,'join starts only on the following tick')
  assert.ok(branches.every(n=>!n.waiting_at_join))
  let done=false;for(let i=0;i<3;i++)done=step(workflow)
  assert.equal(done,true)
  assert.ok(workflow.nodes.every(n=>n.progress===100))
})

test('drug preparation forks, docking joins both inputs, and downstream analysis joins docking',()=>{
  const workflow=plan('drug',['pose-energy-extraction','molecular-docking-cpu','receptor-grid-generation','ligand-preparation','receptor-preparation','molecular-docking-gpu','molecule-generation-diffusion'])
  const {incoming}=analyzeWorkflow(workflow)
  assert.deepEqual(new Set(incoming.get(get(workflow,'molecular-docking-cpu').id)),new Set([get(workflow,'ligand-preparation').id,get(workflow,'receptor-grid-generation').id]))
  assert.deepEqual(incoming.get(get(workflow,'ligand-preparation').id),[get(workflow,'molecule-generation-diffusion').id],'missing conversion stage contracts to selected upstream input')
  let done=false;for(let i=0;i<100&&!done;i++)done=step(workflow)
  assert.ok(done)
})

test('known serial chains keep uniform timing and unknown operators retain selection order',()=>{
  const workflow=plan('dft',['symtopo-topology','symtopo-band','vasp-dft','symtopo-vasp-input'])
  const graph=analyzeWorkflow(workflow)
  assert.equal(graph.parallel,false)
  assert.ok(workflow.nodes.every(n=>!n.duration_ticks))
  let ticks=0;while(!step(workflow))ticks++
  assert.equal(ticks+1,workflow.nodes.length*3)
  const legacy=plan('geodynamics',['fd-wave-solver','fft-operator','sparse-matrix'])
  assert.deepEqual(legacy.edges,legacy.nodes.slice(1).map((n,i)=>({source:legacy.nodes[i].id,target:n.id})))
})

test('failure blocks join and output; malformed graphs are rejected',()=>{
  const workflow=plan('geodynamics',['citcoms-global','citcoms-regional'])
  for(let i=0;i<4;i++)step(workflow)
  get(workflow,'citcoms-global').status='failed'
  for(let i=0;i<10;i++) assert.equal(step(workflow),false)
  assert.equal(get(workflow,'post').progress,0)
  assert.equal(get(workflow,'post').status,'blocked')
  assert.throws(()=>analyzeWorkflow({nodes:[{id:'a'},{id:'b'}],edges:[{source:'a',target:'b'},{source:'b',target:'a'}]}),/循环/)
  assert.throws(()=>analyzeWorkflow({nodes:[{id:'a'}],edges:[{source:'a',target:'missing'}]}),/无效/)
})

test('all registered operators have explicit rules and each domain graph can finish',()=>{
  for(const [domain,rules] of Object.entries(OPERATOR_DEPENDENCIES)) {
    const ops=JSON.parse(readFileSync(resolve(import.meta.dirname,`../../mock-data/${domain}/operators.json`),'utf8')).data
    assert.deepEqual(new Set(Object.keys(rules)),new Set(ops.map(op=>op.name)))
    const workflow=plan(domain,ops.map(op=>op.name).reverse())
    let done=false;for(let i=0;i<300&&!done;i++)done=step(workflow)
    assert.ok(done,domain)
  }
})

test('poll cadence and restart preserve branch progress and only expose results after final output',t=>{
  const dirs=[0,1].map(()=>mkdtempSync(resolve(tmpdir(),'topic5-dag-')))
  t.after(()=>dirs.forEach(dir=>rmSync(dir,{recursive:true,force:true})))
  let time=Date.parse('2026-11-08T00:00:00Z')
  const options=dirs.map(runtimeDir=>({dataDir:resolve(import.meta.dirname,'../../mock-data'),runtimeDir,now:()=>time}))
  const stores=options.map(createExperienceStore)
  const ids=stores.map(store=>store.write('POST',['geodynamics','scenarios','tectonic-evolution','operators','submit'],{operator_ids:['uzawa','citcoms-global','citcoms-regional']}).data.run_id)
  const start=time
  for(let i=1;i<=6;i++){time=start+i*1300;stores[0].read(['geodynamics','runs',ids[0]])}
  const a=stores[0].read(['geodynamics','runs',ids[0]])
  const b=stores[1].read(['geodynamics','runs',ids[1]])
  assert.deepEqual(a.data.workflow,b.data.workflow)
  assert.equal(a.data.has_result,false)
  assert.equal(a.data.workflow.nodes.find(n=>n.id==='post').progress,0)
  assert.ok(a.data.workflow.nodes.some(n=>n.waiting_at_join))
  stores[0]=createExperienceStore(options[0])
  assert.deepEqual(stores[0].read(['geodynamics','runs',ids[0]]).data.workflow,a.data.workflow)
  assert.ok(a.data.workflow.nodes.every(n=>n._elapsed_ticks===undefined))
  time=start+240000
  const finished=stores.map((store,i)=>store.read(['geodynamics','runs',ids[i]]).data)
  assert.equal(finished[0].status,'success')
  assert.equal(finished[0].has_result,true)
  assert.equal(finished[0].end_time,finished[1].end_time)
  assert.deepEqual(finished[0].workflow,finished[1].workflow)
})
