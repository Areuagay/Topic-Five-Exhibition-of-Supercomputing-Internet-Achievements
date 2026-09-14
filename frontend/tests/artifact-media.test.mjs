import assert from 'node:assert/strict'
import test from 'node:test'
test('workspace media excludes legacy unresolved storage and unsupported previews', async () => {
  const { workspaceMedia } = await import('../utils/workspace.ts')
  const artifact = { id: 'a', name: 'stress.png', type: 'image', format: 'png', preview_url: '/api/v1/files/a/preview' }
  assert.deepEqual(workspaceMedia([artifact, { ...artifact, id: 'old', storage_path: 'gfs://missing' }, { ...artifact, id: 'disabled', preview_supported: false }]), [artifact])
  assert.equal(workspaceMedia([{ ...artifact, storage_path: 'gfs://resolved', preview_supported: true }]).length, 1)
})
