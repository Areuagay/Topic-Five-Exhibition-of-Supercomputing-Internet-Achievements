<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import ScenarioDetailContent from '~/components/ScenarioDetailContent.vue'
import { getDatasetTypeLabels } from '~/config/scenario-experience'
import { formatBytes, formatTimestamp } from '~/composables/useFormat'
import { useApi } from '~/composables/useApi'
import type { Benchmark, DatasetItem, ImportResult, ParamField, ScenarioDetail } from '~/types'

const props = defineProps<{
  domain: string
  scenarioId: string
  detail?: ScenarioDetail
  benchmark?: Benchmark[string]
  params: ParamField[]
  clusterName: (id: string) => string
  datasets: DatasetItem[]
}>()

const emit = defineEmits<{
  refresh: []
  imported: [result: ImportResult]
}>()

const { uploadDataset, resetDataset, importDatasets } = useApi()

/** 上传 / 恢复未上传 / 一键导入仅在首个学科域（地球动力学）启用，其他学科域保持只读 */
const interactive = computed(() => props.domain === 'geodynamics')
const uploadingId = ref('')
const resettingId = ref('')
const importing = ref(false)
const importMessage = ref('')
let messageTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(messageTimer))

function showImportMessage(text: string): void {
  importMessage.value = text
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => { importMessage.value = '' }, 3600)
}

const STATUS_LABELS: Record<string, string> = {
  ready: '就绪',
  processing: '处理中',
  pending: '待准备',
  failed: '失败',
}

const scenarioDatasets = computed(() =>
  props.datasets.filter((item) => item.scenario_id === props.scenarioId),
)

/** 数据集类型中文标签按学科域从配置读取，组件不内嵌学科文案 */
const typeLabels = computed(() => getDatasetTypeLabels(props.domain))

function typeLabel(type: string): string {
  return typeLabels.value[type] ?? type
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

function datasetRowClass({ row }: { row: DatasetItem }): string {
  return `dataset-status-${row.status}`
}

function statusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'ready') return 'success'
  if (status === 'processing') return 'warning'
  if (status === 'failed') return 'danger'
  return 'info'
}

/** 未上传的数据集：大小、来源、状态、更新时间均留空（HDF5 数据默认视为已上传） */
function isUploaded(row: DatasetItem): boolean {
  return !interactive.value || row.uploaded === true
}

function displayedSize(row: DatasetItem): string {
  return isUploaded(row) ? formatBytes(row.size_bytes) : ''
}

function displayedSource(row: DatasetItem): string {
  return isUploaded(row) ? row.source ?? '' : ''
}

function displayedUpdated(row: DatasetItem): string {
  return isUploaded(row) && row.updated_at ? formatTimestamp(row.updated_at) : ''
}

async function handleUpload(row: DatasetItem): Promise<void> {
  if (!interactive.value || row.uploaded || uploadingId.value) return
  uploadingId.value = row.dataset_id
  try {
    await uploadDataset(props.domain, row.dataset_id)
    emit('refresh')
  } finally {
    uploadingId.value = ''
  }
}

/** 「删除」不删除整行，而是把该数据集恢复为未上传状态（隐藏大小/来源/状态/更新时间） */
async function handleReset(row: DatasetItem): Promise<void> {
  if (!interactive.value || resettingId.value) return
  // HDF5 为内置数据，不支持恢复未上传：按钮保持常规外观但点击无响应
  if (row.format === 'HDF5') return
  resettingId.value = row.dataset_id
  try {
    await resetDataset(props.domain, row.dataset_id)
    emit('refresh')
  } finally {
    resettingId.value = ''
  }
}

async function handleImport(): Promise<void> {
  if (!interactive.value || importing.value) return
  importing.value = true
  try {
    const result = await importDatasets(props.domain, props.scenarioId)
    showImportMessage(result.message)
    emit('imported', result)
  } catch {
    showImportMessage('导入失败，请稍后重试')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="exp-dataprep">
    <section class="exp-block">
      <div class="exp-block-head">
        <div><h3>输入数据</h3><p class="exp-block-description">当前场景所需的数据集、参数与输入文件。</p></div>
        <div class="exp-block-actions">
          <span v-if="importMessage" class="exp-import-message" role="status">{{ importMessage }}</span>
          <span class="exp-block-note">{{ scenarioDatasets.filter(item => item.status === 'ready').length }} / {{ scenarioDatasets.length }} 项就绪</span>
          <el-button
            v-if="interactive"
            type="primary"
            :loading="importing"
            @click="handleImport"
          >{{ importing ? '导入中…' : '一键导入' }}</el-button>
        </div>
      </div>

      <div v-if="scenarioDatasets.length" class="exp-table-wrap">
        <el-table :data="scenarioDatasets" :row-class-name="datasetRowClass" size="default">
          <el-table-column prop="name" label="数据集" min-width="210" />
          <el-table-column label="类型" min-width="110">
            <template #default="{ row }">{{ typeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column prop="format" label="格式" width="90" class-name="mono" />
          <el-table-column prop="grid" label="规模" min-width="140" class-name="mono" />
          <el-table-column label="大小" width="110" class-name="mono">
            <template #default="{ row }">{{ displayedSize(row as DatasetItem) }}</template>
          </el-table-column>
          <el-table-column label="来源" min-width="200">
            <template #default="{ row }">{{ displayedSource(row as DatasetItem) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag v-if="isUploaded(row as DatasetItem)" :type="statusTagType(row.status)" effect="light" size="small">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="150" class-name="mono">
            <template #default="{ row }">{{ displayedUpdated(row as DatasetItem) }}</template>
          </el-table-column>
          <el-table-column v-if="interactive" label="操作" width="176" fixed="right">
            <template #default="{ row }">
              <div class="exp-dataset-actions">
                <el-button
                  size="small"
                  plain
                  :type="row.uploaded ? 'success' : 'primary'"
                  :loading="uploadingId === row.dataset_id"
                  :disabled="row.uploaded"
                  @click="handleUpload(row as DatasetItem)"
                >{{ row.uploaded ? '已上传' : '上传' }}</el-button>
                <!-- HDF5 为内置数据，此处删除按钮仅作页面装饰：不绑定点击事件，也不设置禁用 -->
                <el-button
                  v-if="row.format === 'HDF5'"
                  size="small"
                  type="danger"
                  plain
                >删除</el-button>
                <el-button
                  v-else
                  size="small"
                  type="danger"
                  plain
                  :loading="resettingId === row.dataset_id"
                  @click="handleReset(row as DatasetItem)"
                >删除</el-button>
              </div>
            </template>
          </el-table-column>
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
