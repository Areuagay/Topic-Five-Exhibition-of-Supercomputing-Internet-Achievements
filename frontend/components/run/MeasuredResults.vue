<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProvidedResult } from '~/types/provided-results'
import type { Artifact } from '~/types'
import { resolveArtifactUrl } from '~/utils/workspace'
import { formatBytes } from '~/composables/useFormat'
import ArtifactActions from './ArtifactActions.vue'

const props = defineProps<{ result: ProvidedResult }>()
const config = useRuntimeConfig()
const field = ref<'temperature' | 'velocity'>('temperature')
const selectedOperator = ref('ai-data-prep')
const selectedTrial = ref(1)
const operator = computed(() => props.result.training?.operators.find(item => item.id === selectedOperator.value) ?? props.result.training?.operators[0])
const fieldName = computed(() => field.value === 'temperature' ? '温度' : '速度模长')
const preview = computed(() => props.result.artifacts.find(item => item.type === 'image'))
const previewUrl = computed(() => resolveArtifactUrl(preview.value?.preview_url, config.public.apiBase))
const stats = computed(() => props.result.snapshot?.statistics[field.value])
const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
const splitName = (value: string) => ({ train: '训练集', validation: '验证集', test: '测试集' }[value] ?? value)
const heatmap = computed(() => {
  const snapshot = props.result.snapshot
  if (!snapshot) return {}
  const slice = snapshot.slice
  const cells = slice[field.value]
  return {
    animation: false,
    grid: { top: 40, left: 65, right: 24, bottom: 100 },
    tooltip: { formatter: (item: { data: number[] }) => {
      const [x, y, value] = item.data
      return `纬度：${number(slice.latitudes[x!]!)}°<br/>半径：${number(slice.radii[y!]!)}<br/>${fieldName.value}：${number(value!)}`
    } },
    xAxis: { type: 'category', name: '纬度 (°)', nameLocation: 'middle', nameGap: 30, data: slice.latitudes.map(value => value.toFixed(2)), inverse: true, axisLabel: { interval: 11 } },
    yAxis: { type: 'category', name: '半径（原始值）', data: slice.radii.map(value => value.toFixed(3)), axisLabel: { interval: 7 } },
    visualMap: { min: Math.min(...cells.map(cell => cell[2]!)), max: Math.max(...cells.map(cell => cell[2]!)), calculable: true, orient: 'horizontal', left: 'center', bottom: 0, precision: 3, inRange: { color: ['#253494', '#2c7fb8', '#41b6c4', '#ffffb2', '#fe9929', '#d7301f'] } },
    series: [{ name: fieldName.value, type: 'heatmap', data: cells, progressive: 0 }],
  }
})
const lossChart = computed(() => {
  const op = operator.value
  if (!op) return {}
  const rows = op.series.filter(row => row.trial === undefined || row.trial === selectedTrial.value)
  const lora = op.id === 'peft-lora'
  return {
    color: ['#216bc4', '#24a68a'], tooltip: { trigger: 'axis' }, legend: { bottom: 0 },
    grid: { left: 55, right: 25, top: 35, bottom: 65 },
    xAxis: { type: 'category', name: lora ? '' : '轮次', nameLocation: 'middle', nameGap: 28, data: lora ? ['训练损失', '验证损失'] : rows.map(row => row.epoch) },
    yAxis: { type: 'value', name: '损失' },
    series: [{ name: '损失', type: lora ? 'bar' : 'line', smooth: false, showSymbol: true, barMaxWidth: 60, data: lora ? [rows[0]?.loss, rows[0]?.eval_loss] : rows.map(row => row.loss) }],
  }
})
const accuracyChart = computed(() => {
  const rows = operator.value?.series.filter(row => row.trial === undefined || row.trial === selectedTrial.value) ?? []
  return {
    color: ['#24a68a'], tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value}%` },
    grid: { left: 55, right: 25, top: 35, bottom: 65 },
    xAxis: { type: 'category', name: '轮次', nameLocation: 'middle', nameGap: 28, data: rows.map(row => row.epoch) },
    yAxis: { type: 'value', name: '训练准确率 (%)', min: 0, max: 100 },
    series: [{ name: '训练准确率', type: 'line', smooth: false, showSymbol: true, data: rows.map(row => row.accuracy) }],
  }
})
</script>

<template>
  <section class="measured-results" aria-label="提供方实测算例">
    <header class="measured-heading">
      <h2>{{ result.title }}</h2><span>提供方算例 · {{ result.source_name }}</span>
    </header>
    <div class="measured-body">
      <dl class="measured-facts">
        <div v-for="item in result.summary" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ typeof item.value === 'number' ? item.value.toLocaleString('zh-CN', { maximumFractionDigits: 8 }) : item.value }}<small>{{ item.unit }}</small></dd></div>
      </dl>

      <template v-if="result.snapshot">
        <div class="measured-section-title"><h3>经度 {{ result.snapshot.slice.longitude_degrees.toFixed(0) }}°E 剖面</h3>
          <div class="measured-controls" role="group" aria-label="选择实测场">
            <button class="sc-action sc-action--small" :aria-pressed="field === 'temperature'" @click="field = 'temperature'">温度</button>
            <button class="sc-action sc-action--small" :aria-pressed="field === 'velocity'" @click="field = 'velocity'">速度模长</button>
          </div>
        </div>
        <BaseChart :option="heatmap" height="440px" :aria-label="`${fieldName}实测剖面`" />
        <dl v-if="stats" class="measured-facts field-statistics">
          <div><dt>全场最小值</dt><dd>{{ number(stats.min) }}</dd></div>
          <div><dt>全场最大值</dt><dd>{{ number(stats.max) }}</dd></div>
          <div><dt>全场平均值</dt><dd>{{ number(stats.mean) }}</dd></div>
        </dl>
        <p class="measured-note">{{ result.snapshot.unit_note }} 当前材料为单个时间快照。</p>
        <details v-if="previewUrl" class="measured-disclosure"><summary>查看提供方原始结果图</summary><img :src="previewUrl" alt="提供方 CitcomCU 温度与速度剖面原图" loading="lazy" /></details>
      </template>

      <template v-if="result.training && operator">
        <div class="measured-controls operator-controls" role="group" aria-label="选择实测算子">
          <button v-for="item in result.training.operators" :key="item.id" class="sc-action sc-action--small" :aria-pressed="item.id === operator.id" @click="selectedOperator = item.id">{{ item.id }}</button>
        </div>
        <div class="measured-section-title"><h3>{{ operator.title }}</h3><span class="mono">{{ result.training.run_id }}</span></div>
        <dl class="measured-facts"><div v-for="item in operator.facts" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}<small>{{ item.unit }}</small></dd></div></dl>
        <el-table v-if="operator.splits" :data="operator.splits" stripe>
          <el-table-column label="数据划分"><template #default="{ row }">{{ splitName(row.split) }}</template></el-table-column>
          <el-table-column prop="images" label="图像数" /><el-table-column prop="samples" label="样本数" />
        </el-table>
        <div v-if="operator.trials.length" class="measured-controls trial-controls" role="group" aria-label="选择对比试验">
          <button v-for="trial in operator.trials" :key="trial.trial" class="sc-action sc-action--small" :aria-pressed="selectedTrial === trial.trial" @click="selectedTrial = trial.trial">试验 {{ trial.trial }}</button>
        </div>
        <div v-if="operator.series.length" class="measured-charts" :class="{ single: operator.id === 'peft-lora' }">
          <BaseChart :key="`${operator.id}-${selectedTrial}-loss`" :option="lossChart" height="300px" aria-label="实测训练损失" />
          <BaseChart v-if="operator.series.some(row => row.accuracy !== undefined)" :key="`${operator.id}-${selectedTrial}-accuracy`" :option="accuracyChart" height="300px" aria-label="实测训练准确率" />
        </div>
        <el-table v-if="operator.trials.length" :data="operator.trials" stripe>
          <el-table-column prop="trial" label="试验" width="70" />
          <el-table-column prop="baseline_seconds" label="基线耗时 (s)" min-width="120" />
          <el-table-column prop="parallel_seconds" label="并行耗时 (s)" min-width="120" />
          <el-table-column prop="time_reduction_percent" label="耗时降低 (%)" min-width="130" />
          <el-table-column prop="baseline_util_percent" label="基线利用率 (%)" min-width="145" />
          <el-table-column prop="parallel_util_percent" label="并行利用率 (%)" min-width="145" />
          <el-table-column prop="relative_util_gain_percent" label="利用率相对提升 (%)" min-width="170" />
        </el-table>
        <details class="measured-disclosure" :key="operator.id"><summary>查看算子原始日志</summary><pre>{{ operator.logs.join('\n') }}</pre></details>
        <details v-if="operator.output_paths.length" class="measured-disclosure"><summary>日志记录的输出路径</summary><p class="measured-note">以下路径来自原始日志，对应文件尚未提供。</p><pre>{{ operator.output_paths.join('\n') }}</pre></details>
      </template>

      <div class="measured-section-title files-heading"><h3>原始结果文件</h3><span>{{ result.artifacts.length }} 项</span></div>
      <el-table :data="result.artifacts" stripe>
        <el-table-column prop="name" label="文件名称" min-width="230" />
        <el-table-column prop="format" label="格式" width="90" />
        <el-table-column label="大小" width="105"><template #default="{ row }">{{ formatBytes(row.size) }}</template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right"><template #default="{ row }"><ArtifactActions :artifact="row as Artifact" source-type="provided" /></template></el-table-column>
      </el-table>
    </div>
  </section>
</template>

<style scoped>
.measured-results { min-width: 0; overflow: hidden; border: 1px solid var(--scnet-divider); border-radius: 10px; background: var(--scnet-panel); box-shadow: 0 2px 8px rgb(31 45 61 / 3.5%); }
.measured-heading { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; padding:24px 32px; border-bottom:1px solid var(--scnet-divider); }
.measured-heading h2 { margin:0; font-size:19px; font-weight:650; color:var(--scnet-text); }
.measured-heading > span, .measured-section-title > span { font-size:12px; color:var(--scnet-text-muted); overflow-wrap:anywhere; }
.measured-body { padding:24px 32px; }
.measured-facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:22px; margin:0 0 28px; }
.measured-facts dt { color:var(--scnet-text-secondary); font-size:13px; margin-bottom:10px; }
.measured-facts dd { margin:0; color:var(--scnet-text); font-size:23px; font-weight:650; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.measured-facts small { font-size:12px; font-weight:400; margin-left:5px; color:var(--scnet-text-muted); }
.measured-section-title { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; margin:24px 0 18px; }
.measured-section-title h3 { margin:0; font-size:16px; font-weight:600; }
.measured-controls { display:flex; flex-wrap:wrap; gap:10px; }
.measured-controls [aria-pressed="true"] { color:var(--scnet-primary); background:var(--scnet-primary-soft); border-color:var(--scnet-primary); }
.operator-controls { border-top:1px solid var(--scnet-divider); padding-top:24px; }
.trial-controls { margin-top:24px; }
.measured-charts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; margin:18px 0; }
.measured-charts :deep(.base-chart) { min-width:0; }
.measured-charts.single { grid-template-columns:minmax(0,1fr); }
.field-statistics { margin:28px 0 18px; }
.measured-note { font-size:13px; line-height:1.7; color:var(--scnet-text-muted); }
.measured-disclosure { margin-top:20px; border:1px solid var(--scnet-divider); border-radius:6px; overflow:hidden; }
.measured-disclosure summary { cursor:pointer; padding:16px; font-size:14px; color:var(--scnet-text-secondary); }
.measured-disclosure summary:focus-visible { outline:2px solid var(--scnet-primary); outline-offset:-2px; }
.measured-disclosure img { display:block; width:100%; height:auto; }
.measured-disclosure pre { margin:0; padding:18px; overflow:auto; max-height:400px; background:var(--scnet-subtle); font:12px/1.8 var(--scnet-font-mono,monospace); }
.measured-disclosure p { padding:0 18px; }
.files-heading { margin-top:32px; }
@media(max-width:700px) { .measured-heading,.measured-body { padding:20px; } .measured-charts { grid-template-columns:minmax(0,1fr); } .measured-facts { grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px 12px; } .measured-facts dd { font-size:20px; } }
</style>
