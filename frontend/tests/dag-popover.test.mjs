import test from 'node:test'
import assert from 'node:assert/strict'
import { positionDagPopover } from '../utils/dag-popover.ts'
test('clamped bubbles keep their arrow attached to visible node instead of panel center', () => {
  const frame = {width:700,height:450}
  for (const node of [{left:-20,right:100,top:220,bottom:280},{left:620,right:780,top:220,bottom:280}]) {
    const p = positionDagPopover(frame,node,280,124)
    assert.ok(p)
    assert.ok(p.left-140 >= 12 && p.left+140 <= 688)
    const tip = p.left-140+p.arrow
    assert.ok(tip >= Math.max(node.left,0) && tip <= Math.min(node.right,700))
    assert.notEqual(p.arrow,140)
  }
})
test('popover flips below near top and closes when node leaves viewport or no space remains', () => {
  assert.equal(positionDagPopover({width:700,height:450},{left:200,right:380,top:10,bottom:80},280,124)?.placement,'bottom')
  assert.equal(positionDagPopover({width:700,height:450},{left:-200,right:-10,top:220,bottom:280},280,124),null)
  assert.equal(positionDagPopover({width:700,height:100},{left:200,right:380,top:20,bottom:80},280,124),null)
})
