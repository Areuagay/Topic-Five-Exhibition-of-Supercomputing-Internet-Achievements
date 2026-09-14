<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { BandDOSData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import SpatialPlot from '../uav/SpatialPlot.vue'
import { scientificLines } from '~/utils/scientific-charts'
import { drugChartStyle } from '~/utils/drug-charts'
import { quantityLabel } from '~/utils/workspace'
import { bandPoints, energyRange } from '~/utils/dft'
const props = defineProps<{ data: BandDOSData }>()
const scfMetric = ref<'total_energy' | 'energy_delta'>('total_energy')
const selectedAtom = ref(0), projection = ref<'y' | 'z'>('y')
const band = computed(() => props.data.band_structure)
const range = computed(() => energyRange(band.value?.bands?.flatMap(b => b.energies) ?? [], props.data.dos_series?.map(d => d.energy) ?? []))
const energyUnit = computed(() => props.data.units?.energy)
const fermi = computed(() => typeof band.value?.fermi_energy === 'number' && Number.isFinite(band.value.fermi_energy) ? band.value.fermi_energy : undefined)
const reference = computed(() => fermi.value === undefined ? undefined : { symbol: 'none', silent: true, lineStyle: { color: '#b57820', type: 'dashed' }, label: { formatter: '费米能级', position: 'insideEndTop' }, data: [{ yAxis: fermi.value }] })
const energyAxis = computed(() => ({ type: 'value', name: quantityLabel('能量', energyUnit.value), scale: true, ...range.value, splitLine: { lineStyle: { color: '#edf1f5' } } }))
const bands = computed<EChartsCoreOption>(() => ({ ...drugChartStyle, tooltip: { trigger: 'axis' }, grid: { left: 68, right: 24, top: 38, bottom: 58 },
  xAxis: { type: 'value', name: quantityLabel('k 路径坐标', props.data.units?.k_position), nameLocation: 'middle', nameGap: 28 }, yAxis: energyAxis.value,
  series: band.value?.bands?.map((b,i) => ({ type: 'line', name: `能带 ${b.band_index}`, showSymbol: false, connectNulls: false, lineStyle: { width: 1.7 }, data: bandPoints(band.value?.k_positions ?? [], b.energies), ...(i === 0 ? { markLine: reference.value } : {}) })) ?? [],
}))
const dos = computed<EChartsCoreOption>(() => ({ ...drugChartStyle, tooltip: { trigger: 'axis' }, grid: { left: 68, right: 24, top: 38, bottom: 58 },
  xAxis: { type: 'value', name: quantityLabel('态密度', props.data.units?.total_dos), nameLocation: 'middle', nameGap: 28 }, yAxis: energyAxis.value,
  series: [{ type: 'line', name: '总态密度', showSymbol: false, lineStyle: { width: 2 }, data: props.data.dos_series?.map(d => [d.total_dos, d.energy]) ?? [], markLine: reference.value }],
}))
const scf = computed(() => scientificLines(props.data.scf_series, 'iteration', '迭代次数', [{ key: scfMetric.value, label: scfMetric.value === 'total_energy' ? '总能量' : '能量变化' }], props.data.units))
const atoms = computed(() => props.data.structure?.atoms ?? [])
const atom = computed(() => atoms.value[selectedAtom.value] ?? atoms.value[0])
const markers = computed(() => atoms.value.map((a,i) => ({ id: `${a.element}-${i+1}`, x:a.x, y:a[projection.value], color:i === selectedAtom.value ? '#c45545' : '#1769d2', label: i === selectedAtom.value ? `${a.element} ${i+1}` : undefined })))
</script>
<template>
  <div class="drug-workspace band-workspace">
    <section class="drug-section"><h3>能带与态密度</h3><div class="drug-toolbar"><span v-if="band?.k_labels?.length">高对称路径：{{ band.k_labels.join(' → ') }}</span><span v-if="fermi !== undefined">{{ quantityLabel('费米能级', energyUnit) }}：{{ fermi }}</span></div><div class="band-pair"><div><BaseChart v-if="band?.bands?.length && band?.k_positions?.length" :option="bands" height="390px" aria-label="电子能带结构" /><div v-else class="drug-empty">暂无能带数据</div></div><div><BaseChart v-if="data.dos_series?.length" :option="dos" height="390px" aria-label="电子态密度" /><div v-else class="drug-empty">暂无态密度数据</div></div></div></section>
    <div class="drug-split"><section class="drug-section"><h3>SCF 自洽迭代</h3><div class="drug-toolbar" role="group" aria-label="SCF 指标"><button :aria-pressed="scfMetric === 'total_energy'" @click="scfMetric = 'total_energy'">总能量</button><button :aria-pressed="scfMetric === 'energy_delta'" @click="scfMetric = 'energy_delta'">能量变化</button></div><BaseChart v-if="data.scf_series?.length" :option="scf" height="330px" aria-label="SCF 迭代曲线" /><div v-else class="drug-empty">暂无 SCF 数据</div>
      <h3 class="subheading">晶格矩阵</h3><div v-if="data.structure?.lattice?.length" class="drug-table" tabindex="0" role="region" aria-label="晶格矩阵"><table><thead><tr><th>晶格向量</th><th v-for="axis in ['X','Y','Z']" :key="axis">{{ quantityLabel(axis, data.units?.lattice) }}</th></tr></thead><tbody><tr v-for="(row,i) in data.structure.lattice" :key="i"><td>{{ ['a','b','c'][i] ?? i+1 }}</td><td v-for="j in [0,1,2]" :key="j">{{ row[j] ?? '—' }}</td></tr></tbody></table></div><div v-else class="drug-empty">暂无晶格数据</div>
    </section><section class="drug-section"><h3>原子坐标投影</h3><template v-if="atoms.length"><div class="drug-toolbar"><label for="dft-atom">选择原子</label><select id="dft-atom" v-model.number="selectedAtom"><option v-for="(a,i) in atoms" :key="i" :value="i">{{ i+1 }} · {{ a.element }}</option></select><button :aria-pressed="projection === 'y'" @click="projection = 'y'">X–Y</button><button :aria-pressed="projection === 'z'" @click="projection = 'z'">X–Z</button></div><SpatialPlot :lines="[]" :markers="markers" :bounds-points="markers" :x-label="quantityLabel('X', data.units?.x)" :y-label="quantityLabel(projection.toUpperCase(), data.units?.[projection])" label="原子坐标投影图" /><p v-if="atom" class="drug-note atom-values">{{ atom.element }} · {{ quantityLabel('X', data.units?.x) }} {{ atom.x }} · {{ quantityLabel('Y', data.units?.y) }} {{ atom.y }} · {{ quantityLabel('Z', data.units?.z) }} {{ atom.z }}</p><p class="drug-note">按提供的坐标展示，未推断化学键。</p></template><div v-else class="drug-empty">暂无原子数据</div></section></div>
  </div>
</template>
<style scoped src="../drug/drug.css"></style>
<style scoped>.band-pair { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:24px; }.band-pair > div { min-width:0; }.drug-split { border-top:1px solid var(--scnet-divider); } @media(max-width:700px) { .band-pair { grid-template-columns:1fr; } }</style>
