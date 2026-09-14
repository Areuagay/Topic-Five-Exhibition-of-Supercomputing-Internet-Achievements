<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VirtualScreeningData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import ArtifactPreview from '~/components/run/ArtifactPreview.vue'
import { filterCandidates, sortCandidates } from '~/utils/drug'
import { distributionChart } from '~/utils/drug-charts'
import { quantityLabel } from '~/utils/workspace'
const props = defineProps<{ data: VirtualScreeningData }>()
const query = ref(''), selectedId = ref('')
const order = ref<'rank' | 'docking_score' | 'molecular_weight' | 'logp'>('rank')
const ascending = ref(true)
const candidates = computed(() => sortCandidates(filterCandidates(props.data.top_candidates ?? [], query.value), order.value, ascending.value))
const selected = computed(() => candidates.value.find(c => c.compound_id === selectedId.value) ?? candidates.value[0])
const preload = computed(() => (props.data.top_candidates ?? []).flatMap(c => c.preview_url ? [c.preview_url] : []))
const stages = computed(() => [
  { key: 'input', name: '输入化合物' }, { key: 'preprocessed', name: '完成预处理' }, { key: 'docked', name: '完成对接' }, { key: 'property_passed', name: '性质筛选通过' }, { key: 'top_n', name: '入选 TOP-N' },
].map(s => ({ key: s.key, name: s.name, value: props.data.screening_funnel?.[s.key as keyof NonNullable<VirtualScreeningData['screening_funnel']>] })).map((s, i, all) => {
  const previous = all[i-1]?.value
  return { ...s, retention: typeof s.value === 'number' && typeof previous === 'number' && previous > 0 ? (s.value / previous * 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) : undefined }
}))
const hasStages = computed(() => stages.value.some(s => typeof s.value === 'number'))
const histogram = computed(() => distributionChart(props.data.score_distribution, '对接得分', props.data.units?.docking_score))
</script>
<template>
  <div class="drug-workspace screening-workspace">
    <div class="drug-split">
      <section class="drug-section"><h3>化合物筛选流程</h3>
        <div v-if="hasStages" class="screening-flow" role="list" aria-label="化合物筛选阶段">
          <div v-for="(stage,index) in stages" :key="stage.key" class="screening-stage" :class="{ final: stage.key === 'top_n' }" role="listitem">
            <span class="stage-index">{{ index + 1 }}</span><span class="stage-name">{{ stage.name }}</span>
            <strong class="stage-count">{{ stage.value?.toLocaleString() ?? '—' }}</strong>
            <span class="stage-retention"><template v-if="stage.retention !== undefined">{{ stage.retention }}%<small>较上一阶段</small></template><template v-else>{{ index === 0 ? '初始数量' : '—' }}</template></span>
          </div>
        </div><div v-else class="drug-empty">暂无筛选阶段数据</div>
        <div v-if="data.cluster_progress?.length" class="centers"><h3 class="subheading">计算中心进度</h3><div v-for="center in data.cluster_progress" :key="center.cluster_id"><strong>{{ center.cluster_name || center.cluster_id }}</strong><span>{{ center.completed ?? '—' }} / {{ center.total ?? '—' }}</span><span v-if="typeof center.progress === 'number'">{{ quantityLabel('进度', data.units?.progress) }} {{ center.progress }}</span></div></div><p v-else class="center-empty">计算中心进度<span>暂无数据</span></p>
      </section>
      <section class="drug-section"><h3>对接得分分布</h3><BaseChart v-if="data.score_distribution?.length" :option="histogram" height="330px" aria-label="对接得分分布直方图" /><div v-else class="drug-empty">暂无得分分布数据</div></section>
    </div>
    <section class="drug-section"><h3>TOP-N 候选化合物</h3><div class="drug-toolbar"><label for="screen-search">搜索编号</label><input id="screen-search" v-model="query" type="search" placeholder="输入化合物编号" /><label for="screen-sort">排序</label><select id="screen-sort" v-model="order"><option value="rank">原始排名</option><option value="docking_score">对接得分</option><option value="molecular_weight">分子量</option><option value="logp">LogP</option></select><button :aria-pressed="ascending" @click="ascending = !ascending">{{ ascending ? '升序' : '降序' }}</button><span>{{ candidates.length }} / {{ data.top_candidates?.length ?? 0 }} 条候选</span></div>
      <div v-if="candidates.length" class="candidate-layout"><div class="drug-table" tabindex="0" role="region" aria-label="候选化合物列表"><table><thead><tr><th>排名</th><th>化合物编号</th><th>{{ quantityLabel('对接得分', data.units?.docking_score) }}</th><th>{{ quantityLabel('分子量', data.units?.molecular_weight) }}</th><th>{{ quantityLabel('LogP', data.units?.logp) }}</th></tr></thead><tbody><tr v-for="item in candidates" :key="item.compound_id" :class="{ selected: selected?.compound_id === item.compound_id }"><td>{{ item.rank }}</td><td><button :aria-pressed="selected?.compound_id === item.compound_id" @click="selectedId = item.compound_id">{{ item.compound_id }}</button></td><td>{{ item.docking_score ?? '—' }}</td><td>{{ item.molecular_weight ?? '—' }}</td><td>{{ item.logp ?? '—' }}</td></tr></tbody></table></div>
      <div class="candidate-detail"><h3>{{ selected?.compound_id }}</h3><ArtifactPreview v-if="selected?.preview_url" hide-caption :preload-urls="preload" :artifact="{ id: selected.compound_id, name: selected.compound_id, type: 'image', format: 'png', preview_url: selected.preview_url }" /><div v-else class="drug-empty">暂无候选图像</div></div></div>
      <div v-else class="drug-empty">{{ data.top_candidates?.length ? '无匹配候选' : '暂无候选数据' }}</div>
    </section>
  </div>
</template>
<style scoped>
.screening-flow { width:100%; max-width:520px; min-height:330px; margin:0 auto; display:flex; flex-direction:column; justify-content:center; gap:10px; }
.screening-stage { display:grid; grid-template-columns:28px minmax(90px,1fr) auto 88px; align-items:center; gap:12px; padding:12px 16px; border:1px solid #e5ebf3; border-radius:6px; background:#fbfcfe; }
.stage-index { width:26px; height:26px; display:grid; place-items:center; border-radius:50%; color:#1769d2; background:#eaf1fc; font-size:13px; font-weight:600; }
.stage-name { font-size:14px; font-weight:600; }
.stage-count { font:600 22px var(--scnet-font-mono); text-align:right; font-variant-numeric:tabular-nums; }
.stage-retention { text-align:right; font-size:13px; color:var(--scnet-text-secondary); font-variant-numeric:tabular-nums; }
.stage-retention small { display:block; margin-top:3px; font-size:11px; color:var(--scnet-text-muted); }
.screening-stage.final { background:#edf4ff; border-color:#bbd2f3; }.final .stage-count { color:#1769d2; }.final .stage-index { color:#fff; background:#1769d2; }
.center-empty { max-width:520px; margin:18px auto 0; display:flex; justify-content:space-between; padding-top:14px; border-top:1px solid #edf1f5; font-size:13px; color:var(--scnet-text-secondary); }.center-empty span { color:var(--scnet-text-muted); }
@media(max-width:600px) { .screening-stage { grid-template-columns:26px minmax(80px,1fr) auto; gap:8px; padding:10px; }.stage-count { font-size:19px; }.stage-retention { grid-column:2 / 4; }.stage-retention small { display:inline; margin-left:8px; } }
</style>
<style scoped src="./drug.css"></style>
<style scoped>.candidate-layout { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr); gap:24px; }.candidate-detail { min-width:0; }.candidate-detail h3 { font-family:var(--scnet-font-mono); overflow-wrap:anywhere; }.candidate-detail :deep(.image-stage) { height:360px; }.centers { display:grid; gap:12px; font-size:14px; }.centers > div { display:flex; flex-wrap:wrap; gap:16px; } @media(max-width:1100px) { .candidate-layout { grid-template-columns:1fr; } }</style>
