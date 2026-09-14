<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { PINNData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import { scientificLines } from '~/utils/scientific-charts'
import { quantityLabel, residualCells } from '~/utils/workspace'
const props = defineProps<{ data: PINNData }>()
const losses = [{ key: 'total_loss', label: 'Total Loss' }, { key: 'physics_loss', label: 'Physics Loss' }, { key: 'data_loss', label: 'Data Loss' }]
const selected = ref<Record<string, boolean>>({ total_loss: true, physics_loss: true, data_loss: true })
const lossOption = computed(() => {
  const option = scientificLines(props.data.pinn_training_series, 'epoch', 'Epoch', losses, props.data.units)
  option.legend = { show: false, selected: Object.fromEntries(losses.map(item => [quantityLabel(item.label, props.data.units?.[item.key]), selected.value[item.key]])) }
  return option
})
const errorOption = computed(() => scientificLines(props.data.prediction_error_series, 'epoch', 'Epoch', [{ key: 'l2_error', label: 'L2 Error' }, { key: 'max_error', label: 'Max Error' }], props.data.units))
const cells = computed(() => residualCells(props.data.residual_field))
const heatmap = computed<EChartsCoreOption>(() => ({
  animation: false,
  tooltip: { position: 'top', formatter: (params: unknown) => {
    const [x, y, value] = (params as { data: number[] }).data
    return `x: ${props.data.residual_field?.x[x]}<br>y: ${props.data.residual_field?.y[y]}<br>Residual: ${value}`
  } },
  grid: { left: 60, right: 25, top: 25, bottom: 90 },
  xAxis: { type: 'category', name: quantityLabel('x', props.data.units?.x), data: props.data.residual_field?.x ?? [], splitArea: { show: true }, axisLabel: { formatter: (value: string) => Number(value).toFixed(2) } },
  yAxis: { type: 'category', name: quantityLabel('y', props.data.units?.y), data: props.data.residual_field?.y ?? [], splitArea: { show: true }, axisLabel: { formatter: (value: string) => Number(value).toFixed(2) } },
  visualMap: { min: Math.min(...cells.value.map(item => item[2]), 0), max: Math.max(...cells.value.map(item => item[2]), Number.EPSILON), precision: 3, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#eef4fb', '#87acd5', '#245b9b', '#d6a152'] } },
  series: [{ name: quantityLabel('PDE Residual', props.data.units?.residual), type: 'heatmap', data: cells.value, emphasis: { itemStyle: { borderColor: '#303133', borderWidth: 1 } } }],
}))
const samples = computed(() => [
  { label: '物理采样点', value: props.data.sampling_statistics?.physics_points },
  { label: '边界采样点', value: props.data.sampling_statistics?.boundary_points },
  { label: '观测数据点', value: props.data.sampling_statistics?.data_points },
])
</script>

<template>
  <div class="ai-workspace pinn-workspace">
    <div class="ai-two-column">
      <section class="ai-section">
        <h3>物理约束训练损失</h3>
        <div class="ai-controls" role="group" aria-label="损失曲线显示"><button v-for="(item, index) in losses" :key="item.key" type="button" :aria-pressed="selected[item.key]" @click="selected[item.key] = !selected[item.key]"><span class="loss-swatch" :style="{ background: ['#1769d2', '#b57820', '#4d8b78'][index] }" aria-hidden="true" />{{ quantityLabel(item.label, data.units?.[item.key]) }}</button></div>
        <BaseChart v-if="data.pinn_training_series?.length" :option="lossOption" height="390px" aria-label="Total Physics Data Loss 曲线" />
        <div v-else class="ai-empty">暂无训练损失数据</div>
      </section>
      <section class="ai-section">
        <h3>{{ quantityLabel('PDE 残差分布', data.units?.residual) }}</h3>
        <BaseChart v-if="cells.length" :option="heatmap" height="450px" aria-label="PDE 残差热力图" />
        <div v-else class="ai-empty">暂无残差场数据</div>
      </section>
    </div>
    <section class="ai-section"><h3>采样统计</h3><dl class="ai-stats"><div v-for="item in samples" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value?.toLocaleString() ?? '—' }}</dd></div></dl></section>
    <section class="ai-section"><h3>预测误差</h3><BaseChart v-if="data.prediction_error_series?.length" :option="errorOption" height="280px" aria-label="L2 与最大预测误差曲线" /><div v-else class="ai-empty">暂无预测误差数据</div></section>
  </div>
</template>

<style scoped src="./ai-workspace.css"></style>
<style scoped>
.loss-swatch { display: inline-block; width: 14px; height: 3px; margin-right: 8px; vertical-align: middle; }
</style>
