import assert from 'node:assert/strict'
import test from 'node:test'
test('decoded frames are reused including concurrent requests; failures can retry', async () => {
  const { createImageCache } = await import('../utils/image-cache.ts')
  let calls = 0
  const cache = createImageCache(async url => { calls++; if (url === 'bad') throw Error('missing'); return { url } })
  const [a, b] = await Promise.all([cache.get('frame'), cache.get('frame')])
  assert.equal(a, b)
  assert.equal(await cache.get('frame'), a)
  assert.equal(calls, 1)
  await assert.rejects(cache.get('bad'))
  await assert.rejects(cache.get('bad'))
  assert.equal(calls, 3)
})
