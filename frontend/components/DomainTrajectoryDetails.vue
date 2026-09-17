<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ samples: Record<string, unknown>[] }>()
const selectedIndex = ref(0)
const scrollArea = ref<HTMLElement | null>(null)
const selected = computed(() => props.samples[selectedIndex.value] ?? props.samples[0])
const points = computed(() => Array.isArray(selected.value?.points) ? selected.value.points : [])

watch(() => props.samples, () => { selectedIndex.value = 0 })
watch(selected, () => {
  // Reset only the point list; selecting a UAV must never move the page.
  if (scrollArea.value) scrollArea.value.scrollTop = 0
})

function coordinate(value: unknown): string {
  if (value === null || value === undefined) return '—'
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Number(value.toFixed(6)))
    : String(value)
}
</script>

<template>
  <div class="trajectory-detail">
    <header class="trajectory-toolbar">
      <label class="trajectory-picker">
        <span>无人机</span>
        <select v-model="selectedIndex" aria-label="选择采样无人机">
          <option v-for="(sample, index) in samples" :key="index" :value="index">
            {{ sample.uav_id ?? `采样 ${index + 1}` }}
          </option>
        </select>
      </label>
      <span class="trajectory-count" aria-live="polite">{{ points.length }} 个轨迹点<span class="trajectory-total"> · 共 {{ samples.length }} 架采样</span></span>
    </header>
    <div ref="scrollArea" class="trajectory-scroll" tabindex="0" role="region" :aria-label="`${selected?.uav_id ?? '无人机'} 轨迹点`">
      <table class="trajectory-table">
        <thead><tr><th scope="col">时间</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Z</th></tr></thead>
        <tbody :key="selectedIndex">
          <tr v-for="(point, index) in points" :key="index">
            <td>{{ coordinate(point?.t) }}</td><td>{{ coordinate(point?.x) }}</td><td>{{ coordinate(point?.y) }}</td><td>{{ coordinate(point?.z) }}</td>
          </tr>
          <tr v-if="!points.length"><td colspan="4" class="trajectory-empty">暂无轨迹点</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.trajectory-detail {
  overflow: hidden;
  border: 1px solid #e5ebf2;
  border-radius: 8px;
  background: #fff;
}
.trajectory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #edf1f5;
}
.trajectory-picker { display: flex; align-items: center; gap: 12px; font-weight: 600; }
.trajectory-picker select {
  min-width: 138px;
  padding: 7px 10px;
  border: 1px solid #d8e2ef;
  border-radius: 6px;
  background: #f7faff;
  color: #1769d2;
  font: inherit;
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease;
}
.trajectory-picker select:hover { background: #eaf3ff; border-color: #8db7ed; }
.trajectory-count { color: #7d899a; font-size: 13px; font-variant-numeric: tabular-nums; }
.trajectory-scroll { height: 272px; overflow: auto; scrollbar-gutter: stable; overscroll-behavior: contain; overflow-anchor: none; }
.trajectory-picker select:focus-visible,
.trajectory-scroll:focus-visible { outline: 2px solid #1769d2; outline-offset: -2px; }
.trajectory-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
.trajectory-table th,
.trajectory-table td { height: 38px; padding: 8px 16px; box-sizing: border-box; text-align: left; border-bottom: 1px solid #edf1f5; }
.trajectory-table th { position: sticky; top: 0; z-index: 1; background: #f5f7fa; color: #687588; font-weight: 600; }
.trajectory-table td { transition: background-color 180ms ease; }
.trajectory-table tr:hover td { background: var(--scnet-hover-bg, #f0f6ff); }
.trajectory-table tbody { animation: trajectory-reveal 180ms ease-out; }
.trajectory-empty { color: #7d899a; }
@keyframes trajectory-reveal { from { opacity: .35; } to { opacity: 1; } }
@media (max-width: 600px) {
  .trajectory-toolbar { padding: 10px 12px; }
  .trajectory-total { display: none; }
  .trajectory-table th, .trajectory-table td { padding: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .trajectory-table tbody { animation: none; }
  .trajectory-picker select, .trajectory-table td { transition: none; }
}
</style>
