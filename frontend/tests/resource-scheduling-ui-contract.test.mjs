import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { useResourceLoadStore } from '../stores/resource-load.ts'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('资源调度复用平台四中心内容并保留两位小数', async () => {
  const step = await read('../components/experience/ExperienceResourceStep.vue')

  assert.match(step, /import \{ applyDatasetLoad } from '~\/utils\/resource-load'/)
  assert.match(step, /clusterLoad\?: Record<string, number>/)
  assert.match(step, /props\.clusterLoad\?\.\[cluster\.id\]/)
  assert.match(step, /cpuValue\(cluster\)\.toFixed\(2\)/)
  assert.match(step, /gpuValue\(cluster\)\.toFixed\(2\)/)
  assert.match(step, /clusterStatusLabel\(cluster\)/)
  assert.match(step, /resource_status === 'highLoad'/)
})

test('所有领域共享同一份上传负载', async () => {
  const flow = await read('../components/experience/ExperienceFlow.vue')

  assert.match(flow, /useResourceLoadStore\(\)/)
  assert.match(flow, /registerUpload\(updated\.dataset_id, supportedClusters\.value\)/)
  assert.match(flow, /unregisterUpload\(updated\.dataset_id\)/)
  assert.match(flow, /:cluster-load="resourceLoadStore\.counts"/)
  assert.doesNotMatch(flow, /experience-session-uploads-/)
})

test('上传负载按中心累计且同一数据不重复计数', () => {
  setActivePinia(createPinia())
  const store = useResourceLoadStore()

  store.registerUpload('DS-A', ['changsha', 'guangzhou'])
  store.registerUpload('DS-A', ['changsha', 'guangzhou'])
  store.registerUpload('DS-B', ['changsha'])

  assert.equal(store.counts.changsha, 2)
  assert.equal(store.counts.guangzhou, 1)
  assert.equal(store.counts.kunshan, undefined)

  store.unregisterUpload('DS-A')
  assert.equal(store.counts.changsha, 1)
  assert.equal(store.counts.guangzhou, 0)

  store.unregisterUpload('DS-UNKNOWN')
  assert.equal(store.counts.changsha, 1)
})

test('上传负载工具单次增幅不超过 0.5 个百分点', async () => {
  const util = await read('../utils/resource-load.ts')
  assert.match(util, /DATASET_LOAD_GAIN_PER_UPLOAD = 0\.004/)
  assert.match(util, /Math\.round\(value \* 100\) \/ 100/)
})
