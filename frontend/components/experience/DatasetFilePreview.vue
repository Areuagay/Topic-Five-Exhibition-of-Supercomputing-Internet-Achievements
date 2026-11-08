<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download } from '@lucide/vue'
import type { DatasetItem, DatasetPreview } from '~/types'
import { useApi } from '~/composables/useApi'
import { formatBytes } from '~/composables/useFormat'

const props = defineProps<{ modelValue: boolean; domain: string; dataset?: DatasetItem }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const { getDatasetPreview, datasetFileUrl } = useApi()
const preview = ref<DatasetPreview>()
const pending = ref(false)
const error = ref('')
function downloadFile() {
  if (props.dataset) window.location.assign(datasetFileUrl(props.domain, props.dataset.dataset_id, 'download'))
}
let generation = 0
async function load() {
  const current = ++generation
  preview.value = undefined
  error.value = ''
  if (!props.modelValue || !props.dataset) { pending.value = false; return }
  pending.value = true
  try {
    const result = await getDatasetPreview(props.domain, props.dataset.dataset_id)
    if (current === generation) preview.value = result
  } catch (cause) {
    if (current === generation) error.value = (cause as { data?: { message?: string }; message?: string }).data?.message || (cause as Error).message || '预览加载失败'
  } finally { if (current === generation) pending.value = false }
}
watch(() => [props.modelValue, props.domain, props.dataset?.dataset_id, props.dataset?.updated_at], load, { immediate: true })
const plot = computed(() => {
  const data = preview.value
  if (!data || data.kind !== 'table' || !data.rows.length) return null
  const station = props.dataset?.type === 'station_geometry'
  const travel = props.dataset?.type === 'travel_time'
  if (!station && !travel) return null
  const xi = data.headers.indexOf('x'), yi = data.headers.indexOf(station ? 'y' : 'travel_time_s')
  if (yi < 0 || (station && xi < 0)) return null
  const values = data.rows.map((row, i) => ({ x: station ? Number(row[xi]) : i + 1, y: Number(row[yi]), label: row[0] }))
  if (values.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const xs = values.map(p => p.x), ys = values.map(p => p.y)
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys)
  return { title: station ? '台站平面分布（x / y）' : '初至走时（秒）', xmin, xmax, ymin, ymax,
    points: values.map(p => ({ ...p, cx: 55 + (p.x - xmin) / (xmax - xmin || 1) * 590, cy: 165 - (p.y - ymin) / (ymax - ymin || 1) * 135 })) }
})
</script>

<template>
  <el-dialog :model-value="modelValue" :title="dataset?.name || '文件预览'" :show-close="false" width="min(920px, 94vw)" align-center append-to-body destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <template #header="{ titleId }">
      <header class="preview-heading">
        <div class="preview-title">
          <h2 :id="titleId">{{ dataset?.name || '文件预览' }}</h2>
          <span v-if="preview || dataset?.format" class="preview-format">{{ preview?.format || dataset?.format }}</span>
        </div>
        <div v-if="preview" class="preview-metadata"><span>{{ formatBytes(preview.size_bytes) }}</span><span v-if="preview.summary">{{ preview.summary }}</span></div>
      </header>
    </template>
    <div class="dataset-preview" :aria-busy="pending">
      <p v-if="pending" role="status">正在加载…</p>
      <div v-else-if="error" role="alert" class="preview-error">{{ error }} <button type="button" class="sc-action" @click="load">重新加载</button></div>
      <template v-else-if="preview">
        <div v-if="plot" class="preview-chart">
          <strong>{{ plot.title }}</strong>
          <svg viewBox="0 0 700 200" role="img" :aria-label="plot.title">
            <path d="M55 20 V165 H655" fill="none" stroke="#cbd5e1" />
            <text x="8" y="30">{{ Number(plot.ymax.toFixed(3)) }}</text><text x="8" y="165">{{ Number(plot.ymin.toFixed(3)) }}</text>
            <text x="55" y="190">{{ plot.xmin }}</text><text x="620" y="190">{{ plot.xmax }}</text>
            <circle v-for="point in plot.points" :key="point.label" :cx="point.cx" :cy="point.cy" r="5" fill="#2563eb"><title>{{ point.label }}: {{ point.x }}, {{ point.y }}</title></circle>
          </svg>
        </div>
        <div v-if="preview.kind === 'table'" class="preview-table" tabindex="0" aria-label="上传数据表格">
          <table><thead><tr><th scope="col">#</th><th v-for="header in preview.headers" :key="header" scope="col">{{ header }}</th></tr></thead>
            <tbody><tr v-for="(row, index) in preview.rows" :key="index"><td>{{ index + 1 }}</td><td v-for="(cell, col) in row" :key="col">{{ cell }}</td></tr></tbody>
          </table>
        </div>
        <pre v-else-if="preview.text" class="preview-text">{{ preview.text }}</pre>
        <p v-else class="preview-empty">此格式暂不支持在线预览</p>
        <p v-if="preview.truncated" class="preview-limit">{{ preview.kind === 'table' ? `已显示前 ${preview.rows.length} 条，共 ${preview.total_rows} 条` : '已显示前 30,000 字符' }}</p>
      </template>
    </div>
    <template #footer><div class="preview-footer"><button v-if="preview && dataset" type="button" class="sc-action" @click="downloadFile"><Download aria-hidden="true" />下载文件</button><button type="button" class="sc-action" @click="emit('update:modelValue', false)">关闭</button></div></template>
  </el-dialog>
</template>

<style scoped>
.preview-heading { display:flex; align-items:center; flex-wrap:wrap; justify-content:space-between; gap:12px 24px; padding:8px 0 20px; border-bottom:1px solid #e2e8f0; }
.preview-title { display:flex; align-items:center; gap:12px; min-width:0; }
.preview-heading h2 { margin:0; color:#25344a; font:650 24px/1.4 var(--scnet-font-sans); letter-spacing:.01em; overflow-wrap:anywhere; }
.preview-format { flex:none; padding:4px 9px; border:1px solid #dbe7f8; border-radius:6px; background:#eff5fd; color:#3565a5; font:600 13px/1.5 var(--scnet-font-mono); }
.preview-metadata { display:flex; align-items:center; flex-wrap:wrap; gap:12px; color:#617289; font-size:14px; line-height:1.6; font-variant-numeric:tabular-nums; }
.preview-metadata span + span { border-left:1px solid #dbe2ea; padding-left:10px; }
.dataset-preview { color:#334155; min-height:120px; max-height:calc(88dvh - 200px); overflow:auto; padding-right:4px; }
.preview-limit, .preview-empty { color:#64748b; font-size:13px; line-height:1.7; }
.preview-empty { text-align:center; padding:32px 0; }
.preview-footer { display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #e2e8f0; padding-top:16px; }
.preview-footer .sc-action { min-width:100px; font-size:14px; }
.preview-error { padding:16px; color:#b42318; background:#fff5f5; }
.preview-table { overflow:auto; border:1px solid #e2e8f0; border-radius:8px; }
table { border-collapse:separate; border-spacing:0; width:100%; font-size:14px; text-align:left; }
th, td { padding:10px 14px; border-bottom:1px solid #e2e8f0; white-space:pre-wrap; overflow-wrap:anywhere; min-width:90px; max-width:360px; }
th { position:sticky; top:0; background:#eff4fa; color:#475569; white-space:nowrap; }
tbody tr:nth-child(even) { background:#f8fafc; }
.preview-text { margin:0; padding:18px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; font:14px/1.75 var(--scnet-font-mono); white-space:pre-wrap; overflow-wrap:anywhere; }
.preview-chart { margin:0 0 18px; padding:16px 18px 6px; border:1px solid #e2e8f0; border-radius:8px; }
.preview-chart strong { font-size:14px; }
.preview-chart svg { width:100%; max-height:200px; display:block; }
.preview-chart text { fill:#64748b; font-size:12px; }
@media (max-width:600px) {
  .preview-heading h2 { font-size:20px; }
  .preview-title { gap:8px; }
  .preview-metadata { font-size:13px; }
  .preview-chart { padding:12px 10px 4px; }
}
</style>
