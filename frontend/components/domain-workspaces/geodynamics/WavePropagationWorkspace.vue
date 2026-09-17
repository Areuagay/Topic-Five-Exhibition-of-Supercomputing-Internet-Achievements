<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { WavePropagationData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import ArtifactPreview from '~/components/run/ArtifactPreview.vue'
import { quantityLabel, unitText, waveSeries } from '~/utils/workspace'

const props = defineProps<{ data: WavePropagationData }>()
const frameTimeUnit = computed(() => unitText(props.data.units?.simulation_time ?? props.data.units?.time))
const frameIndex = ref(0)
const playing = ref(false)
const frames = computed(() => props.data.wavefield_frames ?? [])
const frame = computed(() => frames.value[frameIndex.value])
const preloadUrls = computed(() => frames.value.map(item => item.preview_url).filter(Boolean))
const partitions = computed(() => props.data.domain_partitions ?? [])
const totals = computed(() => partitions.value.reduce((sum, item) => ({ cells: sum.cells + item.cells, cores: sum.cores + item.cores }), { cells: 0, cores: 0 }))
let timer: ReturnType<typeof setInterval> | undefined
function stop() { playing.value = false; clearInterval(timer); timer = undefined }
function togglePlayback() {
  if (playing.value) return stop()
  if (frames.value.length < 2) return
  playing.value = true
  timer = setInterval(() => { frameIndex.value = (frameIndex.value + 1) % frames.value.length }, 800)
}
function selectFrame(event: Event) {
  stop()
  frameIndex.value = Number((event.target as HTMLInputElement).value)
}
watch(() => props.data, () => { stop(); frameIndex.value = 0 })
onBeforeUnmount(stop)
onDeactivated(stop)

function chart(rows: Record<string, unknown>[] | undefined, x: string, y: string, name: string, xName: string, yName: string, logarithmic = false): EChartsCoreOption {
  return {
    color: ['#1769d2'],
    textStyle: { fontFamily: '"Noto Sans SC", MiSans, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif', fontSize: 13, fontWeight: 500 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(37, 48, 68, 0.94)', borderWidth: 0, textStyle: { color: '#fff' } },
    legend: { bottom: 0, textStyle: { color: '#687588' } },
    grid: { left: 78, right: 30, top: 42, bottom: 66 },
    xAxis: { type: 'value', name: xName, nameLocation: 'middle', nameGap: 28, axisLabel: { color: '#7d899a' } },
    yAxis: { type: logarithmic ? 'log' : 'value', scale: true, name: yName, nameTextStyle: { align: 'left' }, axisLabel: { color: '#7d899a' }, splitLine: { lineStyle: { color: '#edf1f5' } } },
    series: [{ name, type: 'line', smooth: false, showSymbol: false, connectNulls: false, lineStyle: { width: 2 }, data: waveSeries(rows, x, y).map(([a, b]) => [a, logarithmic && b !== null && b <= 0 ? null : b]) }],
  }
}
const residualOption = computed(() => chart(props.data.residual_series, 'iteration', 'residual', 'Residual', '迭代次数', `${quantityLabel('残差', props.data.units?.residual)} · 对数刻度`, true))
const seismogramOption = computed(() => chart(props.data.seismogram_series, 'time', 'amplitude', 'Seismogram', quantityLabel('时间', props.data.units?.time), quantityLabel('振幅', props.data.units?.amplitude)))
</script>

<template>
  <div class="wave-workspace">
    <section class="wave-field" aria-labelledby="wave-field-title">
      <div class="wave-heading"><h3 id="wave-field-title">波场快照</h3></div>
      <ArtifactPreview v-if="frame" hide-caption :preload-urls="preloadUrls" :artifact="{ id: frame.artifact_id, name: `波场 · ${frame.simulation_time}${frameTimeUnit ? ` ${frameTimeUnit}` : ''}`, type: 'image', format: 'png', preview_url: frame.preview_url, source_type: data.source_type }" />
      <div v-else class="wave-empty" role="status">暂无波场快照，仍可查看下方曲线。</div>
      <div v-if="frames.length" class="wave-controls">
        <button type="button" :disabled="frames.length < 2" :aria-pressed="playing" @click="togglePlayback">{{ playing ? '暂停' : '播放' }}</button>
        <div v-if="frame" class="wave-frame-meta"><span>计算步 <strong>{{ frame.step }}</strong></span><span>模拟时间 <strong>{{ frame.simulation_time }} <small v-if="frameTimeUnit">{{ frameTimeUnit }}</small></strong></span></div>
        <label for="wave-frame">时间帧</label>
        <input id="wave-frame" type="range" min="0" :max="frames.length - 1" :value="frameIndex" :disabled="frames.length < 2" :aria-valuetext="frame ? `${frame.simulation_time}${frameTimeUnit ? ` ${frameTimeUnit}` : ''}，第 ${frameIndex + 1} 帧` : ''" @input="selectFrame" />
        <output for="wave-frame">{{ frameIndex + 1 }} / {{ frames.length }}</output>
      </div>
    </section>
    <div class="wave-curves">
      <section aria-labelledby="wave-residual-title">
        <div class="wave-heading"><h3 id="wave-residual-title">求解残差 <small>Residual</small></h3></div>
        <BaseChart v-if="data.residual_series?.length" :option="residualOption" height="300px" aria-label="求解残差随迭代次数变化曲线" />
        <div v-else class="wave-empty">暂无残差数据</div>
      </section>
      <section aria-labelledby="wave-seismogram-title">
        <div class="wave-heading"><h3 id="wave-seismogram-title">地震波形 <small>Seismogram</small></h3></div>
        <BaseChart v-if="data.seismogram_series?.length" :option="seismogramOption" height="300px" aria-label="地震波振幅随时间变化曲线" />
        <div v-else class="wave-empty">暂无地震波形数据</div>
      </section>
    </div>
    <section class="wave-partitions" aria-labelledby="wave-partitions-title">
      <div class="wave-heading"><h3 id="wave-partitions-title">计算域分区</h3></div>
      <p class="partition-summary">{{ partitions.length }} 个分区 · {{ totals.cells.toLocaleString() }} 网格 · {{ totals.cores.toLocaleString() }} 核</p>
      <div v-if="partitions.length" class="wave-partition-grid">
        <dl v-for="partition in partitions" :key="partition.partition_id">
          <dt>分区 {{ partition.partition_id }}</dt><dd>{{ partition.cells.toLocaleString() }} <small>网格</small></dd><dd class="partition-cores">{{ partition.cores }} 核</dd>
        </dl>
      </div>
      <div v-else class="wave-empty">暂无分区数据</div>
    </section>
  </div>
</template>

<style scoped>
.wave-workspace { min-width: 0; font-family: var(--scnet-font-sans); font-weight: 500; }
.wave-field, .wave-partitions { padding: 24px 32px; }
.wave-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
h3 { margin: 0; color: var(--scnet-text); font-size: 17px; font-weight: 600; }
.wave-heading > span { font-size: 12px; color: var(--scnet-text-muted); }
.wave-heading h3 small { margin-left: 8px; font-size: 14px; font-weight: 500; }
.wave-field > .wave-heading { margin-bottom: 18px; }
.wave-frame-meta { display: flex; flex: 0 0 245px; gap: 20px; color: var(--scnet-text-secondary); font-size: 14px; white-space: nowrap; }
.wave-frame-meta strong { margin-left: 8px; color: var(--scnet-text); font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.wave-frame-meta small { font-size: 14px; }
.wave-controls { display: flex; align-items: center; gap: 16px; padding-top: 16px; font-size: 13px; color: var(--scnet-text-muted); }
.wave-controls button { min-height: 44px; padding: 0 22px; border: 1px solid #c9d9ec; border-radius: 6px; background: #f5f8fc; color: var(--scnet-primary); cursor: pointer; }
.wave-controls button:hover { background: #edf4fc; }
.wave-controls button:disabled { opacity: .5; cursor: default; }
.wave-controls input { flex: 1; min-width: 50px; min-height: 44px; accent-color: var(--scnet-primary); cursor: pointer; }
.wave-controls output { min-width: 52px; font-variant-numeric: tabular-nums; }
.wave-controls :focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 2px; }
.wave-curves { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--scnet-divider); border-bottom: 1px solid var(--scnet-divider); }
.wave-curves > section { min-width: 0; padding: 24px; }
.wave-curves > section + section { border-left: 1px solid var(--scnet-divider); }
.wave-partition-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
dl { margin: 0; padding: 14px 18px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fbfcfe; }
dt { font-size: 14px; font-weight: 600; color: var(--scnet-text-secondary); }
dd { margin: 8px 0 0; color: var(--scnet-text); font-family: var(--scnet-font-mono); font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
small, .partition-cores { font-family: var(--scnet-font-sans); font-size: 14px; font-weight: 500; color: var(--scnet-text-secondary); }
.partition-summary { margin: 10px 0 0; font-size: 14px; font-weight: 500; color: var(--scnet-text-secondary); }
.wave-empty { min-height: 180px; display: grid; place-items: center; color: var(--scnet-text-muted); font-size: 14px; }
@media (max-width: 1000px) { .wave-curves { grid-template-columns: 1fr; } .wave-curves > section + section { border-left: 0; border-top: 1px solid var(--scnet-divider); } .wave-partition-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .wave-field, .wave-partitions, .wave-curves > section { padding: 18px; } .wave-controls { flex-wrap: wrap; gap: 8px; } .wave-frame-meta { flex: 1; gap: 12px; } .wave-controls input { flex-basis: calc(100% - 68px); } .wave-controls label { display: none; } .wave-partition-grid { grid-template-columns: 1fr; } }
</style>
