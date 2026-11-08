<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { RotateCcw } from '@lucide/vue'
import ExperienceDataPrepStep from '~/components/experience/ExperienceDataPrepStep.vue'
import type { DatasetItem } from '~/types'
import type { useApi } from '~/composables/useApi'

useHead({ title: '上传动效演示' })
const initial: DatasetItem = {
  dataset_id: 'upload-motion-demo', scenario_id: 'wave-propagation',
  name: '地表台站观测系统布设', type: 'station_geometry', format: 'CSV',
  size_bytes: 0, grid: '10 条记录 · 5 列', status: 'pending', uploaded: false,
}
const rows = ref<DatasetItem[]>([{ ...initial }])
const table = ref<InstanceType<typeof ExperienceDataPrepStep>>()
const playing = ref(false)
const iteration = ref(0)
const modes = [
  { id: 'normal', label: '正常上传', description: '6 秒上传 · 2 秒确认，可中途取消。' },
  { id: 'stall', label: '网络卡顿', description: '进度在 40% 停顿 6 秒，然后恢复上传。' },
  { id: 'failure', label: '上传失败', description: '进度到 60% 时连接中断，点击“重试上传”可恢复。' },
] as const
type DemoMode = typeof modes[number]['id']
const mode = ref<DemoMode>('normal')
let attempts = 0

// Only this demonstration supplies the slow local transfer. The normal page
// continues to use the real upload API and its actual network progress.
const demoUpload: ReturnType<typeof useApi>['uploadDataset'] = (_domain, _id, file, options) => new Promise((resolve, reject) => {
  const started = performance.now()
  const selectedMode = mode.value
  const shouldFail = selectedMode === 'failure' && attempts++ === 0
  const transferDuration = selectedMode === 'stall' ? 12000 : 6000
  let confirming = false
  const cleanup = () => { clearInterval(timer); options.signal.removeEventListener('abort', abort) }
  const abort = () => { cleanup(); reject(new DOMException('已取消上传', 'AbortError')) }
  const timer = setInterval(() => {
    const elapsed = performance.now() - started
    const progress = selectedMode === 'stall'
      ? elapsed < 2400 ? elapsed / 2400 * 40 : elapsed < 8400 ? 40 : 40 + (elapsed - 8400) / 3600 * 60
      : elapsed / 6000 * 100
    if (!confirming) options.onProgress(Math.min(100, Math.round(progress)))
    if (shouldFail && elapsed >= 3600) { cleanup(); reject(new Error('网络连接中断，上传失败。请重试。')); return }
    if (elapsed >= transferDuration && !confirming) { confirming = true; options.onTransferred() }
    if (elapsed >= transferDuration + 2000) {
      cleanup()
      resolve({ ...initial, uploaded: true, status: 'ready', size_bytes: file.size,
        source: '演示上传', updated_at: new Date().toISOString(), preview_available: false })
    }
  }, 100)
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) abort()
})
const demoReset: ReturnType<typeof useApi>['resetDataset'] = async () => ({ ...initial })
function updateRow(row: DatasetItem) { rows.value = [row] }
async function play(replace = false) {
  if (!replace && (playing.value || table.value?.busy)) return
  const current = ++iteration.value
  attempts = 0
  playing.value = true
  rows.value = [{ ...initial }]
  await nextTick()
  const csv = 'station_id,x_km,y_km,z_km,weight\n' + Array.from({ length: 10 }, (_, i) => `ST${String(i + 1).padStart(2, '0')},${i},${i * 2},0,1\n`).join('')
  const file = new File([csv], 'stations.csv', { type: 'text/csv' })
  try { await table.value?.handleUpload(rows.value[0], file) }
  finally { if (current === iteration.value) playing.value = false }
}
function changeMode(value: DemoMode) { mode.value = value; void play(true) }
onMounted(() => { void play() })
</script>

<template>
  <main class="upload-demo experience-polished">
    <header class="demo-heading">
      <div><h1>上传动效演示</h1><p>{{ modes.find(item => item.id === mode)?.description }}</p></div>
      <button class="sc-action" type="button" :disabled="playing || table?.busy" @click="play()"><RotateCcw :size="16" aria-hidden="true" />重新演示</button>
    </header>
    <div class="demo-modes" role="group" aria-label="上传演示模式"><button v-for="item in modes" :key="item.id" class="sc-action sc-action--small" type="button" :aria-pressed="mode === item.id" @click="changeMode(item.id)">{{ item.label }}</button></div>
    <ExperienceDataPrepStep :key="iteration" ref="table" domain="geodynamics" scenario-id="wave-propagation"
      :datasets="rows" :params="[]" :cluster-name="id => id"
      :upload-request="demoUpload" :reset-request="demoReset" :preview-on-upload="false"
      @updated="updateRow" />
  </main>
</template>

<style scoped>
.upload-demo { max-width:1600px; margin:40px auto; padding:0 20px; }
.demo-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; margin-bottom:24px; }
.demo-heading h1 { margin:0; font-size:24px; font-weight:650; color:var(--scnet-text); }
.demo-heading p { margin:6px 0 0; font-size:14px; color:var(--scnet-text-secondary); }
.demo-modes { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
.upload-demo :deep(.exp-scenario-details) { display:none; }
@media (max-width:760px) { .upload-demo { margin:20px auto; padding:0 8px; } }
</style>
