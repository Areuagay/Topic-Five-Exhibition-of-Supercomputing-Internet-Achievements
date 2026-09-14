<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Artifact } from '~/types'
import type { VehicleCrashData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import ArtifactPreview from '~/components/run/ArtifactPreview.vue'
import ResourceState from '~/components/run/ResourceState.vue'
import { scientificLines } from '~/utils/scientific-charts'
import { quantityLabel, workspaceMedia } from '~/utils/workspace'
const props = defineProps<{ data: VehicleCrashData; artifacts?: Artifact[]; artifactsPending?: boolean; artifactsError?: unknown }>()
defineEmits<{ retryArtifacts: [] }>()
const media = computed(() => workspaceMedia(props.artifacts))
const mediaIndex = ref(0)
const current = computed(() => media.value[mediaIndex.value] ?? media.value[0])
const preload = computed(() => media.value.filter(item => ['png', 'jpg', 'jpeg', 'webp'].includes(item.format ?? '')).map(item => item.preview_url!))
const energy = computed(() => scientificLines(props.data.energy_series, 'time', '时间', [{ key: 'kinetic_energy', label: '动能' }, { key: 'internal_energy', label: '内能' }, { key: 'hourglass_energy', label: '沙漏能' }], props.data.units))
// Unit-bearing API field names retain their explicit units; metadata can override display.
const acceleration = computed(() => scientificLines(props.data.acceleration_series, 'time', '时间', [{ key: 'acceleration_g', label: '加速度' }], { acceleration_g: 'g', ...props.data.units }))
const intrusion = computed(() => scientificLines(props.data.intrusion_series, 'time', '时间', [{ key: 'intrusion_mm', label: '侵入量' }], { intrusion_mm: 'mm', ...props.data.units }))
const facts = computed(() => [
  { key: 'peak_acceleration_g', label: '峰值加速度', unit: 'g', value: props.data.critical_results?.peak_acceleration_g },
  { key: 'max_intrusion_mm', label: '最大侵入量', unit: 'mm', value: props.data.critical_results?.max_intrusion_mm },
  { key: 'max_stress_mpa', label: '最大应力', unit: 'MPa', value: props.data.critical_results?.max_stress_mpa },
  { key: 'energy_error_percent', label: '能量误差', unit: '%', value: props.data.critical_results?.energy_error_percent },
])
function mediaName(name: string) { return ({ 'stress_front.png': '前部应力', 'stress_middle.png': '中部应力', 'stress_final.png': '最终应力' } as Record<string, string>)[name] ?? name }
</script>

<template>
  <div class="auto-workspace crash-workspace">
    <div class="auto-split">
      <section class="auto-section"><h3>碰撞应力结果</h3>
        <ResourceState :pending="artifactsPending" :error="artifactsError" :empty="!current" label="碰撞图像" @retry="$emit('retryArtifacts')">
          <ArtifactPreview v-if="current" hide-caption :artifact="current" :preload-urls="preload" />
          <div class="auto-controls" role="group" aria-label="碰撞结果切换"><button v-for="(item, index) in media" :key="item.id" type="button" :aria-pressed="current?.id === item.id" @click="mediaIndex = index">{{ mediaName(item.name) }}</button></div>
        </ResourceState>
      </section>
      <section class="auto-section"><h3>关键结果</h3><dl class="auto-stats"><div v-for="item in facts" :key="item.key"><dt>{{ quantityLabel(item.label, data.units?.[item.key] ?? item.unit) }}</dt><dd>{{ item.value?.toLocaleString() ?? '—' }}</dd></div></dl>
        <h3 class="energy-heading">能量平衡</h3><BaseChart v-if="data.energy_series?.length" :option="energy" height="300px" aria-label="动能 内能 沙漏能曲线" /><div v-else class="auto-empty">暂无能量数据</div>
      </section>
    </div>
    <section class="auto-section"><div class="auto-pair"><div><h3>加速度响应</h3><BaseChart v-if="data.acceleration_series?.length" :option="acceleration" height="300px" aria-label="碰撞加速度曲线" /><div v-else class="auto-empty">暂无加速度数据</div></div><div><h3>结构侵入量</h3><BaseChart v-if="data.intrusion_series?.length" :option="intrusion" height="300px" aria-label="碰撞侵入量曲线" /><div v-else class="auto-empty">暂无侵入量数据</div></div></div></section>
  </div>
</template>
<style scoped src="./automotive.css"></style>
<style scoped>.energy-heading { margin-top: 24px; }</style>
