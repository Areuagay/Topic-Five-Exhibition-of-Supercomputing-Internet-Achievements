<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { LLMPretrainingData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import { scientificLines } from '~/utils/scientific-charts'
import { quantityLabel } from '~/utils/workspace'
import { formatTimestamp } from '~/composables/useFormat'
const props = defineProps<{ data: LLMPretrainingData }>()
const checkpointIndex = ref(0)
const checkpoint = computed(() => props.data.checkpoint_events?.[checkpointIndex.value])
const gpuIndex = ref(0)
const gpu = computed(() => props.data.gpu_metrics?.[gpuIndex.value])
const gpuFields = [{ key: 'utilization', label: '利用率' }, { key: 'memory_utilization', label: '显存使用' }, { key: 'temperature', label: '温度' }] as const
const gpuField = ref<'utilization' | 'memory_utilization' | 'temperature'>('utilization')
const parallel = computed(() => [
  { label: '数据并行 DP', value: props.data.parallel_config?.data_parallel },
  { label: '张量并行 TP', value: props.data.parallel_config?.tensor_parallel },
  { label: '流水线并行 PP', value: props.data.parallel_config?.pipeline_parallel },
])
function option(key: string, label: string) { return scientificLines(props.data.training_series, 'step', '训练步', [{ key, label }], props.data.units) }
const loss = computed<EChartsCoreOption>(() => {
  const value = option('loss', 'Loss')
  const steps = props.data.training_series?.map(row => row.step) ?? []
  if (checkpoint.value && steps.length && checkpoint.value.step >= Math.min(...steps) && checkpoint.value.step <= Math.max(...steps)) {
    const series = value.series as { markLine?: unknown }[]
    series[0].markLine = { symbol: 'none', label: { formatter: `Checkpoint ${checkpoint.value.step}` }, lineStyle: { color: '#b57820' }, data: [{ xAxis: checkpoint.value.step }] }
  }
  return value
})
const learningRate = computed(() => option('learning_rate', 'Learning Rate'))
const throughput = computed(() => option('tokens_per_second', '训练吞吐'))
function gpuBackground(value: number) {
  const values = props.data.gpu_metrics?.map(item => item[gpuField.value]) ?? []
  const min = Math.min(...values), max = Math.max(...values)
  const ratio = max === min ? 0.5 : (value - min) / (max - min)
  return `rgba(23, 105, 210, ${0.06 + ratio * 0.16})`
}
</script>

<template>
  <div class="ai-workspace llm-workspace">
    <div class="ai-two-column">
      <section class="ai-section">
        <h3>训练损失</h3>
        <BaseChart v-if="data.training_series?.length" :option="loss" height="340px" aria-label="预训练 Loss 曲线" />
        <div v-else class="ai-empty">暂无训练数据</div>
        <dl class="ai-stats"><div v-for="item in parallel" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value ?? '—' }}</dd></div></dl>
        <p v-if="data.parallel_config" class="ai-caption">并行进程数 {{ data.parallel_config.world_size }}</p>
      </section>
      <section class="ai-section">
        <h3>GPU 状态矩阵</h3>
        <div class="ai-controls" role="group" aria-label="GPU 显示指标"><button v-for="item in gpuFields" :key="item.key" type="button" :aria-pressed="gpuField === item.key" @click="gpuField = item.key">{{ quantityLabel(item.label, data.units?.[item.key]) }}</button></div>
        <div v-if="data.gpu_metrics?.length" class="gpu-grid">
          <button v-for="(item, index) in data.gpu_metrics" :key="item.gpu_id" type="button" :aria-pressed="gpuIndex === index" :style="{ background: gpuBackground(item[gpuField]) }" @mouseenter="gpuIndex = index" @focus="gpuIndex = index" @click="gpuIndex = index"><span>GPU {{ item.gpu_id }}</span><strong>{{ item[gpuField] }}<small v-if="data.units?.[gpuField]"> {{ data.units[gpuField] }}</small></strong></button>
        </div>
        <div v-else class="ai-empty">暂无 GPU 数据</div>
        <template v-if="gpu"><p class="ai-caption">GPU {{ gpu.gpu_id }} · 当前选中</p><dl class="ai-stats gpu-facts"><div v-for="item in gpuFields" :key="item.key"><dt>{{ quantityLabel(item.label, data.units?.[item.key]) }}</dt><dd>{{ gpu[item.key] }}</dd></div></dl></template>
      </section>
    </div>
    <section class="ai-section">
      <div class="ai-chart-pair"><div><h3>学习率调度</h3><BaseChart v-if="data.training_series?.length" :option="learningRate" height="280px" aria-label="学习率曲线" /><div v-else class="ai-empty">暂无学习率数据</div></div><div><h3>训练吞吐</h3><BaseChart v-if="data.training_series?.length" :option="throughput" height="280px" aria-label="训练吞吐曲线" /><div v-else class="ai-empty">暂无吞吐数据</div></div></div>
    </section>
    <section class="ai-section">
      <h3>检查点时间线</h3>
      <div v-if="data.checkpoint_events?.length" class="checkpoint-list"><button v-for="(item, index) in data.checkpoint_events" :key="`${item.step}-${index}`" type="button" :aria-pressed="checkpointIndex === index" @click="checkpointIndex = index"><strong>Step {{ item.step }}</strong><span>{{ formatTimestamp(item.timestamp) }}</span></button></div>
      <div v-else class="ai-empty">暂无检查点</div>
      <div v-if="checkpoint" class="checkpoint-detail" aria-live="polite"><strong>Step {{ checkpoint.step }} · {{ checkpoint.size_gb }} GB</strong><span>{{ checkpoint.path }}</span></div>
    </section>
  </div>
</template>

<style scoped src="./ai-workspace.css"></style>
<style scoped>
.gpu-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.gpu-grid button { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; padding: 12px; }
.gpu-grid strong { font-family: var(--scnet-font-mono); font-size: 18px; color: var(--scnet-text); }
.gpu-grid small { font: 500 12px var(--scnet-font-sans); }
.gpu-facts dd { font-size: 18px; }
.checkpoint-list { display: flex; flex-wrap: wrap; gap: 12px; }
.checkpoint-list button { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.checkpoint-list span, .checkpoint-detail { font-size: 14px; }
.checkpoint-detail { display: grid; gap: 8px; margin-top: 18px; padding: 16px; border: 1px solid var(--scnet-divider); border-radius: 6px; overflow-wrap: anywhere; }
.checkpoint-detail span { color: var(--scnet-text-secondary); }
@media (max-width: 700px) { .gpu-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
