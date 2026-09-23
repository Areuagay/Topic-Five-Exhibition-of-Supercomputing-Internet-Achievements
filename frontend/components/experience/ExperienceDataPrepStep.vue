<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ArrowRight, Check, CloudUpload, Database, Download, FileJson, FileSpreadsheet, FileText, LoaderCircle, LockKeyhole, Trash2 } from '@lucide/vue'
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
const emit = defineEmits<{ refresh: []; imported: [result: ImportResult] }>()
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
const typeLabels = computed(() => getDatasetTypeLabels(props.domain))
let cancelTransfer: (() => void) | undefined
let disposed = false
onBeforeUnmount(() => { disposed = true; cancelTransfer?.() })

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
    await uploadDataset(props.domain, row.dataset_id)
    if (disposed) return
    uploadProgress.value = 100
    feedback(row.name + ' 上传完成，请点击一键导入')
    emit('refresh')
  } catch (error) { if (!disposed) feedback(errorText(error), true) }
  finally { uploadingId.value = ''; committing.value = false }
}
async function handleReset(row: DatasetItem): Promise<void> {
  if (row.builtin || !row.uploaded || busy.value) return
  resettingId.value = row.dataset_id
  try {
    await resetDataset(props.domain, row.dataset_id)
    if (disposed) return
    feedback('已移除上传，数据条目保留，可重新上传')
    emit('refresh')
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
          <button type="button" class="dataset-import-button sc-action sc-action--primary" :aria-busy="importing" :disabled="busy || !uploadedCount" @click="handleImport">
            <LoaderCircle v-if="importing" class="is-spinning" aria-hidden="true" /><Download v-else aria-hidden="true" />
            {{ importing ? '导入中…' : pendingImport ? '一键导入' : '前往资源调度' }}
            <ArrowRight v-if="!importing" class="action-arrow" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="dataset-summary">
        <span class="dataset-mode"><CloudUpload :size="14" aria-hidden="true" />模拟上传</span>
        <span>按数据大小演示传输进度，预计 2–12 秒；内置数据可直接导入。</span>
        <span class="dataset-imported">已导入 {{ importedCount }} 项</span>
      </div>
      <Transition name="ex-feedback"><div v-if="message" class="dataset-feedback" :class="{ 'is-error': messageError }" :role="messageError ? 'alert' : 'status'"><Check v-if="!messageError" :size="17" aria-hidden="true" />{{ message }}</div></Transition>
      <div v-if="scenarioDatasets.length" class="exp-table-wrap">
        <el-table :data="scenarioDatasets" size="default" :row-key="(row: DatasetItem) => row.dataset_id">
          <el-table-column label="数据集" min-width="240">
            <template #default="{ row }"><div class="dataset-identity"><span class="dataset-file-icon" :class="`is-${String(row.format).toLowerCase()}`"><Database v-if="row.builtin" :size="18" aria-hidden="true" /><FileSpreadsheet v-else-if="row.format === 'CSV'" :size="18" aria-hidden="true" /><FileJson v-else-if="row.format === 'JSON'" :size="18" aria-hidden="true" /><FileText v-else :size="18" aria-hidden="true" /></span><div><div class="dataset-name">{{ row.name }}</div><span class="dataset-id">{{ row.dataset_id }} · {{ typeLabels[row.type] ?? row.type }}</span></div></div></template>
          </el-table-column>
          <el-table-column prop="format" label="格式" width="100" class-name="mono" />
          <el-table-column prop="grid" label="规模" min-width="150" class-name="mono" />
          <el-table-column label="大小" width="110" class-name="mono"><template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template></el-table-column>
          <el-table-column label="来源" min-width="170"><template #default="{ row }">{{ row.uploaded ? row.source : '待上传' }}</template></el-table-column>
          <el-table-column label="状态" width="110"><template #default="{ row }">
            <span class="dataset-state" :class="{ 'is-imported': row.imported, 'is-ready': row.uploaded }"><i aria-hidden="true" />{{ row.imported ? '已导入' : row.uploaded ? '就绪' : '待上传' }}</span>
          </template></el-table-column>
          <el-table-column label="更新时间" width="155" class-name="mono"><template #default="{ row }">{{ row.uploaded && row.updated_at ? formatTimestamp(row.updated_at) : '—' }}</template></el-table-column>
          <el-table-column label="操作" width="220" fixed="right"><template #default="{ row }">
            <Transition name="upload-state" mode="out-in">
            <div v-if="uploadingId === row.dataset_id" class="dataset-transfer" aria-label="上传进度">
              <div class="dataset-transfer-label"><span><LoaderCircle :size="12" class="is-spinning" aria-hidden="true" />{{ committing ? '正在确认…' : '正在上传' }}</span><button type="button" :disabled="committing" @click="cancelTransfer?.()">取消</button></div>
              <el-progress :percentage="uploadProgress" :stroke-width="5" />
              <span class="dataset-transfer-time">{{ committing ? '等待服务确认' : '预计剩余 ' + remainingSeconds + ' 秒' }}</span>
            </div>
            <span v-else-if="row.builtin" class="dataset-builtin"><LockKeyhole :size="14" aria-hidden="true" />内置数据</span>
            <div v-else class="exp-dataset-actions">
              <button v-if="!row.uploaded" type="button" class="sc-action sc-action--soft sc-action--small" :disabled="busy" @click="handleUpload(row as DatasetItem)"><CloudUpload aria-hidden="true" />上传数据</button>
              <template v-else><span class="dataset-uploaded"><Check :size="14" aria-hidden="true" />已上传</span><button type="button" class="sc-action sc-action--ghost sc-action--danger sc-action--small" :aria-busy="resettingId === row.dataset_id" :disabled="busy" @click="handleReset(row as DatasetItem)"><LoaderCircle v-if="resettingId === row.dataset_id" class="is-spinning" aria-hidden="true" /><Trash2 v-else aria-hidden="true" />移除</button></template>
            </div>
            </Transition>
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
.dataset-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 16px 30px; background: #f8faff; color: #607086; font-size: 13px; border-bottom: 1px solid #e9eef6; }
.dataset-mode { padding: 3px 8px; border: 1px solid #cdddf5; border-radius: 5px; color: #245da9; background: #eef5ff; white-space: nowrap; }
.dataset-imported { margin-left: auto; font-variant-numeric: tabular-nums; }
.dataset-name { color: #25344a; font-weight: 550; line-height: 1.6; }
.dataset-id { font-size: 12px; color: #617289; }
.dataset-feedback { margin: 16px 30px 0; padding: 12px 16px; border: 1px solid #cce5d8; border-radius: 8px; color: #26734d; background: #f2faf5; font-size: 14px; }
.dataset-feedback.is-error { color: #b64040; background: #fff4f4; border-color: #efc8c8; }
.dataset-builtin, .dataset-uploaded { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; white-space: nowrap; }
.dataset-builtin { color: #66788e; padding: 8px 12px; background: #f2f5f9; border-radius: 6px; }
.dataset-uploaded { color: #287853; }
.dataset-import-button { height: 42px; padding: 0 20px; border-radius: 7px; font-weight: 550; box-shadow: 0 3px 8px rgb(11 91 211 / 12%); }
.exp-dataset-actions { align-items: center; }
.exp-dataset-actions :deep(.el-button) { margin-left: 0; min-height: 36px; border-radius: 6px; }
svg { width: 17px; height: 17px; margin-right: 5px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.dataset-transfer { width: 180px; padding: 6px 0; }
.dataset-transfer-label { display: flex; justify-content: space-between; color: #245da9; font-size: 12px; }
.dataset-transfer-label button { border: 0; padding: 0 6px; background: transparent; color: #66788e; cursor: pointer; }
.dataset-transfer-label button:disabled { cursor: wait; opacity: .5; }
.dataset-transfer-time { color: #788598; font-size: 11px; }
.dataset-transfer :deep(.el-progress__text) { font-size: 12px !important; min-width: 34px; }
.exp-table-wrap :deep(.el-table td.el-table__cell) { height: 72px; }
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
.exp-table-wrap :deep(td.el-table__cell) {
  transition: background-color var(--scnet-hover-duration) var(--scnet-hover-easing);
}
.exp-table-wrap :deep(.el-table__body tr:hover > td.el-table__cell),
.exp-table-wrap :deep(.el-table__body tr.hover-row > td.el-table__cell) {
  background-color: var(--el-table-row-hover-bg-color);
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
}

@media (max-width: 760px) {
  .exp-table-wrap {
    padding: 12px;
  }
  .exp-block-head { padding: 20px; }
  .exp-scenario-details > summary span { display: block; margin: 4px 0 0; }
}
</style>
