import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCENARIO_VIDEOS, listScenarioVideos, resolveScenarioVideo, sendScenarioVideo } from '../scenario-videos.js'

test('scene recordings are isolated by domain and scenario, without assuming old operator IDs', t => {
  const root = mkdtempSync(join(tmpdir(), 'topic5-videos-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const media = join(root, 'media')
  mkdirSync(media)
  writeFileSync(join(media, 'vehicle-models.mp4'), 'recording')
  const cars = listScenarioVideos('automotive', 'vehicle-crash', root, media)
  assert.equal(cars.length, 4)
  assert.equal(cars[0].available, true)
  assert.equal(cars[1].available, false)
  assert.equal(cars[0].source_type, 'provided')
  assert.equal('source_path' in cars[0], false)
  assert.equal('operator_id' in cars[0], false)
  assert.equal(listScenarioVideos('uav', 'path-planning', root, media).length, 2)
  assert.deepEqual(listScenarioVideos('uav', 'vehicle-crash', root, media), [])
  assert.deepEqual(listScenarioVideos('automotive', 'fatigue-life', root, media), [])
  assert.deepEqual(listScenarioVideos('uav', 'swarm-coordination', root, media), [])
  assert.equal(resolveScenarioVideo('../vehicle-models', root, media), null)
  assert.equal(resolveScenarioVideo('toString', root, media), null)
})

test('both the supplied folder and portable deployment media are supported', t => {
  const root = mkdtempSync(join(tmpdir(), 'topic5-video-paths-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const video = SCENARIO_VIDEOS[0]
  const supplied = join(root, 'AAA/课题五递交视频-12', video.source_path)
  mkdirSync(join(supplied, '..'), { recursive: true })
  writeFileSync(supplied, 'original')
  assert.equal(resolveScenarioVideo(video.id, root, '').path, supplied)
  const packaged = join(root, 'artifacts/videos', `${video.id}.mp4`)
  mkdirSync(join(packaged, '..'), { recursive: true })
  writeFileSync(packaged, 'packaged')
  assert.equal(resolveScenarioVideo(video.id, root, '').path, packaged)
  // An explicit media directory must not silently serve an unrelated fallback.
  assert.equal(resolveScenarioVideo(video.id, root, join(root, 'missing')), null)
})

test('streaming supports playback, HEAD, seeking and invalid ranges without reading whole videos', async t => {
  const root = mkdtempSync(join(tmpdir(), 'topic5-video-http-'))
  const path = join(root, 'sample.mp4')
  const bytes = Buffer.from('0123456789abcdef')
  writeFileSync(path, bytes)
  const server = createServer((req, res) => sendScenarioVideo(req, res, { path, size: bytes.length }))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/video`
  const full = await fetch(url)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('content-type'), 'video/mp4')
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes)
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.headers.get('content-length'), '16')
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  for (const [range, expected, contentRange] of [
    ['bytes=0-0', '0', 'bytes 0-0/16'],
    ['bytes=5-9', '56789', 'bytes 5-9/16'],
    ['bytes=12-', 'cdef', 'bytes 12-15/16'],
    ['bytes=-4', 'cdef', 'bytes 12-15/16'],
    ['bytes=12-999', 'cdef', 'bytes 12-15/16'],
  ]) {
    const response = await fetch(url, { headers: { Range: range } })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-range'), contentRange)
    assert.equal(await response.text(), expected)
  }
  for (const range of ['bytes=16-', 'bytes=9-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'invalid']) {
    const response = await fetch(url, { headers: { Range: range } })
    assert.equal(response.status, 416, range)
    assert.equal(response.headers.get('content-range'), 'bytes */16')
    assert.equal((await response.arrayBuffer()).byteLength, 0)
  }
})
