<script setup lang="ts">
import { computed } from 'vue'
import { Box } from '@lucide/vue'
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

const RUNTIME_LABELS: Record<string, string> = {
  instance: '平台实例',
  singularity: 'Singularity',
  docker: 'Docker',
  'docker-run': 'Docker',
  container: '容器',
}
function runtimeLabel(operator: Operator): string {
  return operator.runtime_label || RUNTIME_LABELS[operator.runtime_type] || operator.runtime_type || '容器'
}
function memoryText(value?: number): string {
  return value && value > 0 ? `${formatNumber(value, 1)} GB` : '按需'
}
function durationText(run?: Run): string {
  if (!run) return '-'
  if (['running', 'queued', 'pending'].includes(run.status) && run.planned_seconds) {
    return `${formatDuration(run.elapsed_seconds)} / ${formatDuration(run.planned_seconds)}`
  }
  return formatDuration(run.elapsed_seconds)
}

function selectRun(value: string): void {
  emit('update:selectedRunId', value)
}
</script>

<template>
  <div class="exp-workflow">
    <section class="exp-chosen-operators" aria-label="本次体验已选算子">
      <header class="exp-chosen-heading"><div><strong>本条任务算子</strong><span class="exp-chosen-count">{{ chosenOperators.length }} 项</span></div><p>与下方工作流、执行监控同步</p></header>
      <ul v-if="chosenOperators.length"><li v-for="operator in chosenOperators" :key="operator.name"><span class="exp-chosen-icon"><Box :size="17" aria-hidden="true" /></span><span class="exp-chosen-name">{{ operator.title || (operator.description.includes('：') ? operator.description.split('：')[0] : operator.name) }}<small>{{ operator.name }} · {{ runtimeLabel(operator) }}</small></span></li></ul>
      <p v-else>预置运行记录，计算阶段请查看下方工作流。</p>
    </section>
    <div class="exp-toolbar">
      <label class="exp-toolbar-field">
        <span>运行记录</span>
        <el-select
          :model-value="selectedRunId"
          placeholder="选择运行记录"
          aria-label="选择运行记录"
          :title="selectedRun ? `${selectedRun.run_id} · ${selectedRun.scenario_name} · ${statusText(selectedRun.status)}` : undefined"
          popper-class="workflow-run-options"
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
          <dt>GPU</dt>
          <dd>{{ formatNumber(selectedRun.gpu_count) }} 卡</dd>
        </div>
        <div>
          <dt>内存</dt>
          <dd>{{ memoryText(selectedRun.memory_gb) }}</dd>
        </div>
        <div>
          <dt>累计核时</dt>
          <dd>{{ formatNumber(selectedRun.core_hours, 1) }}</dd>
        </div>
        <div>
          <dt>{{ ['running', 'queued', 'pending'].includes(selectedRun.status) ? '已运行 / 预计' : '运行耗时' }}</dt>
          <dd>{{ durationText(selectedRun) }}</dd>
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
.exp-chosen-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 20px; padding-bottom: 15px; border-bottom: 1px solid var(--scnet-divider); }
.exp-chosen-heading > div { display: flex; align-items: center; gap: 12px; }
.exp-chosen-count { font-size: 11px; color: #61758e; padding: 2px 7px; border: 1px solid #dce5ef; border-radius: 5px; }
.exp-chosen-heading p { margin: 0; font-size: 12px; color: #7b899a; }
.exp-chosen-operators strong { font-size: 14px; color: var(--scnet-text); }
.exp-chosen-operators p { margin: 6px 0 0; color: var(--scnet-text-secondary); font-size: 13px; }
.exp-chosen-operators ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 12px; padding: 0; margin: 16px 0 0; list-style: none; }
.exp-chosen-operators li { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 13px 15px; border: 1px solid #dee7f2; border-radius: 8px; background: #f8fafd; color: #365676; font-size: 13px; }
.exp-chosen-icon { display: grid; place-items: center; flex: 0 0 34px; height: 34px; color: #4776b3; background: #edf3fb; border-radius: 7px; }
.exp-chosen-name { min-width: 0; overflow-wrap: anywhere; font-weight: 500; }
.exp-chosen-name small { display: block; margin-top: 3px; font: 11px/1.5 var(--scnet-font-mono); color: #7a8b9f; }
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
  flex: 1 1 600px;
  min-width: 0;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--scnet-text-secondary);
}

.exp-toolbar-field :deep(.el-select) {
  flex: 1;
  width: 100%;
  min-width: 0;
  max-width: 600px;
}
.exp-toolbar-field > span { flex: none; white-space: nowrap; }
.exp-toolbar-field :deep(.el-select__placeholder) { position: static; transform: none; white-space: nowrap; overflow-x: auto; text-overflow: clip; scrollbar-width: none; }
.exp-toolbar-field :deep(.el-select__wrapper) { padding-block: 8px; }

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
    width: 100%;
  }
}
</style>

<style>
.workflow-run-options .el-select-dropdown__item { height: auto; min-height: 34px; padding-block: 8px; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; }
</style>
