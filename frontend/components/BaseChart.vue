<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
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
let inactive = false
let needsRender = false

function render(): void {
  if (inactive) { needsRender = true; return }
  if (!el.value) return
  if (!chart) {
    chart = echarts.init(el.value)
    chart.on('click', (params) => emit('chartClick', params))
  }
  chart.setOption(props.option, true)
  needsRender = false
}

function resize(): void {
  if (inactive || !el.value?.clientWidth || !el.value.clientHeight || !chart) return
  // Showing a cached tab also fires ResizeObserver; unchanged canvases need no redraw.
  if (chart.getWidth() === el.value.clientWidth && chart.getHeight() === el.value.clientHeight) return
  chart?.resize()
}

onDeactivated(() => {
  inactive = true
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
})

onActivated(() => {
  inactive = false
  if (needsRender) render()
  if (el.value) resizeObserver?.observe(el.value)
  window.addEventListener('resize', resize)
  resize()
})

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
