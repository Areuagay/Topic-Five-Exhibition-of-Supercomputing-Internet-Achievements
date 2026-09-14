<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { TectonicEvolutionData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import ArtifactPreview from '~/components/run/ArtifactPreview.vue'
import { quantityLabel, waveSeries } from '~/utils/workspace'

const props = defineProps<{ data: TectonicEvolutionData }>()
const field = ref<'temperature' | 'velocity'>('temperature')
const frameIndex = ref(0)
const playing = ref(false)
const frames = computed(() => props.data.field_frames ?? [])
const frame = computed(() => frames.value[frameIndex.value])
const isTemperature = computed(() => field.value === 'temperature')
const fieldName = computed(() => isTemperature.value ? '温度' : '速度')
const fieldUnit = computed(() => props.data.units?.[field.value]?.trim() || '')
const timeUnit = computed(() => props.data.units?.time?.trim() || '')
const preview = computed(() => isTemperature.value ? frame.value?.temperature_preview : frame.value?.velocity_preview)
const preloadUrls = computed(() => frames.value.flatMap(item => [item.temperature_preview, item.velocity_preview]).filter(Boolean))
const rows = computed(() => isTemperature.value ? props.data.temperature_series : props.data.velocity_series)
// Field frames use the same time samples as the histories. Never interpolate or invent a value.
const sample = computed(() => rows.value?.find(row => row.time === frame.value?.time))
const maximum = computed(() => sample.value && ('max_temperature' in sample.value ? sample.value.max_temperature : sample.value.max_velocity))
const average = computed(() => sample.value && ('avg_temperature' in sample.value ? sample.value.avg_temperature : sample.value.avg_velocity))
function formatValue(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return isTemperature.value ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : value.toExponential(3)
}
let timer: ReturnType<typeof setInterval> | undefined
function stop() { playing.value = false; clearInterval(timer); timer = undefined }
function togglePlayback() {
  if (playing.value) return stop()
  if (frames.value.length < 2) return
  playing.value = true
  timer = setInterval(() => { frameIndex.value = (frameIndex.value + 1) % frames.value.length }, 1000)
}
function selectField(value: 'temperature' | 'velocity') { stop(); field.value = value }
function selectFrame(event: Event) { stop(); frameIndex.value = Number((event.target as HTMLInputElement).value) }
watch(() => props.data, () => { stop(); frameIndex.value = 0 })
onBeforeUnmount(stop)

function chart(seriesRows: Record<string, unknown>[] | undefined, xKey: string, keys: string[], names: string[], residual = false): EChartsCoreOption {
  return {
    color: ['#1769d2', '#b57820'],
    animation: true,
    animationDuration: 500,
    animationDurationUpdate: 180,
    textStyle: { fontFamily: '"Noto Sans SC", MiSans, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif', fontSize: 13, fontWeight: 500 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(37, 48, 68, 0.94)', borderWidth: 0, textStyle: { color: '#fff' } },
    legend: { bottom: 0, textStyle: { color: '#606266' } },
    grid: { left: 78, right: 24, top: 46, bottom: 72 },
    xAxis: { type: 'value', name: residual ? '迭代次数' : quantityLabel('模拟时间', timeUnit.value), nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: residual ? 'log' : 'value', scale: true, name: residual ? `${quantityLabel('残差', props.data.units?.residual)} · 对数刻度` : quantityLabel(fieldName.value, fieldUnit.value), nameTextStyle: { align: 'left' }, splitLine: { lineStyle: { color: '#edf1f5' } }, ...(!residual && !isTemperature.value ? { axisLabel: { formatter: (value: number) => value === 0 ? '0' : value.toExponential(1) } } : {}) },
    series: keys.map((key, index) => ({ name: names[index], type: 'line', smooth: false, showSymbol: false, connectNulls: false, lineStyle: { width: 2 }, data: waveSeries(seriesRows, xKey, key).map(([x, y]) => [x, residual && y != null && y <= 0 ? null : y]) })),
  }
}
const trendOption = computed(() => chart(rows.value, 'time', isTemperature.value ? ['max_temperature', 'avg_temperature'] : ['max_velocity', 'avg_velocity'], [`最高${fieldName.value}`, `平均${fieldName.value}`]))
const residualOption = computed(() => chart(props.data.nonlinear_series, 'iteration', ['residual'], ['非线性残差'], true))
</script>

<template>
  <div class="tectonic-workspace">
    <div class="tectonic-tabs" role="group" aria-label="场类型">
      <button type="button" :aria-pressed="isTemperature" @click="selectField('temperature')">温度场</button>
      <button type="button" :aria-pressed="!isTemperature" @click="selectField('velocity')">速度场</button>
    </div>
    <div class="tectonic-main">
      <section class="tectonic-field" aria-labelledby="tectonic-field-title">
        <h3 id="tectonic-field-title">{{ fieldName }}场演化</h3>
        <ArtifactPreview v-if="preview" hide-caption :preload-urls="preloadUrls" :artifact="{ id: `${field}-${frameIndex}`, name: `${fieldName}场 · 模拟时间 ${frame?.time}`, type: 'image', format: 'png', preview_url: preview }" />
        <div v-else class="tectonic-empty field-empty" role="status">暂无{{ fieldName }}场图像</div>
        <div v-if="frames.length" class="tectonic-controls">
          <button type="button" :disabled="frames.length < 2" :aria-pressed="playing" @click="togglePlayback">{{ playing ? '暂停' : '播放' }}</button>
          <span class="tectonic-time">模拟时间 <strong>{{ frame?.time }}</strong><small v-if="timeUnit"> {{ timeUnit }}</small></span>
          <input type="range" aria-label="板块场时间帧" min="0" :max="frames.length - 1" :value="frameIndex" :aria-valuetext="`模拟时间 ${frame?.time}，第 ${frameIndex + 1} 帧`" :disabled="frames.length < 2" @input="selectFrame" />
          <output>{{ frameIndex + 1 }} / {{ frames.length }}</output>
        </div>
      </section>
      <section class="tectonic-trend" aria-labelledby="tectonic-trend-title">
        <h3 id="tectonic-trend-title">{{ fieldName }}变化</h3>
        <dl class="tectonic-stats" aria-label="当前帧数值">
          <div><dt>{{ quantityLabel(`当前帧最高${fieldName}`, fieldUnit) }}</dt><dd>{{ formatValue(maximum) }}</dd></div>
          <div><dt>{{ quantityLabel(`当前帧平均${fieldName}`, fieldUnit) }}</dt><dd>{{ formatValue(average) }}</dd></div>
        </dl>
        <BaseChart v-if="rows?.length" :option="trendOption" height="330px" :aria-label="`${fieldName}随模拟时间变化曲线`" />
        <div v-else class="tectonic-empty" role="status">暂无{{ fieldName }}序列</div>
      </section>
    </div>
    <section class="tectonic-convergence" aria-labelledby="tectonic-convergence-title">
      <h3 id="tectonic-convergence-title">非线性求解收敛</h3>
      <BaseChart v-if="data.nonlinear_series?.length" :option="residualOption" height="280px" aria-label="非线性残差随迭代次数变化曲线" />
      <div v-else class="tectonic-empty" role="status">暂无收敛数据</div>
    </section>
  </div>
</template>

<style scoped>
.tectonic-workspace { min-width: 0; font-family: var(--scnet-font-sans); font-weight: 500; }
.tectonic-tabs { display: flex; gap: 24px; padding: 0 32px; border-bottom: 1px solid var(--scnet-divider); }
.tectonic-tabs button { min-height: 54px; padding: 0 4px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--scnet-text-secondary); font-size: 15px; font-weight: 600; cursor: pointer; }
.tectonic-tabs button[aria-pressed="true"] { border-bottom-color: var(--scnet-primary); color: var(--scnet-primary); }
.tectonic-main { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
.tectonic-field, .tectonic-trend, .tectonic-convergence { min-width: 0; padding: 24px 32px; }
.tectonic-trend { border-left: 1px solid var(--scnet-divider); }
.tectonic-convergence { border-top: 1px solid var(--scnet-divider); }
h3 { margin: 0 0 18px; color: var(--scnet-text); font-size: 17px; font-weight: 600; }
.tectonic-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 18px; }
.tectonic-stats > div { padding: 16px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fbfcfe; }
dt { color: var(--scnet-text-secondary); font-size: 14px; font-weight: 600; }
dd { margin: 8px 0 0; font-family: var(--scnet-font-mono); font-size: 22px; font-weight: 600; color: var(--scnet-text); font-variant-numeric: tabular-nums; }
.tectonic-controls { display: flex; align-items: center; gap: 12px; padding-top: 16px; font-size: 14px; color: var(--scnet-text-secondary); }
.tectonic-controls button { min-height: 44px; padding: 0 18px; border: 1px solid #c9d9ec; border-radius: 6px; background: #f5f8fc; color: var(--scnet-primary); cursor: pointer; }
.tectonic-controls button:disabled { opacity: .5; cursor: default; }
.tectonic-time { flex: 0 0 164px; white-space: nowrap; }
.tectonic-time strong { color: var(--scnet-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.tectonic-controls input { flex: 1; min-width: 40px; min-height: 44px; accent-color: var(--scnet-primary); cursor: pointer; }
.tectonic-controls output { min-width: 40px; font-variant-numeric: tabular-nums; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 2px; }
.tectonic-empty { min-height: 280px; display: grid; place-items: center; color: var(--scnet-text-secondary); font-size: 14px; }
.field-empty { height: clamp(260px, 38vw, 480px); border: 1px solid var(--scnet-divider); border-radius: 6px; background: #f8fafc; }
@media (max-width: 1100px) { .tectonic-main { grid-template-columns: 1fr; } .tectonic-trend { border-left: 0; border-top: 1px solid var(--scnet-divider); } }
@media (max-width: 700px) { .tectonic-field, .tectonic-trend, .tectonic-convergence { padding: 18px; } .tectonic-tabs { padding: 0 18px; } .tectonic-controls { flex-wrap: wrap; } .tectonic-controls input { flex-basis: calc(100% - 60px); } .tectonic-stats { grid-template-columns: 1fr; } }
</style>
