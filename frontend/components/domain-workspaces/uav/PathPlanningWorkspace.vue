<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PathPlanningData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import ArtifactPreview from '~/components/run/ArtifactPreview.vue'
import SpatialPlot from './SpatialPlot.vue'
import { scientificLines } from '~/utils/scientific-charts'
import { quantityLabel } from '~/utils/workspace'
const props = defineProps<{ data: PathPlanningData }>()
const original = ref(false)
const environment = computed(() => props.data.environment)
const path = computed(() => props.data.best_path ?? [])
const markers = computed(() => [
  { id: 'start', point: environment.value?.start, label: '起点', color: '#43846a' },
  { id: 'goal', point: environment.value?.goal, label: '终点', color: '#c45545' },
].flatMap(m => m.point && Number.isFinite(m.point[0]) && Number.isFinite(m.point[1]) ? [{ id: m.id, x: m.point[0], y: m.point[1], label: m.label, color: m.color }] : []))
const bounds = computed(() => [...path.value, ...markers.value, ...(environment.value ? [{ x: 0, y: 0 }, { x: environment.value.width, y: environment.value.height }] : [])])
const cost = computed(() => scientificLines(props.data.cost_series, 'iteration', '迭代次数', [{ key: 'best_cost', label: '最优代价' }, { key: 'average_cost', label: '平均代价' }], props.data.units))
const last = computed(() => props.data.cost_series?.at(-1))
</script>
<template>
  <div class="auto-workspace planning-workspace">
    <div class="auto-split">
      <section class="auto-section"><h3>航迹与障碍物</h3>
        <div class="map-stage">
          <ArtifactPreview v-if="original && data.path_preview" hide-caption :artifact="{ id: 'planning-map', name: '航迹规划结果', type: 'image', format: 'png', preview_url: data.path_preview }" />
          <SpatialPlot v-else-if="environment || path.length" :lines="[{ id: '最优路径', points: path, selected: true }]" :markers="markers" :bounds-points="bounds" :obstacles="environment?.obstacles" :x-label="quantityLabel('X', data.units?.x)" :y-label="quantityLabel('Y', data.units?.y)" label="航迹规划地图" />
          <div v-else class="auto-empty">暂无航迹与环境数据</div>
        </div>
        <div v-if="data.path_preview" class="auto-controls" role="group" aria-label="航迹视图"><button :aria-pressed="!original" @click="original = false">路径地图</button><button :aria-pressed="original" @click="original = true">原始结果图</button></div>
        <p class="auto-note">蓝色为最优路径 · 灰色为障碍物 · 绿色为起点 · 红色为终点</p>
        <p v-if="!path.length" class="auto-note">暂无最优路径数据</p><p v-if="!environment" class="auto-note">暂无环境数据</p>
      </section>
      <section class="auto-section"><h3>规划结果</h3><dl class="auto-stats">
        <div><dt>路径采样点</dt><dd>{{ data.best_path?.length ?? '—' }}</dd></div><div><dt>障碍物数量</dt><dd>{{ environment?.obstacles?.length ?? '—' }}</dd></div>
        <div><dt>{{ quantityLabel('最终最优代价', data.units?.best_cost) }}</dt><dd>{{ last?.best_cost ?? '—' }}</dd></div><div><dt>最终迭代次数</dt><dd>{{ last?.iteration ?? '—' }}</dd></div>
      </dl><h3 class="subheading">代价收敛</h3><BaseChart v-if="data.cost_series?.length" :option="cost" height="320px" aria-label="最优与平均代价收敛曲线" /><div v-else class="auto-empty">暂无代价数据</div>
      </section>
    </div>
  </div>
</template>
<style scoped src="../automotive/automotive.css"></style>
<style scoped>.subheading { margin-top:28px; }.map-stage { height:480px; display:flex; flex-direction:column; justify-content:center; overflow:hidden; }.map-stage :deep(.image-stage) { height:460px; min-height:0; } @media(max-width:700px) { .map-stage { height:380px; }.map-stage :deep(.image-stage) { height:360px; } }</style>
