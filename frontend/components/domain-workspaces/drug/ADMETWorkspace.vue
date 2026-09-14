<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { ADMETData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import { admetProperties, filterCandidates, sortCandidates, radarBounds } from '~/utils/drug'
import type { ADMETProperty } from '~/utils/drug'
import { distributionChart, drugChartStyle } from '~/utils/drug-charts'
import { quantityLabel } from '~/utils/workspace'
const props = defineProps<{ data: ADMETData }>()
const query = ref(''), selectedId = ref('')
const status = ref<'all' | 'passed' | 'failed'>('all')
const property = ref<ADMETProperty>('absorption')
const order = ref<ADMETProperty>('toxicity')
const ascending = ref(true)
const candidates = computed(() => sortCandidates(filterCandidates(props.data.candidate_properties ?? [], query.value, status.value), order.value, ascending.value))
const selected = computed(() => candidates.value.find(c => c.compound_id === selectedId.value) ?? candidates.value[0])
const label = (key: ADMETProperty) => quantityLabel(admetProperties.find(p => p.key === key)!.label, props.data.units?.[key])
const radar = computed<EChartsCoreOption>(() => ({
  ...drugChartStyle, tooltip: { trigger: 'item' },
  radar: { center: ['50%', '53%'], radius: '62%', splitNumber: 4, axisName: { color: '#606266', fontSize: 13, fontWeight: 600 }, indicator: admetProperties.map(p => ({ name: label(p.key), ...radarBounds([...(props.data.candidate_properties ?? []).map(c => c[p.key]), ...(props.data.property_distribution?.[p.key]?.bins ?? []).flatMap(b => [b.min, b.max])]) })) },
  series: [{ type: 'radar', areaStyle: { opacity: .12 }, lineStyle: { width: 2 }, data: selected.value ? [{ name: selected.value.compound_id, value: admetProperties.map(p => selected.value![p.key]) }] : [] }],
}))
const hasRadar = computed(() => selected.value && admetProperties.every(p => typeof selected.value?.[p.key] === 'number' && Number.isFinite(selected.value[p.key])))
const cells = computed(() => candidates.value.flatMap((c, y) => admetProperties.flatMap((p, x) => typeof c[p.key] === 'number' && Number.isFinite(c[p.key]) ? [[x, y, c[p.key]]] : [])))
const heatmap = computed<EChartsCoreOption>(() => {
  const range = radarBounds(cells.value.map(c => c[2]!))
  return {
    ...drugChartStyle, grid: { left: 146, right: 28, top: 44, bottom: 72 },
    tooltip: { formatter: (raw: unknown) => {
      const item = raw as { value?: number[] }
      if (!item.value) return ''
      const [x, y, value] = item.value
      return `${candidates.value[y!]?.compound_id ?? ''}\n${label(admetProperties[x!]!.key)}: ${value}`
    }, renderMode: 'richText' },
    xAxis: { type: 'category', position: 'top', data: admetProperties.map(p => label(p.key)), axisLabel: { interval: 0 } },
    yAxis: { type: 'category', inverse: true, data: candidates.value.map(c => c.compound_id), axisLabel: { interval: 0, fontSize: 12 } },
    visualMap: { min: range.min, max: range.max, calculable: true, orient: 'horizontal', left: 'center', bottom: 4, inRange: { color: ['#f1f6fc', '#8cb8e9', '#1769d2'] }, text: ['高值', '低值'] },
    series: [{ type: 'heatmap', data: cells.value, label: { show: candidates.value.length <= 12 }, emphasis: { itemStyle: { borderColor: '#174f8f', borderWidth: 2 } } }],
  }
})
function selectCell(raw: unknown) {
  const item = raw as { value?: number[] }
  const index = item.value?.[1]
  if (typeof index === 'number') selectedId.value = candidates.value[index]?.compound_id ?? ''
}
const risk = computed<EChartsCoreOption>(() => ({ ...drugChartStyle, tooltip: { trigger: 'axis' }, grid: { left: 64, right: 24, top: 32, bottom: 45 },
  xAxis: { type: 'category', data: props.data.risk_distribution?.map(r => ({ low: '低风险', medium: '中风险', high: '高风险' } as Record<string, string>)[r.risk_level] ?? r.risk_level) },
  yAxis: { type: 'value', name: '数量', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f5' } } },
  series: [{ type: 'bar', name: '候选数量', barMaxWidth: 60, data: props.data.risk_distribution?.map(r => ({ value: r.count, itemStyle: { color: ({ low: '#4d8b78', medium: '#b57820', high: '#c36d59' } as Record<string, string>)[r.risk_level] ?? '#1769d2' } })) }],
}))
const propertyData = computed(() => props.data.property_distribution?.[property.value])
const distribution = computed(() => distributionChart(propertyData.value?.bins, admetProperties.find(p => p.key === property.value)!.label, props.data.units?.[property.value]))
const rules = computed(() => [
  { key: 'toxicity_lt', property: 'toxicity', operator: '<' }, { key: 'absorption_gt', property: 'absorption', operator: '>' }, { key: 'distribution_gt', property: 'distribution', operator: '>' },
].flatMap(rule => { const value = props.data.filter_rule?.[rule.key as keyof NonNullable<ADMETData['filter_rule']>]; return typeof value === 'number' ? [`${label(rule.property as ADMETProperty)} ${rule.operator} ${value}`] : [] }))
</script>
<template>
  <div class="drug-workspace admet-workspace">
    <section class="drug-section"><h3>性质筛选概况</h3><dl class="drug-stats"><div><dt>候选总数</dt><dd>{{ data.admet_summary?.total?.toLocaleString() ?? '—' }}</dd></div><div><dt>筛选通过</dt><dd>{{ data.admet_summary?.passed?.toLocaleString() ?? '—' }}</dd></div><div><dt>未通过</dt><dd>{{ data.admet_summary?.failed?.toLocaleString() ?? '—' }}</dd></div></dl><p class="drug-note">{{ rules.length ? `筛选条件：${rules.join('；')}` : '暂无筛选条件数据' }}</p>
      <div class="drug-toolbar"><label for="admet-search">搜索编号</label><input id="admet-search" v-model="query" type="search" placeholder="输入化合物编号" /><label for="admet-status">通过状态</label><select id="admet-status" v-model="status"><option value="all">全部</option><option value="passed">通过</option><option value="failed">未通过</option></select><label for="admet-sort">排序</label><select id="admet-sort" v-model="order"><option v-for="p in admetProperties" :key="p.key" :value="p.key">{{ p.label }}</option></select><button :aria-pressed="ascending" @click="ascending = !ascending">{{ ascending ? '升序' : '降序' }}</button><span class="candidate-count">{{ candidates.length }} / {{ data.candidate_properties?.length ?? 0 }} 条候选</span></div>
      <div v-if="candidates.length" class="drug-table" tabindex="0" role="region" aria-label="ADMET 候选列表"><table><thead><tr><th>化合物编号</th><th v-for="p in admetProperties" :key="p.key">{{ label(p.key) }}</th><th>筛选结果</th></tr></thead><tbody><tr v-for="item in candidates" :key="item.compound_id" :class="{ selected: selected?.compound_id === item.compound_id }"><td><button :aria-pressed="selected?.compound_id === item.compound_id" @click="selectedId = item.compound_id">{{ item.compound_id }}</button></td><td v-for="p in admetProperties" :key="p.key">{{ item[p.key] ?? '—' }}</td><td :class="item.passed === true ? 'status-pass' : 'status-fail'">{{ item.passed === true ? '通过' : item.passed === false ? '未通过' : '—' }}</td></tr></tbody></table></div><div v-else class="drug-empty">{{ data.candidate_properties?.length ? '无匹配候选' : '暂无候选数据' }}</div>
    </section>
    <div class="drug-split candidate-analysis">
      <section class="drug-section"><h3>候选性质画像</h3><p class="drug-note selected-candidate">{{ selected?.compound_id ?? '未选择候选' }}</p><BaseChart v-if="hasRadar" :option="radar" height="360px" aria-label="ADMET 五项性质雷达图" /><div v-else class="drug-empty">暂无完整的候选性质数据</div><p class="drug-note">雷达轴范围随返回数据确定；查看精确数值请使用上方候选表。</p></section>
      <section class="drug-section"><h3>候选 × 性质热力图</h3><div v-if="cells.length" class="heatmap-scroll" tabindex="0" role="region" aria-label="候选性质热力图区域"><BaseChart :option="heatmap" :height="`${Math.max(300,candidates.length*26+120)}px`" aria-label="候选性质热力图" @chart-click="selectCell" /></div><div v-else class="drug-empty">暂无候选性质数据</div><p class="drug-note">点击色块选择候选；颜色表示原始数值大小。</p></section>
    </div>
    <div class="drug-split">
      <section class="drug-section"><h3>风险分布</h3><BaseChart v-if="data.risk_distribution?.length" :option="risk" height="300px" aria-label="ADMET 风险分布" /><div v-else class="drug-empty">暂无风险分布数据</div></section>
      <section class="drug-section"><h3>性质分布</h3><div class="drug-toolbar"><label for="admet-property">查看性质</label><select id="admet-property" v-model="property"><option v-for="p in admetProperties" :key="p.key" :value="p.key">{{ p.label }}</option></select><span v-if="propertyData">均值 {{ propertyData.mean ?? '—' }} · 标准差 {{ propertyData.std ?? '—' }}{{ data.units?.[property] ? ` ${data.units[property]}` : '' }}</span></div><BaseChart v-if="propertyData?.bins?.length" :option="distribution" height="300px" aria-label="ADMET 性质分布直方图" /><div v-else class="drug-empty">暂无该性质分布数据</div></section>
    </div>
  </div>
</template>
<style scoped src="./drug.css"></style>
<style scoped>.candidate-analysis, .drug-split + .drug-split { border-top:1px solid var(--scnet-divider); }.heatmap-scroll { max-height:440px; overflow:auto; }.heatmap-scroll:focus-visible { outline:2px solid var(--scnet-primary); outline-offset:2px; }.selected-candidate { font-family:var(--scnet-font-mono); font-weight:600; color:var(--scnet-primary); }</style>
