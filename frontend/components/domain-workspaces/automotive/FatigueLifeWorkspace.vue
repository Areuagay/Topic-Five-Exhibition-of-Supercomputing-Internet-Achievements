<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Artifact } from '~/types'
import type { FatigueLifeData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import ArtifactPreview from '~/components/run/ArtifactPreview.vue'
import ResourceState from '~/components/run/ResourceState.vue'
import { scientificLines } from '~/utils/scientific-charts'
import { quantityLabel, workspaceMedia } from '~/utils/workspace'
const props = defineProps<{ data: FatigueLifeData; artifacts?: Artifact[]; artifactsPending?: boolean; artifactsError?: unknown }>()
defineEmits<{ retryArtifacts: [] }>()
const media = computed(() => workspaceMedia(props.artifacts))
const damageMap = computed(() => media.value.find(item => item.name === 'damage_map.png') ?? media.value.find(item => item.type === 'image'))
const locations = computed(() => [...(props.data.critical_locations ?? [])].sort((a, b) => b.damage - a.damage))
const selectedLocation = ref('')
const selected = computed(() => locations.value.find(item => item.location === selectedLocation.value) ?? locations.value[0])
const damage = computed(() => scientificLines(props.data.damage_series, 'cycle', '循环次数', [{ key: 'damage_ratio', label: '累积损伤' }], props.data.units))
const sn = computed(() => {
  const rows = [...(props.data.sn_curve ?? [])].filter(item => item.cycles_to_failure > 0).sort((a, b) => a.cycles_to_failure - b.cycles_to_failure)
  const option = scientificLines(rows, 'cycles_to_failure', '失效循环次数', [{ key: 'stress_amplitude', label: '应力幅' }], props.data.units)
  option.xAxis = { ...(option.xAxis as object), type: 'log', name: `${quantityLabel('失效循环次数', props.data.units?.cycles_to_failure)} · 对数刻度` }
  return option
})
const locationNames: Record<string, string> = { knuckle_fillet: '转向节圆角', weld_toe_A: '焊趾 A', weld_toe_B: '焊趾 B', bolt_hole: '螺栓孔', bolt_hole_rim: '螺栓孔边缘', bracket_root: '支架根部', crossmember_notch: '横梁缺口', suspension_bushing: '悬架衬套', frame_rail_bend: '车架纵梁弯折处' }
</script>

<template>
  <div class="auto-workspace fatigue-workspace">
    <div class="auto-split">
      <section class="auto-section"><h3>疲劳损伤分布</h3><ResourceState :pending="artifactsPending" :error="artifactsError" :empty="!damageMap" label="损伤图像" @retry="$emit('retryArtifacts')"><ArtifactPreview v-if="damageMap" hide-caption :artifact="damageMap" /></ResourceState>
        <p v-if="selected" class="auto-note selected-location">当前查看：{{ locationNames[selected.location] ?? selected.location }}</p>
      </section>
      <section class="auto-section"><h3>危险位置排行</h3><div v-if="locations.length" class="location-list" role="group" aria-label="危险位置选择"><button v-for="(item, index) in locations" :key="item.location" type="button" :aria-pressed="selected?.location === item.location" @click="selectedLocation = item.location"><span>{{ index + 1 }} · {{ locationNames[item.location] ?? item.location }}</span><strong>{{ quantityLabel('损伤', data.units?.damage) }} {{ item.damage }}</strong></button></div><div v-else class="auto-empty">暂无危险位置数据</div>
        <dl v-if="selected" class="auto-stats location-facts" aria-live="polite"><div><dt>{{ quantityLabel('最大应力', data.units?.max_stress) }}</dt><dd>{{ selected.max_stress }}</dd></div><div><dt>{{ quantityLabel('预测寿命', data.units?.predicted_life) }}</dt><dd>{{ selected.predicted_life.toLocaleString() }}</dd></div></dl>
      </section>
    </div>
    <section class="auto-section"><div class="auto-pair"><div><h3>损伤累积</h3><BaseChart v-if="data.damage_series?.length" :option="damage" height="310px" aria-label="损伤随循环次数变化曲线" /><div v-else class="auto-empty">暂无损伤序列</div></div><div><h3>S–N 疲劳曲线</h3><BaseChart v-if="data.sn_curve?.some(item => item.cycles_to_failure > 0)" :option="sn" height="310px" aria-label="S N 应力幅与失效循环次数曲线" /><div v-else class="auto-empty">暂无 S–N 数据</div></div></div></section>
  </div>
</template>
<style scoped src="./automotive.css"></style>
<style scoped>
.location-list { display: grid; gap: 8px; }
.location-list button { display: flex; justify-content: space-between; align-items: center; gap: 12px; text-align: left; font-size: 14px; }
.location-list strong { white-space: nowrap; font-family: var(--scnet-font-mono); }
.location-facts { margin-top: 20px; }
</style>
