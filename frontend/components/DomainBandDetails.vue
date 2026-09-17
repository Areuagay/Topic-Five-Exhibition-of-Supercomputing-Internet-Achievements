<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BandDOSData } from '~/types/domain-data'

const props = defineProps<{ data: unknown }>()
const structure = computed(() => props.data as NonNullable<BandDOSData['band_structure']>)
const bands = computed(() => structure.value.bands ?? [])
const positions = computed(() => structure.value.k_positions ?? [])
const selectedIndex = ref(0)
const selected = computed(() => bands.value[selectedIndex.value] ?? bands.value[0])
const scrollArea = ref<HTMLElement | null>(null)
// Preserve the original sample index, including missing positions or energies.
const rows = computed(() => Array.from({ length: Math.max(positions.value.length, selected.value?.energies?.length ?? 0) }, (_, index) => ({
  index, position: positions.value[index], energy: selected.value?.energies?.[index],
})))
watch(() => props.data, () => { selectedIndex.value = 0 })
watch(selected, () => { if (scrollArea.value) scrollArea.value.scrollTop = 0 })
function number(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toFixed(6))) : '—'
}
</script>

<template>
  <div class="band-detail">
    <div class="band-context">
      <div class="band-path"><span class="band-caption">K 点路径</span><span>{{ structure.k_labels?.join(' → ') || '—' }}</span></div>
      <div class="band-fermi"><span class="band-caption">费米能级</span><strong>{{ number(structure.fermi_energy) }}</strong></div>
    </div>
    <div class="band-samples">
      <header class="band-toolbar">
        <label class="band-picker"><span>能带</span><select v-model="selectedIndex" aria-label="选择能带" :disabled="!bands.length">
          <option v-for="(band, index) in bands" :key="index" :value="index">能带 {{ band.band_index }}</option>
          <option v-if="!bands.length" :value="0">暂无能带</option>
        </select></label>
        <span class="band-count" aria-live="polite">{{ positions.length }} 个 K 点 · {{ bands.length }} 条能带</span>
      </header>
      <div ref="scrollArea" class="band-scroll" tabindex="0" role="region" :aria-label="`能带 ${selected?.band_index ?? ''} 采样明细`">
        <table class="band-table">
          <thead><tr><th scope="col">采样序号</th><th scope="col">K 点位置</th><th scope="col">能量</th></tr></thead>
          <tbody :key="selectedIndex">
            <tr v-for="row in rows" :key="row.index"><td>{{ row.index + 1 }}</td><td>{{ number(row.position) }}</td><td>{{ number(row.energy) }}</td></tr>
            <tr v-if="!rows.length"><td colspan="3">暂无采样数据</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.band-context { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 32px; margin-bottom: 16px; }
.band-path, .band-fermi { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.band-path > span:last-child { color: #33445c; font-weight: 600; letter-spacing: .04em; }
.band-caption { color: #7d899a; font-size: 13px; }
.band-fermi { padding-left: 24px; border-left: 1px solid #e5ebf2; }
.band-fermi strong { font-weight: 600; font-variant-numeric: tabular-nums; }
.band-samples { overflow: hidden; border: 1px solid #e5ebf2; border-radius: 8px; background: #fff; }
.band-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 16px; padding: 12px 16px; border-bottom: 1px solid #edf1f5; }
.band-picker { display: flex; align-items: center; gap: 12px; font-weight: 600; }
.band-picker select { min-width: 132px; padding: 7px 10px; border: 1px solid #d8e2ef; border-radius: 6px; background: #f7faff; color: #1769d2; font: inherit; cursor: pointer; transition: background-color 180ms ease, border-color 180ms ease; }
.band-picker select:hover { background: #eaf3ff; border-color: #8db7ed; }
.band-count { color: #7d899a; font-size: 13px; font-variant-numeric: tabular-nums; }
.band-scroll { height: 272px; overflow: auto; scrollbar-gutter: stable; overscroll-behavior: contain; overflow-anchor: none; }
.band-picker select:focus-visible, .band-scroll:focus-visible { outline: 2px solid #1769d2; outline-offset: -2px; }
.band-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
.band-table th, .band-table td { height: 38px; padding: 8px 16px; box-sizing: border-box; text-align: left; border-bottom: 1px solid #edf1f5; }
.band-table th { position: sticky; top: 0; z-index: 1; background: #f5f7fa; color: #687588; font-weight: 600; }
.band-table th:first-child { width: 22%; }
.band-table td:first-child { color: #7d899a; }
.band-table td { transition: background-color 180ms ease; }
.band-table tr:hover td { background: var(--scnet-hover-bg, #f0f6ff); }
.band-table tbody { animation: band-reveal 180ms ease-out; }
@keyframes band-reveal { from { opacity: .35; } to { opacity: 1; } }
@media (max-width: 600px) {
  .band-context { gap: 10px 20px; }
  .band-fermi { padding-left: 0; border: 0; }
  .band-toolbar { padding: 10px 12px; }
  .band-table th, .band-table td { padding: 8px; }
  .band-table th:first-child { width: 28%; }
}
@media (prefers-reduced-motion: reduce) {
  .band-table tbody { animation: none; }
  .band-picker select, .band-table td { transition: none; }
}
</style>
