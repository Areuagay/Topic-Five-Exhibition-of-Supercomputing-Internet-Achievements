<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSlidingHighlight } from '~/composables/useSlidingHighlight'
import { formatNumber, formatTimestamp, statusText } from '~/composables/useFormat'
import type { MultiCluster } from '~/types'

const props = defineProps<{ clusters: MultiCluster[]; supportedClusters: string[] }>()
const onlySupported = ref(false)
const gridFrame = ref<HTMLElement>()
let resizeAnimation: Animation | undefined
watch(onlySupported, async () => {
  const frame = gridFrame.value
  if (!frame) return
  const from = frame.getBoundingClientRect().height
  await nextTick()
  if (gridFrame.value !== frame) return
  const to = frame.querySelector<HTMLElement>('.resource-grid')?.offsetHeight
  resizeAnimation?.cancel()
  if (to === undefined || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  resizeAnimation = frame.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    delay: from > to ? 100 : 0, fill: 'backwards',
  })
})
onBeforeUnmount(() => resizeAnimation?.cancel())
function positionLeavingCard(element: Element) {
  const card = element as HTMLElement
  // Preserve the outgoing card's grid position while its neighbours move.
  Object.assign(card.style, {
    left: `${card.offsetLeft}px`, top: `${card.offsetTop}px`,
    width: `${card.offsetWidth}px`, height: `${card.offsetHeight}px`,
  })
}
function clearCardPosition(element: Element) {
  const card = element as HTMLElement
  for (const property of ['left', 'top', 'width', 'height']) card.style.removeProperty(property)
}
const { track: filterTrack, ready: filterReady, style: filterStyle } = useSlidingHighlight(computed(() => Number(onlySupported.value)))
const supportedSet = computed(() => new Set(props.supportedClusters))
const supported = computed(() => props.clusters.filter((item) => supportedSet.value.has(item.id)))
const ordered = computed(() => [...props.clusters]
  .filter((item) => !onlySupported.value || supportedSet.value.has(item.id))
  .sort((a, b) => Number(supportedSet.value.has(b.id)) - Number(supportedSet.value.has(a.id))))
const totalCores = computed(() => supported.value.reduce((total, item) => total + item.total_cores, 0))
const totalNodes = computed(() => supported.value.reduce((total, item) => total + item.total_nodes, 0))
const latestUpdate = computed(() => props.clusters.map((item) => item.updated_at).filter(Boolean).sort().at(-1))
function usage(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
}
</script>

<template>
  <section class="resource-panel" aria-labelledby="resource-title">
    <header class="resource-header">
      <div><h3 id="resource-title">算力资源</h3><p>对比中心配置与资源负载，查看当前场景的适配范围。</p></div>
      <span v-if="latestUpdate" class="resource-updated">更新于 {{ formatTimestamp(latestUpdate) }}</span>
    </header>
    <dl class="resource-summary" aria-label="场景适配资源总览">
      <div><dt>适配中心</dt><dd>{{ supported.length }} <small>/ {{ clusters.length }} 个</small></dd></div>
      <div><dt>适配中心节点总量</dt><dd>{{ formatNumber(totalNodes) }} <small>节点</small></dd></div>
      <div><dt>适配中心 CPU 总量</dt><dd>{{ formatNumber(totalCores) }} <small>核</small></dd></div>
    </dl>
    <div class="resource-toolbar">
      <div ref="filterTrack" class="resource-filters scnet-segmented" :class="{ 'has-sliding-highlight': filterReady }" role="group" aria-label="筛选算力中心">
        <span class="scnet-sliding-highlight" :class="{ 'is-ready': filterReady }" :style="filterStyle" aria-hidden="true" />
        <button data-highlight-item type="button" :aria-pressed="!onlySupported" @click="onlySupported = false">全部中心 <span>{{ clusters.length }}</span></button>
        <button data-highlight-item type="button" :aria-pressed="onlySupported" @click="onlySupported = true">适配本场景 <span>{{ supported.length }}</span></button>
      </div>
      <span class="resource-note">容量为中心总量，负载按最近更新展示</span>
    </div>
    <div ref="gridFrame" class="resource-grid-frame">
    <TransitionGroup tag="div" name="resource-filter" class="resource-grid" @before-leave="positionLeavingCard" @after-leave="clearCardPosition" @leave-cancelled="clearCardPosition" @before-enter="clearCardPosition">
      <article v-for="cluster in ordered" :key="cluster.id" class="resource-card" :class="{ 'is-supported': supportedSet.has(cluster.id), 'is-unavailable': !supportedSet.has(cluster.id), 'is-degraded': cluster.status === 'degraded' }">
        <header class="resource-card-head">
          <div class="resource-identity">
            <span class="resource-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h4M12 17.5h4M12 10v4"/></svg>
            </span>
            <div><h4>{{ cluster.name }}</h4><p>{{ cluster.location }} · {{ cluster.scheduler }}</p><span v-if="!supportedSet.has(cluster.id)" class="resource-unavailable-label">未适配本场景</span></div>
          </div>
          <span class="resource-status" :class="{ 'is-online': cluster.status === 'online', 'is-warning': cluster.status === 'degraded' }">
            <i aria-hidden="true" />{{ statusText(cluster.status) }}
          </span>
        </header>
        <p class="resource-architecture">{{ cluster.architecture }}</p>
        <dl class="resource-capacity">
          <div><dt>计算节点</dt><dd>{{ formatNumber(cluster.total_nodes) }}</dd></div>
          <div><dt>CPU 核数</dt><dd>{{ formatNumber(cluster.total_cores) }}</dd></div>
          <div><dt>GPU 卡数</dt><dd>{{ formatNumber(cluster.gpu_count) }}</dd></div>
        </dl>
        <div class="resource-load">
          <div class="resource-load-item">
            <div><span>CPU 利用率</span><strong>{{ formatNumber(cluster.cpu_utilization, 0) }}<small>%</small></strong></div>
            <meter :value="usage(cluster.cpu_utilization)" min="0" max="100" :aria-label="cluster.name + ' CPU 利用率'">{{ cluster.cpu_utilization }}%</meter>
          </div>
          <div class="resource-load-item">
            <div><span>内存利用率</span><strong>{{ formatNumber(cluster.memory_utilization, 0) }}<small>%</small></strong></div>
            <meter :value="usage(cluster.memory_utilization)" min="0" max="100" :aria-label="cluster.name + ' 内存利用率'">{{ cluster.memory_utilization }}%</meter>
          </div>
        </div>
        <footer class="resource-card-foot">
          <span class="resource-fit" :class="{ 'is-fit': supportedSet.has(cluster.id) }">{{ supportedSet.has(cluster.id) ? '支持本场景' : '本场景暂不可用' }}</span>
          <p>运行 <strong>{{ formatNumber(cluster.active_jobs) }}</strong><span aria-hidden="true"> · </span>排队 <strong>{{ formatNumber(cluster.queue_length) }}</strong></p>
        </footer>
      </article>
    </TransitionGroup>
    </div>
    <div v-if="!ordered.length" class="resource-empty">
      <el-empty :description="onlySupported ? '暂无适配本场景的中心' : '暂无算力中心数据'" :image-size="60" />
      <button v-if="onlySupported" type="button" @click="onlySupported = false">查看全部中心</button>
    </div>
  </section>
</template>

<style scoped>
.resource-panel { min-width: 0; overflow: hidden; border: 1px solid #e1e6ed; border-radius: 12px; background: #fff; box-shadow: 0 2px 7px rgb(31 45 61 / 4.5%); }
.resource-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; padding: 26px 30px 22px; }
.resource-header h3 { margin: 0; font-size: 21px; font-weight: 650; }
.resource-header p { margin: 6px 0 0; color: var(--scnet-text-secondary); font-size: 14px; }
.resource-updated { color: #687588; font-size: 12px; }
.resource-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 30px; padding: 22px 0; border-block: 1px solid var(--scnet-divider); }
.resource-summary > div { padding-inline: 28px; border-right: 1px solid var(--scnet-divider); }
.resource-summary > div:first-child { padding-left: 0; }
.resource-summary > div:last-child { border: 0; }
.resource-summary dt { color: var(--scnet-text-secondary); font-size: 13px; }
.resource-summary dd { margin: 5px 0 0; font-family: var(--scnet-font-mono); font-size: clamp(22px, 2vw, 30px); font-weight: 600; line-height: 1.4; }
.resource-summary small { color: #687588; font-family: var(--scnet-font-sans); font-size: 13px; font-weight: 400; }
.resource-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 22px 30px; }
.resource-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.resource-filters button { min-height: 44px; padding: 0 14px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--scnet-text-secondary); cursor: pointer; }
.resource-filters button[aria-pressed="true"] { background: var(--scnet-primary-soft); color: var(--scnet-primary); font-weight: 600; }
.resource-filters button:hover { background: #f2f5fa; }
.resource-filters.has-sliding-highlight button[aria-pressed="true"] { background: transparent; }
.resource-filters > .scnet-sliding-highlight { margin: 0; }
.resource-filters span { margin-left: 6px; font-family: var(--scnet-font-mono); font-size: 12px; }
.resource-note { font-size: 12px; color: #687588; }
.resource-grid-frame { overflow: hidden; overflow-anchor: none; }
.resource-grid { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; padding: 0 30px 30px; }
.resource-card { box-sizing: border-box; min-width: 0; padding: 24px; border: 1px solid var(--scnet-border); border-radius: 8px; background: #fff; transition: var(--scnet-hover-transition); }
.resource-card:hover { background: var(--scnet-hover-bg); }
.resource-card.is-degraded:hover { background: var(--scnet-hover-warning-bg); box-shadow: var(--scnet-hover-warning-shadow); }
.resource-card.is-supported { border-color: #bdcfe7; }
.resource-card.is-unavailable { border-style: dashed; border-color: #b8c2cf; background: #f5f6f8; }
.resource-card.is-unavailable:hover { background: #edf0f4; }
.resource-unavailable-label { display: inline-flex; margin-top: 8px; padding: 3px 8px; border: 1px solid #c6ced9; border-radius: 4px; background: #e7ebf1; color: #526176; font-size: 12px; font-weight: 600; }
.is-unavailable .resource-fit { color: #526176; font-weight: 600; }
.is-unavailable meter::-webkit-meter-optimum-value { background: #8b9aaf; }
.is-unavailable meter::-moz-meter-bar { background: #8b9aaf; }
.resource-filter-move { transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1); }
.resource-filter-enter-active { transition: opacity 240ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1); }
.resource-filter-leave-active { position: absolute; pointer-events: none; transition: opacity 180ms ease, transform 220ms ease; }
.resource-filter-enter-from, .resource-filter-leave-to { opacity: 0; transform: translateY(8px) scale(.985); }
.resource-card-head, .resource-identity { display: flex; align-items: center; gap: 12px; }
.resource-card-head { justify-content: space-between; align-items: flex-start; }
.resource-identity { min-width: 0; }
.resource-icon { display: grid; place-items: center; flex: 0 0 40px; height: 40px; background: #f3f6fa; border-radius: 6px; color: #687588; }
.is-supported .resource-icon { color: var(--scnet-primary); background: var(--scnet-primary-soft); }
.resource-icon svg { width: 23px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
.resource-card h4 { margin: 0; font-size: 17px; font-weight: 600; }
.resource-identity p { margin: 3px 0 0; color: #687588; font-size: 12px; }
.resource-status { display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 12px; color: #687588; }
.resource-status i { width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
.resource-status.is-online { color: #278454; }
.resource-status.is-warning { color: #9b6b08; }
.resource-architecture { margin: 18px 0; color: var(--scnet-text-secondary); font-size: 13px; }
.resource-capacity { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; padding-bottom: 20px; border-bottom: 1px solid var(--scnet-divider); }
.resource-capacity dt { color: #687588; font-size: 12px; }
.resource-capacity dd { margin: 5px 0 0; font-family: var(--scnet-font-mono); font-size: 21px; font-weight: 600; }
.resource-load { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 20px 0; }
.resource-load-item > div { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; font-size: 12px; color: var(--scnet-text-secondary); }
.resource-load strong { color: var(--scnet-text); font: 600 16px var(--scnet-font-mono); }
.resource-load small { margin-left: 2px; font-size: 11px; }
meter { display: block; width: 100%; height: 6px; margin-top: 10px; border: 0; border-radius: 3px; background: #edf1f6; }
meter::-webkit-meter-bar { height: 6px; background: #edf1f6; border: 0; border-radius: 3px; }
meter::-webkit-meter-optimum-value { background: #3979ce; border-radius: 3px; }
meter::-moz-meter-bar { background: #3979ce; border-radius: 3px; }
.resource-load-item + .resource-load-item meter::-webkit-meter-optimum-value { background: #89a6c9; }
.resource-load-item + .resource-load-item meter::-moz-meter-bar { background: #89a6c9; }
.resource-card-foot { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; }
.resource-card-foot p { margin: 0; color: #687588; }
.resource-card-foot strong { color: var(--scnet-text-secondary); font-weight: 500; }
.resource-fit { color: #687588; }
.resource-fit.is-fit { color: var(--scnet-primary); }
.resource-empty { padding-bottom: 24px; text-align: center; }
.resource-empty button { min-height: 44px; border: 0; background: none; color: var(--scnet-primary); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .resource-filter-move, .resource-filter-enter-active, .resource-filter-leave-active { transition: none; }
}
@media (max-width: 1050px) { .resource-grid { gap: 16px; } .resource-card { padding: 20px; } .resource-capacity dd { font-size: 18px; } }
@media (max-width: 850px) { .resource-grid { grid-template-columns: 1fr; } }
@media (max-width: 560px) {
  .resource-header, .resource-toolbar { padding: 20px; }
  .resource-summary { margin-inline: 20px; gap: 12px; }
  .resource-summary > div { padding-inline: 0; border: 0; }
  .resource-summary dt { font-size: 12px; }
  .resource-summary dd { font-size: 18px; }
  .resource-summary small { display: block; font-size: 12px; }
  .resource-grid { padding: 0 16px 20px; }
  .resource-card { padding: 16px; }
  .resource-icon { display: none; }
  .resource-load { gap: 14px; }
}
</style>
