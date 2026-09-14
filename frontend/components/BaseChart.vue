<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, GraphChart, HeatmapChart, LineChart, PieChart, FunnelChart, RadarChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, MarkLineComponent, RadarComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption, Payload } from 'echarts/core'

echarts.use([
  ScatterChart,
  FunnelChart,
  RadarChart,
  RadarComponent,
  LineChart,
  BarChart,
  PieChart,
  GraphChart,
  HeatmapChart,
  VisualMapComponent,
  MarkLineComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])

const props = withDefaults(
  defineProps<{
    option: EChartsCoreOption
    height?: string
    ariaLabel?: string
  }>(),
  { height: '320px', ariaLabel: '数据可视化图表' },
)

const emit = defineEmits<{
  chartClick: [params: unknown]
}>()

const el = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function render(): void {
  if (!el.value) return
  if (!chart) {
    chart = echarts.init(el.value)
    chart.on('click', (params) => emit('chartClick', params))
  }
  chart.setOption(props.option, true)
}

function resize(): void {
  chart?.resize()
}

function dispatchAction(payload: Payload): void {
  chart?.dispatchAction(payload)
}

defineExpose({ dispatchAction })

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
  if (typeof ResizeObserver !== 'undefined' && el.value) {
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(el.value)
  }
})

watch(
  () => props.option,
  () => render(),
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  resizeObserver?.disconnect()
  resizeObserver = null
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="base-chart" :style="{ height }" role="img" :aria-label="ariaLabel" />
</template>

<style scoped>
.base-chart {
  width: 100%;
}
</style>
