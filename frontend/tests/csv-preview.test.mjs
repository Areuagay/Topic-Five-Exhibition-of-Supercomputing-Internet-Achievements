import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsvPreview, previewKind } from '../utils/artifact-preview.ts'
test('CSV preserves quoted commas, escaped quotes, multiline cells, BOM and empty trailing fields', () => {
  const result = parseCsvPreview('\uFEFFname,note,value\r\nA,"first, second\nnext ""line""",0\r\nB,,\r\n')
  assert.deepEqual(result.rows, [['name','note','value'],['A','first, second\nnext "line"','0'],['B','','']])
  assert.equal(result.truncated, false)
})
test('CSV bounds rows and columns and omits partial row after byte truncation', () => {
  assert.deepEqual(parseCsvPreview('a,b\n1,2\n3,4', false, 2).rows, [['a','b'],['1','2']])
  assert.equal(parseCsvPreview('a,b\n1,2\n3,4', false, 2).truncated, true)
  assert.deepEqual(parseCsvPreview('a,b\n1,"incomplete', true).rows, [['a','b']])
  assert.equal(parseCsvPreview('a,b,c', false, 10, 2).truncated, true)
  assert.throws(() => parseCsvPreview('a,"unclosed'), /CSV/)
  assert.deepEqual(parseCsvPreview('').rows, [])
})
test('preview types match supported renderers rather than exposing unsupported binary previews', () => {
  assert.equal(previewKind({ name:'data.CSV' }), 'csv')
  assert.equal(previewKind({ name:'model.bin', format:'bin' }), undefined)
  assert.equal(previewKind({ name:'image.svg' }), 'image')
  assert.equal(previewKind({ name:'run.log' }), 'text')
  assert.equal(previewKind({ name:'data.json', preview_supported:false }), undefined)
})
