<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue'
import type { SwarmCoordinationData } from '~/types/domain-data'
import BaseChart from '~/components/BaseChart.vue'
import SpatialPlot from './SpatialPlot.vue'
import { sampleAt, trajectoryTimes } from '~/utils/uav'
import { scientificLines } from '~/utils/scientific-charts'
import { quantityLabel } from '~/utils/workspace'
const props = defineProps<{ data: SwarmCoordinationData }>()
const projection = ref<'y' | 'z'>('y')
const selected = ref('')
const eventIndex = ref(-1)
const frame = ref(0)
const playing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
const tracks = computed(() => props.data.trajectory_samples ?? [])
const times = computed(() => trajectoryTimes(tracks.value))
const time = computed(() => times.value[frame.value] ?? 0)
const project = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: p[projection.value] })
const event = computed(() => props.data.collision_events?.[eventIndex.value])
const lines = computed(() => tracks.value.map(track => ({ id: track.uav_id, points: track.points.map(project), selected: selected.value === track.uav_id || !!event.value?.uav_ids.includes(track.uav_id), muted: !!selected.value && selected.value !== track.uav_id })))
const bounds = computed(() => [...tracks.value.flatMap(t => t.points.map(project)), ...(props.data.mission_targets ?? []).map(project), ...(props.data.collision_events ?? []).map(project)])
const markers = computed(() => [
  ...tracks.value.flatMap(track => { const point = sampleAt(track.points, time.value); return point ? [{ id: track.uav_id, ...project(point), label: selected.value === track.uav_id ? track.uav_id : undefined }] : [] }),
  ...(props.data.mission_targets ?? []).map(target => ({ id: target.target_id, ...project(target), color: '#43846a', label: target.target_id })),
  ...(event.value ? [{ id: '碰撞事件', ...project(event.value), color: '#c45545', label: `碰撞 · 步 ${event.value.step}` }] : []),
])
const current = computed(() => sampleAt(tracks.value.find(t => t.uav_id === selected.value)?.points ?? [], time.value))
const last = computed(() => props.data.formation_series?.at(-1))
const formation = computed(() => scientificLines(props.data.formation_series, 'step', '计算步', [{ key: 'formation_error', label: '编队误差' }], props.data.units))
const completion = computed(() => scientificLines(props.data.formation_series, 'step', '计算步', [{ key: 'active_uavs', label: '活跃无人机' }, { key: 'completed_uavs', label: '已完成无人机' }], props.data.units))
function stop() { if (timer) clearInterval(timer); timer = undefined; playing.value = false }
function play() {
  if (playing.value) return stop()
  if (times.value.length < 2) return
  if (frame.value >= times.value.length - 1) frame.value = 0
  playing.value = true
  timer = setInterval(() => { if (frame.value >= times.value.length - 1) stop(); else frame.value++ }, 250)
}
function seek(e: Event) { stop(); frame.value = Number((e.target as HTMLInputElement).value) }
watch(() => props.data, () => { stop(); frame.value = 0; selected.value = ''; eventIndex.value = -1 })
onBeforeUnmount(stop)
</script>
<template>
  <div class="auto-workspace swarm-workspace">
    <div class="auto-split">
      <section class="auto-section"><h3>集群轨迹</h3>
        <template v-if="tracks.length">
          <SpatialPlot :lines="lines" :markers="markers" :bounds-points="bounds" :x-label="quantityLabel('X', data.units?.x)" :y-label="quantityLabel(projection.toUpperCase(), data.units?.[projection])" :label="projection === 'y' ? '集群轨迹俯视图' : '集群轨迹侧视图'" />
          <div class="auto-controls" role="group" aria-label="轨迹投影"><button :aria-pressed="projection === 'y'" @click="projection = 'y'">俯视 X–Y</button><button :aria-pressed="projection === 'z'" @click="projection = 'z'">侧视 X–Z</button></div>
          <div class="playback"><button :disabled="times.length < 2" @click="play">{{ playing ? '暂停' : '播放' }}</button><label for="swarm-time">{{ quantityLabel('轨迹时间', data.units?.t) }} <strong>{{ time }}</strong></label><input id="swarm-time" type="range" min="0" :max="Math.max(0,times.length-1)" :value="frame" :disabled="times.length < 2" @input="seek" /></div>
          <p class="auto-note">显示 {{ tracks.length }} 架采样轨迹 · 绿色标记为任务目标</p>
        </template><div v-else class="auto-empty">暂无轨迹数据</div>
      </section>
      <section class="auto-section"><h3>协同概况</h3><dl class="auto-stats">
        <div><dt>集群规模</dt><dd>{{ data.total_uavs?.toLocaleString() ?? '—' }}</dd></div><div><dt>轨迹采样数</dt><dd>{{ tracks.length || '—' }}</dd></div>
        <div><dt>末步完成数量</dt><dd>{{ last?.completed_uavs?.toLocaleString() ?? '—' }}</dd></div><div><dt>{{ quantityLabel('末步编队误差', data.units?.formation_error) }}</dt><dd>{{ last?.formation_error ?? '—' }}</dd></div>
      </dl>
      <div class="selection"><label for="swarm-aircraft">查看无人机</label><select id="swarm-aircraft" v-model="selected" @change="eventIndex = -1"><option value="">全部采样无人机</option><option v-for="track in tracks" :key="track.uav_id" :value="track.uav_id">{{ track.uav_id }}</option></select></div>
      <p v-if="current" class="auto-note current-position">采样时间 {{ current.t }}{{ data.units?.t ? ` ${data.units.t}` : '' }} · {{ quantityLabel('X', data.units?.x) }} {{ current.x }} · {{ quantityLabel('Y', data.units?.y) }} {{ current.y }} · {{ quantityLabel('Z', data.units?.z) }} {{ current.z }}</p>
      <h3 class="subheading">碰撞事件</h3>
      <div v-if="data.collision_events?.length" class="events"><button v-for="(item,index) in data.collision_events" :key="index" :aria-pressed="eventIndex === index" @click="eventIndex = eventIndex === index ? -1 : index; selected = ''">步 {{ item.step }} · {{ item.uav_ids.join(' / ') }}</button><p class="auto-note">选择事件查看位置与相关轨迹；事件步数与轨迹时间独立显示。</p></div>
      <div v-else class="auto-empty">{{ data.collision_events ? '无碰撞事件' : '暂无碰撞事件数据' }}</div>
      </section>
    </div>
    <section class="auto-section"><div class="auto-pair"><div><h3>编队误差</h3><BaseChart v-if="data.formation_series?.length" :option="formation" height="300px" aria-label="编队误差曲线" /><div v-else class="auto-empty">暂无编队误差数据</div></div><div><h3>任务执行进度</h3><BaseChart v-if="data.formation_series?.length" :option="completion" height="300px" aria-label="无人机活跃与完成数量曲线" /><div v-else class="auto-empty">暂无任务进度数据</div></div></div></section>
  </div>
</template>
<style scoped src="../automotive/automotive.css"></style>
<style scoped>
.playback { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:16px; font-size:14px; }
.playback input { flex:1; min-width:100px; accent-color:var(--scnet-primary); }
.selection { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:24px; font-size:14px; }
select { max-width:100%; min-height:44px; padding:8px 12px; border:1px solid #dfe3e8; border-radius:6px; color:var(--scnet-text); background:#fff; font:inherit; }
.subheading { margin-top:28px; }.events button { width:100%; text-align:left; margin-bottom:8px; } button:disabled { opacity:.5; cursor:default; }
</style>
