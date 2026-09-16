<script setup lang="ts">
import { computed } from 'vue'
import ScenarioDetailContent from '~/components/ScenarioDetailContent.vue'
import { getDatasetTypeLabels } from '~/config/scenario-experience'
import { formatBytes, formatTimestamp } from '~/composables/useFormat'
import type { Benchmark, DatasetItem, ParamField, ScenarioDetail } from '~/types'

const props = defineProps<{
  domain: string
  scenarioId: string
  detail?: ScenarioDetail
  benchmark?: Benchmark[string]
  params: ParamField[]
  clusterName: (id: string) => string
  datasets: DatasetItem[]
}>()

const STATUS_LABELS: Record<string, string> = {
  ready: '就绪',
  processing: '处理中',
  pending: '待准备',
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

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'ready') return 'success'
  if (status === 'processing') return 'warning'
  return 'info'
}
</script>

<template>
  <div class="exp-dataprep">
    <section class="exp-block">
      <div class="exp-block-head">
        <h3>数据准备</h3>
        <span class="exp-block-note">数据来源：<code>GET /api/v1/{{ domain }}/datasets</code></span>
      </div>

      <div v-if="scenarioDatasets.length" class="exp-table-wrap">
        <el-table :data="scenarioDatasets" size="default">
          <el-table-column prop="name" label="数据集" min-width="210" />
          <el-table-column label="类型" min-width="110">
            <template #default="{ row }">{{ typeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column prop="format" label="格式" width="90" class-name="mono" />
          <el-table-column prop="grid" label="规模" min-width="140" class-name="mono" />
          <el-table-column label="大小" width="110" class-name="mono">
            <template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template>
          </el-table-column>
          <el-table-column prop="source" label="来源" min-width="200" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" effect="light" size="small">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="150" class-name="mono">
            <template #default="{ row }">{{ formatTimestamp(row.updated_at) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <el-empty v-else description="暂无可用于本场景的数据准备记录" :image-size="60" />
    </section>

    <section class="exp-block exp-block-scenario">
      <div class="exp-block-head">
        <h3>{{ detail?.name ?? '场景详情' }}</h3>
        <span class="exp-block-note">当前子页面内容</span>
      </div>

      <ScenarioDetailContent
        :detail="detail"
        :benchmark="benchmark"
        :params="params"
        :cluster-name="clusterName"
      />
    </section>
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
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
}

.exp-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--scnet-divider);
}

.exp-block-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--scnet-text);
}

.exp-block-note {
  font-size: 12px;
  color: var(--scnet-text-muted);
}

.exp-block-note code {
  font-family: var(--scnet-font-mono);
  font-size: 12px;
  color: var(--scnet-text-secondary);
}

.exp-table-wrap {
  padding: 14px 22px 20px;
}

.exp-table-wrap :deep(.el-table) {
  font-size: 14px;
}

.exp-table-wrap :deep(.el-table td.mono .cell) {
  font-family: var(--scnet-font-mono);
}

.exp-block-scenario {
  padding-bottom: 8px;
}

@media (max-width: 760px) {
  .exp-table-wrap {
    padding: 12px;
  }
}
</style>
