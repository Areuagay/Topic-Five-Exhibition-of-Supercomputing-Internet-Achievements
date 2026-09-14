<script setup lang="ts">
import { computed } from 'vue'
import type { Point2 } from '~/utils/uav'
import { spatialBounds } from '~/utils/uav'
import type { PathPlanningData } from '~/types/domain-data'
const props = defineProps<{
  lines: { id: string; points: Point2[]; selected?: boolean; muted?: boolean }[]
  markers?: { id: string; x: number; y: number; color?: string; label?: string }[]
  boundsPoints: Point2[]
  obstacles?: NonNullable<PathPlanningData['environment']>['obstacles']
  xLabel: string; yLabel: string; label: string
}>()
const bounds = computed(() => spatialBounds(props.boundsPoints))
const x = (v: number) => 58 + (v - bounds.value.minX) / (bounds.value.maxX - bounds.value.minX) * 420
const y = (v: number) => 442 - (v - bounds.value.minY) / (bounds.value.maxY - bounds.value.minY) * 420
const size = (v: number) => v / (bounds.value.maxX - bounds.value.minX) * 420
const path = (points: Point2[]) => {
  let started = false
  return points.map(p => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { started = false; return '' }
    const command = started ? 'L' : 'M'; started = true
    return `${command}${x(p.x)},${y(p.y)}`
  }).join(' ')
}
const tick = (value: number) => Number(value.toPrecision(4)).toLocaleString()
</script>
<template>
  <svg class="spatial-plot" viewBox="0 0 536 500" role="img" :aria-label="label">
    <title>{{ label }}</title>
    <rect x="58" y="22" width="420" height="420" fill="#fbfcfe" stroke="#dfe5ec" />
    <g v-for="i in [0,1,2,3,4]" :key="i" class="axis">
      <path :d="`M${58+i*105},22V442 M58,${442-i*105}H478`" stroke="#e8edf3" />
      <text :x="58+i*105" y="465" text-anchor="middle">{{ tick(bounds.minX+(bounds.maxX-bounds.minX)*i/4) }}</text>
      <text x="49" :y="446-i*105" text-anchor="end">{{ tick(bounds.minY+(bounds.maxY-bounds.minY)*i/4) }}</text>
    </g>
    <text x="268" y="491" text-anchor="middle">{{ xLabel }}</text><text x="58" y="15">{{ yLabel }}</text>
    <g fill="#e3e9f1" stroke="#8e9fb4" stroke-width="1.5">
      <template v-for="(o,i) in obstacles" :key="i">
        <rect v-if="o.type === 'rectangle'" class="obstacle" :x="x(o.x)" :y="y(o.y+o.h)" :width="size(o.w)" :height="size(o.h)"><title>矩形障碍物 {{ i+1 }}</title></rect>
        <circle v-else-if="o.type === 'circle'" class="obstacle" :cx="x(o.cx)" :cy="y(o.cy)" :r="size(o.r)"><title>圆形障碍物 {{ i+1 }}</title></circle>
      </template>
    </g>
    <path v-for="line in lines" :key="line.id" class="flight-path" :d="path(line.points)" fill="none" :stroke="line.selected ? '#1769d2' : '#7d9fc5'" :stroke-width="line.selected ? 3 : 1.4" :opacity="line.muted ? .22 : .85"><title>{{ line.id }}</title></path>
    <g v-for="marker in markers" :key="marker.id" class="position-marker">
      <circle :cx="x(marker.x)" :cy="y(marker.y)" :r="marker.label ? 5 : 3" :fill="marker.color || '#1769d2'" stroke="#fff" stroke-width="1.2"><title>{{ marker.id }} · {{ marker.x }}, {{ marker.y }}</title></circle>
      <text v-if="marker.label" :x="x(marker.x)+8" :y="y(marker.y)-8" :fill="marker.color || '#1769d2'">{{ marker.label }}</text>
    </g>
  </svg>
</template>
<style scoped>
.spatial-plot { display: block; width: 100%; height: 460px; font-family: var(--scnet-font-sans); font-size: 12px; font-weight: 600; fill: #606266; }
.axis { font-size: 11px; }
.flight-path { transition: opacity .18s, stroke .18s; }
@media (max-width:700px) { .spatial-plot { height: 360px; } }
@media (prefers-reduced-motion:reduce) { .flight-path { transition:none; } }
</style>
