<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref } from 'vue'
import { Check, CheckCheck, CloudUpload, Database, FileJson, FileSpreadsheet, FileText, LoaderCircle, LockKeyhole, Trash2, X } from '@lucide/vue'
import ScenarioDetailContent from '~/components/ScenarioDetailContent.vue'
import { getDatasetTypeLabels } from '~/config/scenario-experience'
import { formatBytes, formatTimestamp } from '~/composables/useFormat'
import { useApi } from '~/composables/useApi'
import { uploadDurationMs, uploadPercentage } from '~/utils/experience-simulation'
import type { Benchmark, DatasetItem, ImportResult, ParamField, ScenarioDetail } from '~/types'

const props = defineProps<{
  domain: string; scenarioId: string; detail?: ScenarioDetail; benchmark?: Benchmark[string]
  params: ParamField[]; clusterName: (id: string) => string; datasets: DatasetItem[]
}>()
const emit = defineEmits<{ updated: [dataset: DatasetItem]; imported: [result: ImportResult] }>()
const { uploadDataset, resetDataset, importDatasets } = useApi()
const uploadingId = ref('')
const resettingId = ref('')
const importing = ref(false)
const committing = ref(false)
const uploadProgress = ref(0)
const remainingSeconds = ref(0)
const message = ref('')
const messageError = ref(false)
const busy = computed(() => !!uploadingId.value || !!resettingId.value || importing.value)
const scenarioDatasets = computed(() => props.datasets.filter(item => item.scenario_id === props.scenarioId))
const uploadedCount = computed(() => scenarioDatasets.value.filter(item => item.uploaded).length)
const importedCount = computed(() => scenarioDatasets.value.filter(item => item.imported).length)
const pendingImport = computed(() => scenarioDatasets.value.filter(item => item.uploaded && !item.imported).length)
defineExpose({ handleImport, busy, importing, uploadedCount, pendingImport })
const typeLabels = computed(() => getDatasetTypeLabels(props.domain))
let cancelTransfer: (() => void) | undefined
let disposed = false
const rowFeedback = ref<Record<string, 'uploaded' | 'removed'>>({})
const feedbackTimers = new Map<string, ReturnType<typeof setTimeout>>()
function highlightRow(id: string, state: 'uploaded' | 'removed') {
  clearTimeout(feedbackTimers.get(id))
  rowFeedback.value[id] = state
  feedbackTimers.set(id, setTimeout(() => { delete rowFeedback.value[id]; feedbackTimers.delete(id) }, 1100))
}
function rowClass({ row }: { row: DatasetItem }) {
  return [rowFeedback.value[row.dataset_id] ? `dataset-row--${rowFeedback.value[row.dataset_id]}` : '', uploadingId.value === row.dataset_id ? 'dataset-row--transferring' : ''].filter(Boolean).join(' ')
}
onBeforeUnmount(() => { disposed = true; cancelTransfer?.(); feedbackTimers.forEach(clearTimeout) })
onDeactivated(() => cancelTransfer?.())

function feedback(text: string, failed = false): void { message.value = text; messageError.value = failed }
function errorText(error: unknown): string {
  return (error as { data?: { message?: string } })?.data?.message || '操作失败，请检查服务连接后重试'
}
function simulateUpload(size: number): Promise<boolean> {
  const duration = uploadDurationMs(size)
  const started = performance.now()
  uploadProgress.value = 0
  remainingSeconds.value = Math.ceil(duration / 1000)
  return new Promise(resolve => {
    const timer = setInterval(() => {
      const elapsed = performance.now() - started
      uploadProgress.value = uploadPercentage(elapsed, duration)
      remainingSeconds.value = Math.max(0, Math.ceil((duration - elapsed) / 1000))
      if (elapsed >= duration) { clearInterval(timer); cancelTransfer = undefined; resolve(true) }
    }, 100)
    cancelTransfer = () => { clearInterval(timer); cancelTransfer = undefined; resolve(false) }
  })
}
async function handleUpload(row: DatasetItem): Promise<void> {
  if (row.uploaded || busy.value) return
  uploadingId.value = row.dataset_id
  message.value = ''
  try {
    if (!await simulateUpload(row.size_bytes) || disposed) { if (!disposed) feedback('已取消上传，可重新上传'); return }
    committing.value = true
    const updated = await uploadDataset(props.domain, row.dataset_id)
    if (disposed) return
    uploadProgress.value = 100
    feedback(row.name + ' 上传完成，点击“导入并继续”进入资源调度')
    emit('updated', updated)
    highlightRow(row.dataset_id, 'uploaded')
    // Let the rail reach its endpoint before handing back to the row action.
    await new Promise(resolve => setTimeout(resolve, 240))
  } catch (error) { if (!disposed) feedback(errorText(error), true) }
  finally { uploadingId.value = ''; committing.value = false }
}
async function handleReset(row: DatasetItem): Promise<void> {
  if (row.builtin || !row.uploaded || busy.value) return
  resettingId.value = row.dataset_id
  try {
    const updated = await resetDataset(props.domain, row.dataset_id)
    if (disposed) return
    feedback('已移除上传，数据条目保留，可重新上传')
    emit('updated', updated)
    highlightRow(row.dataset_id, 'removed')
  } catch (error) { if (!disposed) feedback(errorText(error), true) }
  finally { resettingId.value = '' }
}
async function handleImport(): Promise<void> {
  if (busy.value || !uploadedCount.value) return
  importing.value = true
  try {
    const result = await importDatasets(props.domain, props.scenarioId)
    if (disposed) return
    feedback(result.message)
    emit('imported', result)
  } catch (error) { if (!disposed) feedback(errorText(error), true) }
  finally { importing.value = false }
}
</script>

<template>
  <div class="exp-dataprep">
    <section class="exp-block">
      <div class="exp-block-head">
        <div><h3>输入数据</h3><p class="exp-block-description">准备场景输入，上传完成后导入至资源调度。</p></div>
        <div class="exp-block-actions">
          <div class="dataset-readiness" :aria-label="`${uploadedCount} / ${scenarioDatasets.length} 项已就绪`"><span><strong>{{ uploadedCount }}</strong><small> / {{ scenarioDatasets.length }} 项已就绪</small></span><div class="dataset-readiness-track" aria-hidden="true"><i v-for="item in scenarioDatasets" :key="item.dataset_id" :class="{ 'is-ready': item.uploaded }" /></div></div>
        </div>
      </div>
      <div class="dataset-summary">
        <div class="dataset-notice-slot"><Transition name="dataset-notice"><span :key="message" class="dataset-notice" :class="{ 'is-error': messageError, 'has-message': !!message }" :role="messageError ? 'alert' : 'status'" :title="message || '上传所需数据后，点击“导入并继续”；内置数据可直接导入。'">{{ message || '上传所需数据后，点击“导入并继续”；内置数据可直接导入。' }}</span></Transition></div>
        <span class="dataset-imported"><CheckCheck :size="14" aria-hidden="true" />已导入 <strong>{{ importedCount }}</strong> 项</span>
      </div>
      <div v-if="scenarioDatasets.length" class="exp-table-wrap dataset-table">
        <el-table :data="scenarioDatasets" size="default" :row-key="(row: DatasetItem) => row.dataset_id" :row-class-name="rowClass">
          <el-table-column label="数据集" min-width="240">
            <template #default="{ row }"><div class="dataset-identity"><span class="dataset-file-icon" :class="`is-${String(row.format).toLowerCase()}`"><Database v-if="row.builtin" :size="18" aria-hidden="true" /><FileSpreadsheet v-else-if="row.format === 'CSV'" :size="18" aria-hidden="true" /><FileJson v-else-if="row.format === 'JSON'" :size="18" aria-hidden="true" /><FileText v-else :size="18" aria-hidden="true" /></span><div><div class="dataset-name">{{ row.name }}</div><span class="dataset-id">{{ row.dataset_id }} · {{ typeLabels[row.type] ?? row.type }}</span></div></div></template>
          </el-table-column>
          <el-table-column label="格式" width="80"><template #default="{ row }"><span class="dataset-format">{{ row.format }}</span></template></el-table-column>
          <el-table-column prop="grid" label="规模" min-width="120" class-name="mono" />
          <el-table-column label="大小" width="100" class-name="mono"><template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template></el-table-column>
          <el-table-column label="来源" min-width="180" show-overflow-tooltip><template #default="{ row }"><span class="dataset-source">{{ row.uploaded ? row.source : '—' }}</span></template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }">
            <span class="dataset-state" :title="row.uploaded && row.updated_at ? '更新于 ' + formatTimestamp(row.updated_at) : undefined" :class="{ 'is-imported': row.imported, 'is-ready': row.uploaded, 'is-working': (uploadingId === row.dataset_id && uploadProgress < 100) || resettingId === row.dataset_id }"><LoaderCircle v-if="resettingId === row.dataset_id" class="is-spinning" aria-hidden="true" /><i v-else-if="uploadingId === row.dataset_id && uploadProgress < 100" class="dataset-state-dot is-transferring" aria-hidden="true" /><CheckCheck v-else-if="row.imported" aria-hidden="true" /><Check v-else-if="row.uploaded" aria-hidden="true" /><i v-else class="dataset-state-dot" aria-hidden="true" />{{ uploadingId === row.dataset_id && uploadProgress < 100 ? '上传中' : resettingId === row.dataset_id ? '移除中' : row.imported ? '已导入' : row.uploaded ? '就绪' : '待上传' }}</span>
          </template></el-table-column>
          <el-table-column label="操作" width="190" align="right" header-align="right" fixed="right"><template #default="{ row }">
            <div class="dataset-operation-slot">
            <Transition name="upload-state">
            <div v-if="uploadingId === row.dataset_id" key="transferring" class="dataset-transfer" :class="{ 'is-complete': uploadProgress === 100 }" aria-label="上传进度">
              <div class="dataset-transfer-meter" role="progressbar" :aria-valuenow="uploadProgress" aria-valuemin="0" aria-valuemax="100" aria-label="数据上传">
                <div class="dataset-transfer-label"><span>{{ uploadProgress === 100 ? '上传完成' : committing ? '正在确认' : `约 ${remainingSeconds} 秒` }}</span><strong>{{ uploadProgress }}<small>%</small></strong></div>
                <span class="dataset-transfer-track" aria-hidden="true"><span class="dataset-transfer-fill" :style="{ transform: `scaleX(${uploadProgress / 100})` }" /></span>
              </div>
              <button type="button" class="dataset-transfer-cancel" aria-label="取消上传" :disabled="committing" @click="cancelTransfer?.()"><X :size="14" aria-hidden="true" /></button>
            </div>
            <span v-else-if="row.builtin" key="builtin" class="dataset-builtin"><LockKeyhole :size="14" aria-hidden="true" />内置数据</span>
            <button v-else-if="!row.uploaded" key="upload" type="button" class="dataset-upload-button sc-action sc-action--primary sc-action--small" :disabled="busy" @click="handleUpload(row as DatasetItem)"><CloudUpload aria-hidden="true" />上传数据</button>
            <button v-else key="uploaded" type="button" class="dataset-remove-button sc-action sc-action--small" :aria-busy="resettingId === row.dataset_id" :disabled="busy" @click="handleReset(row as DatasetItem)"><LoaderCircle v-if="resettingId === row.dataset_id" class="is-spinning" aria-hidden="true" /><Trash2 v-else aria-hidden="true" />移除上传</button>
            </Transition>
            </div>
          </template></el-table-column>
        </el-table>
      </div>
      <el-empty v-else description="暂无可用于本场景的数据准备记录" :image-size="60" />
    </section>

    <details class="exp-scenario-details">
      <summary>场景说明与性能基准 <span>背景与方法、并行架构、提交参数</span></summary>
      <div class="exp-scenario-details-body">
      <ScenarioDetailContent
        hide-overview
        :detail="detail"
        :benchmark="benchmark"
        :params="params"
        :cluster-name="clusterName"
      />
      </div>
    </details>
  </div>
</template>

<style scoped>
.dataset-summary { display: flex; align-items: center; gap: 14px; min-height: 52px; padding: 10px 28px; background: #fafbfd; color: #617289; font-size: 12px; border-bottom: 1px solid var(--scnet-divider); }
.dataset-notice-slot { display: grid; flex: 1; min-width: 0; overflow: hidden; }
.dataset-notice { grid-area: 1 / 1; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dataset-notice.has-message { color: var(--scnet-text-secondary); }
.dataset-notice.is-error { color: #ad3e3e; }
.dataset-notice-enter-active, .dataset-notice-leave-active { transition: opacity 180ms, transform 180ms; }
.dataset-notice-enter-from { opacity: 0; transform: translateY(4px); }
.dataset-notice-leave-to { opacity: 0; transform: translateY(-4px); }
.dataset-imported { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: #4d6e60; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dataset-imported svg { width: 14px; height: 14px; margin: 0; color: #328167; }
.dataset-imported strong { color: #256e56; font-weight: 600; }
.dataset-format { display: inline-block; padding: 2px 6px; border: 1px solid #e6ebf2; border-radius: 5px; background: #f6f8fb; color: #596b84; font: 11px/1.6 var(--scnet-font-mono); }
.dataset-name { color: #25344a; font-weight: 550; line-height: 1.6; }
.dataset-id { font-size: 12px; color: #617289; }
.dataset-feedback { margin: 16px 30px 0; padding: 12px 16px; border: 1px solid #cce5d8; border-radius: 8px; color: #26734d; background: #f2faf5; font-size: 14px; }
.dataset-feedback.is-error { color: #b64040; background: #fff4f4; border-color: #efc8c8; }
.dataset-builtin, .dataset-uploaded { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; white-space: nowrap; }
.dataset-builtin { justify-content: center; min-width: 112px; min-height: 36px; color: #64748b; padding: 0 10px; border: 1px dashed #dce3ec; border-radius: 8px; background: #f8fafc; font-size: 12px; }
.dataset-uploaded { color: var(--scnet-success); }
.dataset-import-button { height: 42px; padding: 0 20px; border-radius: 7px; font-weight: 550; box-shadow: 0 3px 8px rgb(11 91 211 / 12%); }
.exp-dataset-actions { align-items: center; }
.exp-dataset-actions :deep(.el-button) { margin-left: 0; min-height: 36px; border-radius: 6px; }
svg { width: 17px; height: 17px; margin-right: 5px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.dataset-source { white-space: nowrap; }
.dataset-operation-slot { display: grid; align-items: center; width: 166px; height: 40px; position: relative; margin-left: auto; }
.dataset-operation-slot > * { grid-area: 1 / 1; justify-self: end; }
.dataset-operation-slot > button { min-width: 104px; }
.dataset-operation-slot > .exp-dataset-actions { width: 100%; justify-content: space-between; align-items: center; }
.dataset-transfer { display: flex; align-items: center; gap: 10px; width: 166px; height: 36px; }
.dataset-transfer-meter { flex: 1; min-width: 0; }
.dataset-transfer-label { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 6px; color: #617289; font-size: 11px; line-height: 1; }
.dataset-transfer-label strong { color: #2b60bb; font: 600 12px/1 var(--scnet-font-mono); font-variant-numeric: tabular-nums; }
.dataset-transfer-label small { font: inherit; }
.dataset-transfer-track { display: block; height: 4px; border-radius: 4px; overflow: hidden; background: #e4ebf5; }
.dataset-transfer-fill { display: block; width: 100%; height: 100%; border-radius: inherit; background: #3978e5; transform-origin: left; transition: transform 100ms linear, background-color 180ms ease; }
.dataset-transfer.is-complete .dataset-transfer-fill { background: #278361; }
.dataset-transfer.is-complete .dataset-transfer-label strong { color: #278361; }
.dataset-state-dot.is-transferring { background: #3978e5; }
.dataset-transfer-cancel { display: grid; place-items: center; flex: 0 0 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #72829a; cursor: pointer; transition: color 140ms, background-color 140ms, scale 140ms; }
.dataset-transfer-cancel svg { margin: 0; }
.dataset-transfer-cancel:hover { background: #dce8f8; color: #264e82; }
.dataset-transfer-cancel:enabled:active { scale: .9; }
.dataset-transfer-cancel:disabled { cursor: wait; opacity: .5; }
.upload-state-enter-active, .upload-state-leave-active { transition: opacity 180ms ease, transform 200ms var(--scnet-hover-easing); }
.upload-state-leave-active { pointer-events: none; }
.upload-state-enter-from { opacity: 0; transform: translateY(3px); }
.upload-state-leave-to { opacity: 0; transform: translateY(-3px); }
.exp-table-wrap :deep(.el-table td.el-table__cell) { height: 80px; }
.exp-table-wrap :deep(.el-table__row) { position: relative; }
.exp-table-wrap :deep(.dataset-row--uploaded) { --dataset-flash: #28a67d; clip-path: inset(0); }
.exp-table-wrap :deep(.dataset-row--removed) { --dataset-flash: #d36060; clip-path: inset(0); }
.exp-table-wrap :deep(.dataset-row--uploaded)::after,
.exp-table-wrap :deep(.dataset-row--removed)::after { content: ''; position: absolute; inset: 0; z-index: 4; pointer-events: none; background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dataset-flash) 5%, transparent) 24%, color-mix(in srgb, var(--dataset-flash) 16%, transparent) 65%, color-mix(in srgb, var(--dataset-flash) 34%, transparent) 100%); animation: dataset-sweep 950ms cubic-bezier(.3, .1, .3, 1) both; }
@keyframes dataset-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.exp-table-wrap :deep(.dataset-row--removed)::after { animation-name: dataset-sweep-remove; }
@keyframes dataset-sweep-remove { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.exp-table-wrap :deep(.el-table th.el-table__cell) { background: #f7f9fc; color: #637187; font-size: 13px; }
button:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 3px; }
.exp-dataprep {
  display: grid;
  gap: 20px;
  min-width: 0;
}

.exp-block {
  min-width: 0;
  border: 1px solid #e1e6ed;
  border-radius: 12px;
  background: #fff;
}

.exp-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 24px 30px;
  border-bottom: 1px solid var(--scnet-divider);
}

.exp-block-head h3 {
  margin: 0;
  font-size: 21px;
  font-weight: 650;
  color: var(--scnet-text);
}

.exp-block-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.exp-import-message {
  padding: 4px 10px;
  border-radius: 6px;
  background: #eaf6ee;
  color: #1e7a3e;
  font-size: 13px;
}

.exp-block-note {
  font-size: 13px;
  color: var(--scnet-text-secondary);
}

.exp-block-description {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--scnet-text-secondary);
}

.exp-table-wrap {
  padding: 14px 30px 26px;
}

.exp-table-wrap :deep(.el-table) {
  font-size: 14px;
  --el-table-row-hover-bg-color: var(--scnet-hover-bg);
}

.exp-table-wrap :deep(.dataset-status-ready) {
  --el-table-row-hover-bg-color: var(--scnet-hover-success-bg);
}
.exp-table-wrap :deep(.dataset-status-processing),
.exp-table-wrap :deep(.dataset-status-pending) {
  --el-table-row-hover-bg-color: var(--scnet-hover-warning-bg);
}
.exp-table-wrap :deep(.dataset-status-failed) {
  --el-table-row-hover-bg-color: var(--scnet-hover-danger-bg);
}
/* One color source, including pinned cells. Element's delayed hover-row class
   must not leave a second highlighted row when the pointer moves quickly. */
.dataset-table :deep(.el-table__body tr) { --dataset-row-bg: #fff; }
.dataset-table :deep(.el-table__body tr:is(:hover, .dataset-row--transferring)) { --dataset-row-bg: #f4f7fd; }
.dataset-table :deep(.el-table__body tr > td.el-table__cell) {
  background-color: var(--dataset-row-bg) !important;
  transition: background-color 180ms ease;
}

.exp-table-wrap :deep(.el-table td.mono .cell) {
  font-family: var(--scnet-font-mono);
}
.exp-dataset-actions {
  display: flex;
  gap: 8px;
}

.exp-scenario-details { min-width: 0; }
.exp-scenario-details > summary { padding: 18px 24px; background: #fff; border: 1px solid #e1e6ed; border-radius: 8px; color: var(--scnet-text); font-size: 15px; font-weight: 500; cursor: pointer; }
.exp-scenario-details > summary span { margin-left: 16px; font-size: 13px; color: var(--scnet-text-secondary); font-weight: 400; }
.exp-scenario-details-body { padding-top: 16px; }
.exp-scenario-details :deep(.scenario-result-panel) { animation: none; }
.exp-scenario-details > summary:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 3px; }

@supports (interpolate-size: allow-keywords) and (transition-behavior: allow-discrete) {
  .exp-scenario-details { interpolate-size: allow-keywords; }
  .exp-scenario-details::details-content {
    block-size: 0;
    opacity: 0;
    overflow: clip;
    transition: block-size 360ms var(--scnet-hover-easing), opacity 220ms ease, content-visibility 360ms allow-discrete;
  }
  .exp-scenario-details[open]::details-content { block-size: auto; opacity: 1; }
  .exp-scenario-details[open] > .exp-scenario-details-body { animation: none; }
}

@media (prefers-reduced-motion: reduce) {
  .exp-scenario-details::details-content { transition: none; }
  .dataset-notice-enter-active, .dataset-notice-leave-active, .upload-state-enter-active, .upload-state-leave-active, .dataset-transfer-fill { transition: none; }
  .exp-table-wrap :deep(.dataset-row--uploaded)::after, .exp-table-wrap :deep(.dataset-row--removed)::after { animation: none; transform: none; opacity: .3; }
}

@media (max-width: 760px) {
  .dataset-summary { display: grid; grid-template-columns: 1fr auto; padding: 10px 20px; gap: 4px 12px; min-height: 72px; }
  .dataset-notice-slot { grid-column: 1; }
  .dataset-imported { grid-column: 2; grid-row: 1; }
  .exp-table-wrap {
    padding: 12px;
  }
  .exp-block-head { padding: 20px; }
  .exp-scenario-details > summary span { display: block; margin: 4px 0 0; }
}
</style>
