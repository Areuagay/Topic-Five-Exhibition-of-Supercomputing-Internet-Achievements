<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { HighThroughputData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import { filterMaterials } from '~/utils/dft'
import { sortCandidates } from '~/utils/drug'
import { drugChartStyle } from '~/utils/drug-charts'
import { quantityLabel } from '~/utils/workspace'
const props = defineProps<{ data: HighThroughputData }>()
const query = ref(''), cluster = ref(''), selectedId = ref('')
const status = ref<'all' | 'converged' | 'unconverged' | 'ranked'>('all')
const order = ref<'formation_energy' | 'band_gap' | 'stability_score'>('formation_energy')
const ascending = ref(true)
const ranking = computed(() => [...(props.data.candidate_ranking ?? [])].sort((a,b) => a.rank-b.rank))
const materials = computed(() => sortCandidates(filterMaterials(props.data.materials ?? [], query.value, cluster.value, status.value, ranking.value.map(r => r.material_id)), order.value, ascending.value))
const selected = computed(() => materials.value.find(m => m.material_id === selectedId.value) ?? materials.value[0])
const centerName = (id: string) => props.data.cluster_distribution?.find(c => c.cluster_id === id)?.cluster_name || id
const centers = computed(() => [...new Set([...(props.data.cluster_distribution ?? []).map(c => c.cluster_id), ...(props.data.materials ?? []).map(m => m.cluster_id)])])
const label = (key: string, name: string) => quantityLabel(name, props.data.units?.[key])
const scatter = computed<EChartsCoreOption>(() => ({ ...drugChartStyle, grid: { left: 72, right: 32, top: 45, bottom: 58 },
  tooltip: { trigger: 'item', renderMode: 'richText', formatter: (raw: unknown) => { const p = raw as { data?: { materialId?: string } }; const m = materials.value.find(m => m.material_id === p.data?.materialId); return m ? `${m.material_id} · ${m.formula}\n${label('formation_energy','形成能')}: ${m.formation_energy}\n${label('band_gap','带隙')}: ${m.band_gap}\n${label('stability_score','稳定性评分')}: ${m.stability_score}` : '' } },
  xAxis: { type: 'value', name: label('formation_energy','形成能'), nameLocation: 'middle', nameGap: 30, scale: true },
  yAxis: { type: 'value', name: label('band_gap','带隙'), scale: true, splitLine: { lineStyle: { color: '#edf1f5' } } },
  series: [{ type: 'scatter', data: materials.value.filter(m => Number.isFinite(m.formation_energy) && Number.isFinite(m.band_gap)).map(m => ({ name: m.material_id, materialId: m.material_id, value: [m.formation_energy,m.band_gap], symbolSize: selected.value?.material_id === m.material_id ? 15 : 8, itemStyle: { color: selected.value?.material_id === m.material_id ? '#c36d59' : m.converged === true ? '#1769d2' : '#9ba6b4', opacity: .8 } })) }],
}))
function selectScatter(raw: unknown) { const p = raw as { data?: { materialId?: string } }; if (p.data?.materialId) selectedId.value = p.data.materialId }
function selectRank(id: string) { query.value = ''; cluster.value = ''; status.value = 'all'; selectedId.value = id }
const distribution = computed<EChartsCoreOption>(() => ({ ...drugChartStyle, tooltip: { trigger: 'axis' }, grid: { left: 56, right: 24, top: 32, bottom: 45 }, xAxis: { type: 'category', data: props.data.cluster_distribution?.map(c => c.cluster_name || c.cluster_id) }, yAxis: { type: 'value', name: '分配数量', minInterval: 1 }, series: [{ type: 'bar', name: '已分配材料', barMaxWidth: 50, data: props.data.cluster_distribution?.map(c => c.assigned) }] }))
const rules = computed(() => {
  const r = props.data.filter_rule
  if (!r) return []
  return [typeof r.converged === 'boolean' ? `收敛：${r.converged ? '是' : '否'}` : '', typeof r.formation_energy_lt === 'number' ? `${label('formation_energy','形成能')} < ${r.formation_energy_lt}` : '', r.band_gap_range?.length === 2 ? `${label('band_gap','带隙范围')} ${r.band_gap_range.join(' ～ ')}` : '', typeof r.stability_score_gt === 'number' ? `${label('stability_score','稳定性评分')} > ${r.stability_score_gt}` : ''].filter(Boolean)
})
const facts = [{ key:'total', label:'材料总数' }, { key:'completed', label:'已完成' }, { key:'converged', label:'已收敛' }, { key:'failed', label:'失败' }, { key:'qualified', label:'符合筛选条件' }] as const
</script>
<template>
  <div class="drug-workspace throughput-workspace">
    <section class="drug-section"><h3>批量计算概况</h3><dl class="drug-stats"><div v-for="f in facts" :key="f.key"><dt>{{ f.label }}</dt><dd>{{ data.batch_summary?.[f.key]?.toLocaleString() ?? '—' }}</dd></div></dl><p class="drug-note">{{ rules.length ? `筛选条件：${rules.join('；')}` : '暂无筛选条件数据' }}</p>
      <div class="drug-toolbar"><label for="material-search">搜索材料</label><input id="material-search" v-model="query" type="search" placeholder="材料编号或化学式" /><label for="material-center">计算中心</label><select id="material-center" v-model="cluster"><option value="">全部中心</option><option v-for="id in centers" :key="id" :value="id">{{ centerName(id) }}</option></select><label for="material-status">状态</label><select id="material-status" v-model="status"><option value="all">全部</option><option value="converged">已收敛</option><option value="unconverged">未收敛</option><option value="ranked">已列入候选排名</option></select><label for="material-sort">排序</label><select id="material-sort" v-model="order"><option value="formation_energy">形成能</option><option value="band_gap">带隙</option><option value="stability_score">稳定性评分</option></select><button :aria-pressed="ascending" @click="ascending = !ascending">{{ ascending ? '升序' : '降序' }}</button><span>{{ materials.length }} / {{ data.materials?.length ?? 0 }} 条材料</span></div>
      <div v-if="materials.length" class="drug-table" tabindex="0" role="region" aria-label="材料属性列表"><table><thead><tr><th>材料编号</th><th>化学式</th><th>{{ label('formation_energy','形成能') }}</th><th>{{ label('band_gap','带隙') }}</th><th>{{ label('stability_score','稳定性评分') }}</th><th>收敛</th><th>计算中心</th></tr></thead><tbody><tr v-for="m in materials" :key="m.material_id" :class="{ selected:selected?.material_id === m.material_id }"><td><button :aria-pressed="selected?.material_id === m.material_id" @click="selectedId = m.material_id">{{ m.material_id }}</button></td><td>{{ m.formula }}</td><td>{{ m.formation_energy ?? '—' }}</td><td>{{ m.band_gap ?? '—' }}</td><td>{{ m.stability_score ?? '—' }}</td><td>{{ m.converged === true ? '是' : m.converged === false ? '否' : '—' }}</td><td>{{ centerName(m.cluster_id) }}</td></tr></tbody></table></div><div v-else class="drug-empty">{{ data.materials?.length ? '无匹配材料' : '暂无材料属性数据' }}</div>
    </section>
    <div class="drug-split"><section class="drug-section"><h3>形成能与带隙</h3><BaseChart v-if="materials.some(m => Number.isFinite(m.formation_energy) && Number.isFinite(m.band_gap))" :option="scatter" height="370px" aria-label="形成能与带隙散点图" @chart-click="selectScatter" /><div v-else class="drug-empty">暂无可绘制的材料属性</div><p class="drug-note selected-material">{{ selected ? `${selected.material_id} · ${selected.formula}` : '未选择材料' }}</p><p class="drug-note">点击散点选择材料；橙色为当前选择，蓝色为已收敛，灰色为其他状态。</p></section><section class="drug-section"><h3>候选材料排名</h3><div v-if="ranking.length" class="ranking-list"><button v-for="r in ranking" :key="r.material_id" :aria-pressed="selected?.material_id === r.material_id" :disabled="!data.materials?.some(m => m.material_id === r.material_id)" @click="selectRank(r.material_id)"><span>{{ r.rank }} · {{ r.material_id }}</span><strong>{{ label('score','评分') }} {{ r.score }}</strong></button></div><div v-else class="drug-empty">暂无候选排名</div><p class="drug-note">排名采用返回结果；选择候选会清除列表筛选并定位对应材料。</p></section></div>
    <section class="drug-section"><h3>计算中心任务分配</h3><BaseChart v-if="data.cluster_distribution?.length" :option="distribution" height="260px" aria-label="计算中心材料分配" /><div v-else class="drug-empty">暂无中心分配数据</div></section>
  </div>
</template>
<style scoped src="../drug/drug.css"></style>
<style scoped>.drug-split { border-top:1px solid var(--scnet-divider); }.ranking-list { display:grid; gap:8px; max-height:390px; overflow:auto; }.ranking-list button { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; text-align:left; font-size:14px; }.ranking-list strong,.selected-material { font-family:var(--scnet-font-mono); }.ranking-list button:disabled { cursor:default; opacity:.6; }</style>
