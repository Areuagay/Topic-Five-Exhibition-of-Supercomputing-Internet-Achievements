import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutDag, dagViewport, DAG_NODE_GAP } from '../utils/dag-layout.ts'
import { buildOperatorWorkflow, OPERATOR_DEPENDENCIES } from '../../backend/workflow-engine.js'

const edges = pairs => pairs.map(([source, target]) => ({ source, target }))
const positions = layout => new Map(layout.nodes.map(node => [node.id, node]))

function assertClearRoutes(layout) {
  const nodes = positions(layout)
  for (const route of layout.edges) {
    const source = nodes.get(route.source), target = nodes.get(route.target)
    assert.ok(source.x + source.width < target.x, `${route.id}: dependencies flow right`)
    assert.deepEqual(route.points[0], { x: source.x + source.width, y: source.y + source.outputs.find(p => p.id === route.sourceHandle).y })
    assert.deepEqual(route.points.at(-1), { x: target.x, y: target.y + target.inputs.find(p => p.id === route.targetHandle).y })
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i]
      assert.ok(a.x === b.x || a.y === b.y, 'orthogonal segment')
      for (const node of layout.nodes) {
        const crosses = a.x === b.x
          ? a.x > node.x + .01 && a.x < node.x + node.width - .01 && Math.max(a.y, b.y) > node.y + .01 && Math.min(a.y, b.y) < node.y + node.height - .01
          : a.y > node.y + .01 && a.y < node.y + node.height - .01 && Math.max(a.x, b.x) > node.x + .01 && Math.min(a.x, b.x) < node.x + node.width - .01
        assert.equal(crosses, false, `${route.source} -> ${route.target} must not pass through ${node.id}`)
      }
    }
    for (const point of route.points) assert.ok(point.x >= 0 && point.y >= 0 && point.x <= layout.width && point.y <= layout.height)
  }
  for (const a of layout.nodes) for (const b of layout.nodes) {
    if (a.id === b.id || a.x !== b.x || a.y >= b.y) continue
    assert.ok(b.y - a.y - a.height >= DAG_NODE_GAP - .01, 'branch spacing accounts for measured node heights')
  }
}

test('reorders shuffled parallel branches instead of drawing a crossing between them', async () => {
  const nodes = ['prepare', 'a1', 'b1', 'b2', 'a2', 'join'].map(id => ({ id }))
  const connections = edges([['prepare', 'a1'], ['prepare', 'b1'], ['a1', 'a2'], ['b1', 'b2'], ['a2', 'join'], ['b2', 'join']])
  const layout = await layoutDag(nodes, connections), byId = positions(layout)
  assertClearRoutes(layout)
  assert.equal(byId.get('a1').y, byId.get('a2').y)
  assert.equal(byId.get('b1').y, byId.get('b2').y)
  assert.deepEqual(await layoutDag([...nodes].reverse(), [...connections].reverse()), layout, 'input array order must not shuffle the drawing')
})

test('unequal branches are centered between their split and join without fake nodes or collisions', async () => {
  for (const longBranch of ['a', 'b']) {
    const shortBranch = longBranch === 'a' ? 'b' : 'a'
    const nodes = ['prepare', 'a', 'b', 'second', 'join', 'post'].map(id => ({ id, height: id === 'second' ? 180 : 96 }))
    const connections = edges([['prepare', 'a'], ['prepare', 'b'], [longBranch, 'second'], ['second', 'join'], [shortBranch, 'join'], ['join', 'post']])
    const layout = await layoutDag(nodes, connections), byId = positions(layout)
    assertClearRoutes(layout)
    const start=byId.get('prepare'), join=byId.get('join'), short=byId.get(shortBranch)
    const first=byId.get(longBranch), second=byId.get('second')
    const center=(start.x+start.width+join.x)/2
    assert.equal(short.x+short.width/2,center)
    assert.equal((first.x+second.x+second.width)/2,center)
    assert.ok(byId.get('second').x > byId.get(longBranch).x)
    assert.equal(layout.nodes.length, nodes.length, 'no fake execution nodes to pad a short branch')
    assert.equal(layout.edges.length, connections.length)
  }
})

test('one-, two- and three-operator automotive branches share a common horizontal center',async()=>{
  const workflow=buildOperatorWorkflow('automotive',[
    {id:'prepare'},...Object.keys(OPERATOR_DEPENDENCIES.automotive).map(id=>({id,operator_id:id})),{id:'post'},
  ],3)
  const layout=await layoutDag(workflow.nodes,workflow.edges), nodes=positions(layout)
  const center=(nodes.get('prepare').x+nodes.get('prepare').width+nodes.get('post').x)/2
  for (const branch of [
    ['auto-thermal-flow','auto-species-transport','auto-combustion'],
    ['isothermal-film','film-evolution'], ['auto-external-flow'], ['ipfno'],
    ['oil-multiphase-transport','oil-multiphase-interface'], ['wading-free-surface','wading-impact'],
  ]) {
    const first=nodes.get(branch[0]),last=nodes.get(branch.at(-1))
    assert.equal((first.x+last.x+last.width)/2,center,branch.join(' -> '))
  }
  assertClearRoutes(layout)
  assert.deepEqual(await layoutDag([...workflow.nodes].reverse(),[...workflow.edges].reverse()),layout)
})

test('all six operator catalogs route actual dependency edges around nodes with distinct ports', async () => {
  for (const [domain, rules] of Object.entries(OPERATOR_DEPENDENCIES)) {
    const workflow = buildOperatorWorkflow(domain, [
      { id: 'prepare' }, ...Object.keys(rules).map(id => ({ id, operator_id: id })), { id: 'post' },
    ], 3)
    const layout = await layoutDag(workflow.nodes, workflow.edges)
    assertClearRoutes(layout)
    for (const node of layout.nodes) {
      assert.equal(new Set(node.inputs.map(port => port.y)).size, node.inputs.length, domain)
      assert.equal(new Set(node.outputs.map(port => port.y)).size, node.outputs.length, domain)
    }
  }
})

test('initial view retains readable scale while explicit overview includes the whole graph', () => {
  const graph = { width: 3000, height: 700 }
  for (const [width, height] of [[1100, 390], [350, 340]]) {
    const initial = dagViewport(graph, width, height)
    assert.equal(initial.zoom, .72)
    const overview = dagViewport(graph, width, height, true)
    assert.ok(overview.x >= 0 && overview.y >= 0)
    assert.ok(overview.x + graph.width * overview.zoom <= width + .01)
    assert.ok(overview.y + graph.height * overview.zoom <= height + .01)
  }
})
