<script setup lang="ts">
import { computed } from 'vue'
import WorkflowDag from '~/components/WorkflowDag.vue'
import { getStageLabels } from '~/config/scenario-experience'
import { formatDuration, formatNumber, statusText } from '~/composables/useFormat'
import type { Operator, Run, RunDetail } from '~/types'

const props = defineProps<{
  domain: string
  runs: Run[]
  selectedRunId: string
  workflow?: RunDetail['workflow'] | null
  pending?: boolean
  chosenOperators: Operator[]
}>()

const emit = defineEmits<{
  'update:selectedRunId': [value: string]
}>()

const selectedRun = computed(() => props.runs.find((run) => run.run_id === props.selectedRunId))
const nodes = computed(() => props.workflow?.nodes ?? [])
const edges = computed(() => props.workflow?.edges ?? [])

/** 工作流阶段中文标签按学科域从配置读取，组件不内嵌学科文案 */
const stageLabels = computed(() => getStageLabels(props.domain))

function stageText(stage?: string): string {
  if (!stage) return '-'
  return stageLabels.value[stage] ?? stage
}

function selectRun(value: string): void {
  emit('update:selectedRunId', value)
}
</script>

<template>
  <div class="exp-workflow">
    <section class="exp-chosen-operators" aria-label="本次体验已选算子">
      <div><strong>本次体验已选算子 · {{ chosenOperators.length }}</strong><p>下方展示所选运行记录的已有工作流。</p></div>
      <ul v-if="chosenOperators.length"><li v-for="operator in chosenOperators" :key="operator.name">{{ operator.description.includes('：') ? operator.description.split('：')[0] : operator.name }}</li></ul>
      <p v-else>尚未选择，可返回「算子选择」添加。</p>
    </section>
    <div class="exp-toolbar">
      <label class="exp-toolbar-field">
        <span>运行记录</span>
        <el-select
          :model-value="selectedRunId"
          placeholder="选择运行记录"
          aria-label="选择运行记录"
          @update:model-value="selectRun"
        >
          <el-option
            v-for="run in runs"
            :key="run.run_id"
            :label="`${run.run_id} · ${run.scenario_name} · ${statusText(run.status)}`"
            :value="run.run_id"
          />
        </el-select>
      </label>

      <dl v-if="selectedRun" class="exp-toolbar-meta">
        <div>
          <dt>当前阶段</dt>
          <dd>{{ stageText(selectedRun.current_stage) }}</dd>
        </div>
        <div>
          <dt>运行集群</dt>
          <dd>{{ selectedRun.cluster_name || selectedRun.cluster_id || '-' }}</dd>
        </div>
        <div>
          <dt>并行规模</dt>
          <dd>{{ formatNumber(selectedRun.cpu_cores) }} 核</dd>
        </div>
        <div>
          <dt>运行耗时</dt>
          <dd>{{ formatDuration(selectedRun.elapsed_seconds) }}</dd>
        </div>
      </dl>
    </div>

    <div class="exp-dag-region">
      <div v-if="pending" class="exp-dag-state" role="status">工作流加载中…</div>
      <WorkflowDag v-else-if="nodes.length" :nodes="nodes" :edges="edges" />
      <el-empty v-else description="所选运行记录暂无工作流信息" :image-size="60" />
    </div>
  </div>
</template>

<style scoped>
.exp-chosen-operators { padding: 20px 24px; border: 1px solid var(--scnet-divider); border-radius: 10px; background: #fff; }
.exp-chosen-operators strong { font-size: 14px; color: var(--scnet-text); }
.exp-chosen-operators p { margin: 6px 0 0; color: var(--scnet-text-secondary); font-size: 13px; }
.exp-chosen-operators ul { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 14px 0 0; list-style: none; }
.exp-chosen-operators li { max-width: 100%; overflow-wrap: anywhere; padding: 5px 10px; border-radius: 5px; background: #f2f6fc; color: var(--scnet-primary); font-size: 12px; }
.exp-workflow {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.exp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px 24px;
  padding: 16px 20px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
}

.exp-toolbar-field {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--scnet-text-secondary);
}

.exp-toolbar-field :deep(.el-select) {
  width: 320px;
}

.exp-toolbar-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  margin: 0;
}

.exp-toolbar-meta dt {
  font-size: 12px;
  color: var(--scnet-text-muted);
}

.exp-toolbar-meta dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--scnet-text);
}

.exp-dag-region {
  min-height: 420px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.exp-dag-state {
  display: grid;
  place-items: center;
  min-height: 420px;
  font-size: 14px;
  color: var(--scnet-text-muted);
}

@media (max-width: 760px) {
  .exp-toolbar-field :deep(.el-select) {
    width: 220px;
  }
}
</style>
