<script setup lang="ts">
import { Check, Plus, X, Info, ArrowUpRight } from '@lucide/vue'
import { useSelectionFeedback } from '~/composables/useSelectionFeedback'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSlidingHighlight } from '~/composables/useSlidingHighlight'
import { formatBytes, formatNumber, statusText } from '~/composables/useFormat'
import type { Operator, OperatorRef } from '~/types'

const props = defineProps<{ domain: string; operators: Operator[]; selectedOperators: OperatorRef[]; chosenIds: string[]; submitting?: boolean; submittedMessage?: string }>()
const emit = defineEmits<{ 'update:chosenIds': [value: string[]]; submit: [] }>()
const chosenSet = computed(() => new Set(props.chosenIds))
const chosenCount = computed(() => props.operators.filter((item) => chosenSet.value.has(item.name)).length)
const submitting = computed(() => props.submitting === true)
const showSubmitPanel = computed(() => !!props.submittedMessage)
const actionFeedback = ref<'recommended' | 'cleared' | null>(null)
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
function showActionFeedback(action: 'recommended' | 'cleared') {
  clearTimeout(feedbackTimer)
  actionFeedback.value = action
  feedbackTimer = setTimeout(() => { actionFeedback.value = null }, 1400)
}
onBeforeUnmount(() => clearTimeout(feedbackTimer))
function isAvailable(operator: Operator): boolean {
  return ['registered', 'available'].includes(operator.status)
}
function toggleOperator(operator: Operator): void {
  if (submitting.value) return
  if (chosenSet.value.has(operator.name)) emit('update:chosenIds', props.chosenIds.filter((id) => id !== operator.name))
  else if (isAvailable(operator)) emit('update:chosenIds', [...props.chosenIds, operator.name])
}
function useRecommended(): void {
  emit('update:chosenIds', props.operators.filter((item) => isRecommended(item) && isAvailable(item)).map((item) => item.name))
  showActionFeedback('recommended')
}
function clearSelection(): void {
  emit('update:chosenIds', [])
  showActionFeedback('cleared')
}
const query = ref('')
const recommendedOnly = ref(false)
const { track: filterTrack, ready: filterReady, style: filterStyle } = useSlidingHighlight(computed(() => Number(recommendedOnly.value)))
const selectedNames = computed(() => new Set(props.selectedOperators.flatMap((item) => [item.id, item.name])))
function isRecommended(operator: Operator): boolean {
  return selectedNames.value.has(operator.name)
}
function displayName(operator: Operator): string {
  const reference = props.selectedOperators.find((item) => item.id === operator.name || item.name === operator.name)
  return reference?.name ?? (operator.description.includes('：') ? operator.description.split('：')[0] : operator.name)
}
function description(operator: Operator): string {
  return operator.description.includes('：') ? operator.description.slice(operator.description.indexOf('：') + 1) : operator.description
}
const recommendedCount = computed(() => props.operators.filter(isRecommended).length)
const ordered = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return [...props.operators].filter((operator) =>
    (!recommendedOnly.value || isRecommended(operator))
    && (!keyword || [operator.name, displayName(operator), operator.description, operator.runtime_type].join(' ').toLocaleLowerCase().includes(keyword)),
  ).sort((a, b) => Number(isRecommended(b)) - Number(isRecommended(a)))
})
const listFrame = ref<HTMLElement>()
useSelectionFeedback(listFrame, computed(() => props.chosenIds))
const selectedItems = computed(() => props.operators.filter(operator => chosenSet.value.has(operator.name)))
const selectedFrame = ref<HTMLElement>()
let chipResize: Animation | undefined
watch(() => props.chosenIds.join('\n'), async () => {
  const frame = selectedFrame.value
  if (!frame) return
  const from = frame.getBoundingClientRect().height
  await nextTick()
  if (selectedFrame.value !== frame) return
  chipResize?.cancel()
  const to = frame.firstElementChild?.getBoundingClientRect().height ?? 0
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  chipResize = frame.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)',
  })
})
onBeforeUnmount(() => chipResize?.cancel())
let resizeAnimation: Animation | undefined
watch(() => ordered.value.map(operator => operator.name).join('\n'), async () => {
  const frame = listFrame.value
  if (!frame) return
  const from = frame.getBoundingClientRect().height
  await nextTick()
  if (listFrame.value !== frame) return
  const to = frame.querySelector<HTMLElement>('.operator-list')?.offsetHeight
  resizeAnimation?.cancel()
  if (to === undefined || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  resizeAnimation = frame.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    delay: from > to ? 100 : 0, fill: 'backwards',
  })
})
onBeforeUnmount(() => resizeAnimation?.cancel())
function positionLeavingItem(element: Element) {
  const item = element as HTMLElement
  Object.assign(item.style, {
    left: `${item.offsetLeft}px`, top: `${item.offsetTop}px`,
    width: `${item.offsetWidth}px`, height: `${item.offsetHeight}px`,
  })
}
function clearItemPosition(element: Element) {
  const item = element as HTMLElement
  for (const property of ['left', 'top', 'width', 'height']) item.style.removeProperty(property)
}
function resetFilters(): void {
  query.value = ''
  recommendedOnly.value = false
}
function memoryText(memoryMb: number): string {
  return formatBytes(memoryMb * 1024 * 1024)
}
</script>

<template>
  <section class="operator-panel" aria-labelledby="operator-title">
    <header class="operator-header">
      <div><h3 id="operator-title">科学计算算子</h3><p>选择本次体验的算子，对比计算能力与运行要求。</p></div>
      <p class="operator-count">场景推荐 <strong>{{ recommendedCount }}</strong> <span>/ {{ operators.length }} 个算子</span></p>
    </header>
    <div class="operator-toolbar">
      <div ref="filterTrack" class="operator-filters scnet-segmented" :class="{ 'has-sliding-highlight': filterReady }" role="group" aria-label="筛选算子">
        <span class="scnet-sliding-highlight" :class="{ 'is-ready': filterReady }" :style="filterStyle" aria-hidden="true" />
        <button data-highlight-item type="button" :aria-pressed="!recommendedOnly" @click="recommendedOnly = false">全部算子 <span>{{ operators.length }}</span></button>
        <button data-highlight-item type="button" :aria-pressed="recommendedOnly" @click="recommendedOnly = true">场景推荐 <span>{{ recommendedCount }}</span></button>
      </div>
      <label class="operator-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
        <input v-model="query" type="search" aria-label="搜索算子" placeholder="搜索名称、功能或运行环境" />
      </label>
    </div>
    <div class="operator-selection-bar">
      <span role="status">本次已选 <span class="selection-count-slot"><Transition name="selection-count" mode="out-in"><strong :key="chosenCount" class="selection-count">{{ chosenCount }}</strong></Transition></span> 个算子</span>
      <div class="operator-batch-actions">
        <button type="button" class="operator-batch-button is-primary sc-action sc-action--soft" :class="{ 'is-confirmed': actionFeedback === 'recommended' }" :disabled="!recommendedCount" @click="useRecommended">
          <span class="operator-batch-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-9" /></svg></span>
          <span class="operator-batch-label"><span :class="{ 'is-hidden': actionFeedback === 'recommended' }">采用场景推荐</span><span v-if="actionFeedback === 'recommended'" class="operator-batch-feedback">已采用推荐</span></span>
        </button>
        <button type="button" class="operator-batch-button is-clear sc-action sc-action--ghost" :class="{ 'is-confirmed': actionFeedback === 'cleared' }" :disabled="!chosenCount" @click="clearSelection">
          <span class="operator-batch-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 8a6 6 0 1 1 0 5M4 3v5h5" /></svg></span>
          <span class="operator-batch-label"><span :class="{ 'is-hidden': actionFeedback === 'cleared' }">清空选择</span><span v-if="actionFeedback === 'cleared'" class="operator-batch-feedback">已清空</span></span>
        </button>
        <span class="operator-action-status" role="status">{{ actionFeedback === 'recommended' ? '已采用场景推荐算子' : actionFeedback === 'cleared' ? '已清空算子选择' : '' }}</span>
      </div>
    </div>
    <div ref="selectedFrame" class="operator-selected-frame" :class="{ 'has-selection': chosenCount > 0 }">
    <TransitionGroup name="selected-chip" tag="div" class="operator-selected-chips" aria-label="已选算子" @before-leave="positionLeavingItem" @after-leave="clearItemPosition" @leave-cancelled="clearItemPosition" @before-enter="clearItemPosition">
      <button v-for="operator in selectedItems" :key="operator.name" type="button" class="selected-chip" :disabled="submitting" :aria-label="'取消选择：' + displayName(operator)" @click="toggleOperator(operator)"><Check :size="13" aria-hidden="true" />{{ displayName(operator) }}<X :size="13" class="chip-remove" aria-hidden="true" /></button>
    </TransitionGroup>
    </div>
    <p v-if="showSubmitPanel" class="operator-submit-panel" role="alert">{{ props.submittedMessage }}</p>
    <p v-if="query.trim()" class="operator-search-result" role="status">找到 {{ ordered.length }} 个匹配算子</p>
    <div ref="listFrame" class="operator-list-frame">
    <TransitionGroup tag="div" name="operator-filter" class="operator-list" @before-leave="positionLeavingItem" @after-leave="clearItemPosition" @leave-cancelled="clearItemPosition" @before-enter="clearItemPosition">
      <article v-for="operator in ordered" :key="operator.name" class="operator-item" :data-selection-id="operator.name" :class="{ 'is-chosen': chosenSet.has(operator.name) }">
        <div class="operator-main">
          <div class="operator-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9L4 7.5m8 4.5 8-4.5M12 12v9M8 5.2l8 4.6"/></svg>
          </div>
          <div class="operator-content">
            <div class="operator-heading"><h4>{{ displayName(operator) }}</h4><span v-if="isRecommended(operator)" class="operator-recommended">场景推荐</span><span v-else-if="isAvailable(operator)" class="operator-optional" title="未列入场景推荐，仍可自行选择">自主选用</span></div>
            <p class="operator-id">{{ operator.name }} <span>{{ operator.version }}</span></p>
          </div>
          <span class="operator-status" :class="{ 'is-ready': isAvailable(operator) }">{{ statusText(operator.status) }}</span>
        </div>
        <p class="operator-description">{{ description(operator) }}</p>
        <div class="operator-bottom">
          <dl class="operator-requirements">
            <div><dt>CPU</dt><dd>{{ formatNumber(operator.cpu_cores) }} <small>核</small></dd></div>
            <div><dt>GPU</dt><dd>{{ operator.gpu_count ? formatNumber(operator.gpu_count) + ' 卡' : '无需' }}</dd></div>
            <div><dt>内存</dt><dd>{{ memoryText(operator.memory_mb) }}</dd></div>
            <div><dt>运行环境</dt><dd class="operator-runtime">{{ operator.runtime_type }}</dd></div>
          </dl>
          <div class="operator-actions">
          <el-popover trigger="click" placement="bottom-start" :width="440" :show-arrow="false" :popper-style="{ maxWidth: 'calc(100vw - 32px)', padding: '20px' }" popper-class="operator-runtime-popover" transition="operator-runtime">
            <template #reference><button type="button" class="operator-detail-trigger sc-action sc-action--ghost" :aria-label="'查看 ' + displayName(operator) + ' 的运行详情'"><Info aria-hidden="true" />运行详情<ArrowUpRight class="detail-arrow" aria-hidden="true" /></button></template>
            <div class="operator-runtime-content"><strong>{{ displayName(operator) }}</strong><p>运行配置</p><dl><div><dt>运行镜像</dt><dd>{{ operator.runtime || '未提供' }}</dd></div><div><dt>调用入口</dt><dd>{{ operator.handler || '未提供' }}</dd></div></dl></div>
          </el-popover>
          <button type="button" class="operator-select-button sc-action" :aria-pressed="chosenSet.has(operator.name)" :aria-label="'选择算子：' + displayName(operator)" :disabled="submitting || (!isAvailable(operator) && !chosenSet.has(operator.name))" @click="toggleOperator(operator)">
            <span class="operator-select-icon" aria-hidden="true"><Plus class="operator-icon-add" /><Check class="operator-icon-check" /></span>
            {{ chosenSet.has(operator.name) ? '已选择' : isAvailable(operator) ? '选择算子' : '暂不可选' }}
          </button>
          </div>
        </div>
      </article>
    <div v-if="!ordered.length" key="empty" class="operator-empty">
      <el-empty :description="operators.length ? '未找到匹配算子，试试其他关键词' : '暂无算子数据'" :image-size="60" />
      <button v-if="operators.length" type="button" @click="resetFilters">清除筛选</button>
    </div>
    </TransitionGroup>
    </div>
  </section>
</template>

<style scoped>
.operator-panel { min-width: 0; overflow: hidden; border: 1px solid #e1e6ed; border-radius: 12px; background: #fff; box-shadow: 0 2px 7px rgb(31 45 61 / 4.5%); }
.operator-selection-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 30px; font-size: 13px; color: var(--scnet-text-secondary); }
.operator-selection-bar strong { color: var(--scnet-primary); font-family: var(--scnet-font-mono); }
.operator-batch-actions { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.operator-batch-icon { display: inline-flex; width: 16px; height: 16px; flex: 0 0 16px; }
.operator-batch-icon svg { width: 100%; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; transition: transform 260ms ease; }
.is-clear:enabled:hover .operator-batch-icon svg { transform: rotate(-35deg); }
.is-primary:enabled:hover .operator-batch-icon svg { transform: scale(1.12); }
.is-primary.is-confirmed .operator-batch-icon path { stroke-dasharray: 22; animation: operator-confirm 320ms ease-out; }
.operator-batch-label { display: grid; }
.operator-batch-label > span { grid-area: 1 / 1; }
.operator-batch-label .is-hidden { visibility: hidden; }
.operator-batch-feedback { animation: operator-feedback 180ms ease-out; }
.operator-action-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.operator-submit-panel { display: grid; gap: 10px; margin: 0 30px 18px; padding: 14px 18px; border: 1px solid #dce7f7; border-radius: 8px; background: #f5f8fe; }
.operator-submit-head { display: flex; align-items: center; gap: 10px; color: var(--scnet-primary); font-size: 14px; }
.operator-submit-spinner { width: 16px; height: 16px; flex: 0 0 16px; border: 2px solid #bfd5f3; border-top-color: var(--scnet-primary); border-radius: 50%; animation: operator-spin 700ms linear infinite; }
.operator-submit-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.operator-submit-list li { padding: 3px 10px; border: 1px solid #d5dfeb; border-radius: 999px; background: #fff; color: var(--scnet-text-secondary); font-size: 12px; }
@keyframes operator-spin { to { transform: rotate(360deg); } }
@keyframes operator-confirm { from { stroke-dashoffset: 22; } to { stroke-dashoffset: 0; } }
@keyframes operator-feedback { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
.operator-select-icon { display: grid; place-items: center; flex: 0 0 18px; width: 18px; height: 18px; line-height: 0; }
.operator-select-icon svg { grid-area: 1 / 1; display: block; transition: opacity 160ms ease, transform 220ms var(--scnet-hover-easing); }
.operator-icon-check { opacity: 0; transform: scale(.6); }
.operator-select-button { min-width: 114px; }
.operator-select-button[aria-pressed="true"] .operator-icon-add { opacity: 0; transform: scale(.6); }
.operator-select-button[aria-pressed="true"] .operator-icon-check { opacity: 1; transform: scale(1); }
.operator-list .operator-item.is-chosen { border-color: #99bbeb; }
.operator-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding: 26px 30px; }
.operator-header h3 { margin: 0; font-size: 21px; font-weight: 650; }
.operator-header p { margin: 6px 0 0; color: var(--scnet-text-secondary); font-size: 14px; }
.operator-header .operator-count { margin: 0; font-size: 13px; }
.operator-count strong { margin-left: 10px; color: var(--scnet-primary); font: 600 26px var(--scnet-font-mono); }
.operator-count span { color: #687588; }
.operator-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin: 0 30px; padding: 18px 0; border-block: 1px solid var(--scnet-divider); }
.operator-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.operator-filters button { min-height: 44px; padding: 0 14px; border: 0; border-radius: 6px; background: transparent; color: var(--scnet-text-secondary); cursor: pointer; }
.operator-filters button[aria-pressed="true"] { background: var(--scnet-primary-soft); color: var(--scnet-primary); font-weight: 600; }
.operator-filters button:hover { background: #f2f5fa; }
.operator-filters.has-sliding-highlight button[aria-pressed="true"] { background: transparent; }
.operator-filters > .scnet-sliding-highlight { margin: 0; }
.operator-filters span { margin-left: 6px; font: 12px var(--scnet-font-mono); }
.operator-search { display: flex; align-items: center; gap: 8px; width: 290px; max-width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid var(--scnet-border); border-radius: 6px; }
.operator-search svg { flex: 0 0 18px; width: 18px; fill: none; stroke: #687588; stroke-width: 1.6; stroke-linecap: round; }
.operator-search input { min-width: 0; width: 100%; padding-block: 10px; border: 0; outline: 0; background: transparent; color: var(--scnet-text); font-size: 13px; }
.operator-search input::placeholder { color: #687588; }
.operator-search:focus-within { outline: 2px solid var(--scnet-primary); outline-offset: 2px; }
.operator-search-result { margin: 18px 30px 0; color: var(--scnet-text-secondary); font-size: 13px; }
.operator-list-frame { overflow: hidden; overflow-anchor: none; }
.operator-list { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 20px; padding: 4px 30px 30px; }
.operator-item { box-sizing: border-box; position: relative; isolation: isolate; display: flex; flex-direction: column; min-width: 0; padding: 24px; border: 1px solid var(--scnet-border); border-radius: 9px; background: #fff; transition: var(--scnet-hover-transition); }
.operator-filter-move { transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1); }
.operator-filter-enter-active { transition: opacity 240ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1); }
.operator-filter-leave-active { position: absolute; pointer-events: none; transition: opacity 180ms ease, transform 220ms ease; }
.operator-filter-enter-from, .operator-filter-leave-to { opacity: 0; transform: translateY(8px) scale(.985); }
.operator-item::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: var(--scnet-primary-soft); opacity: 0; transition: opacity 320ms var(--scnet-hover-easing); pointer-events: none; }
.operator-item.is-chosen::before { opacity: 1; }
.operator-item:hover, .operator-item:focus-within { background: var(--scnet-hover-bg); box-shadow: 0 4px 14px rgb(11 91 211 / 6%); }
.operator-main { display: flex; align-items: flex-start; gap: 12px; }
.operator-symbol { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 auto; border: 1px solid #dce7f7; border-radius: 8px; background: #f5f8fe; color: var(--scnet-primary); }
.operator-symbol svg { width: 25px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.operator-content { min-width: 0; flex: 1; }
.operator-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
.operator-heading h4 { margin: 0; font-size: 17px; font-weight: 600; overflow-wrap: anywhere; }
.operator-recommended { padding: 1px 7px; border-radius: 4px; color: var(--scnet-primary); background: var(--scnet-primary-soft); font-size: 11px; white-space: nowrap; }
.operator-optional { padding: 1px 7px; border: 1px solid #e1e6ed; border-radius: 4px; color: #687588; background: #f6f8fb; font-size: 11px; white-space: nowrap; }
.operator-id { margin: 3px 0 0; color: #687588; font: 12px/1.7 var(--scnet-font-mono); overflow-wrap: anywhere; }
.operator-id span { margin-left: 10px; }
.operator-description { min-height: 3.5em; margin: 18px 0; color: var(--scnet-text-secondary); font-size: 15px; line-height: 1.75; }
.operator-status { flex: 0 0 auto; color: var(--scnet-text-secondary); font-size: 12px; }
.operator-status.is-ready { color: #49735d; }
.operator-bottom { margin-top: auto; }
.operator-requirements { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 16px 0; margin: 0; border-block: 1px solid #e3eaf4; }
.operator-requirements > div { display: grid; align-content: start; gap: 6px; min-width: 0; }
.operator-requirements dt { font-size: 12px; color: #687588; }
.operator-requirements dd { margin: 0; font: 500 14px var(--scnet-font-mono); overflow-wrap: anywhere; }
.operator-requirements small { font: 12px var(--scnet-font-sans); }
.operator-runtime { text-transform: capitalize; }
.operator-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; }
.operator-detail-trigger { padding-inline: 8px; }
.operator-detail-trigger .detail-arrow { width: 13px; opacity: .5; transition: transform 220ms ease, opacity 220ms ease; }
.operator-detail-trigger:hover .detail-arrow { transform: translate(2px, -2px); opacity: 1; }
.operator-runtime-content > strong { display: block; color: #263c58; font-size: 15px; }
.operator-runtime-content > p { margin: 5px 0 16px; color: #8290a2; font-size: 12px; }
.operator-runtime-content dl { display: grid; gap: 16px; margin: 0; padding-top: 16px; border-top: 1px solid #e3eaf4; }
.operator-runtime-content dl > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 14px; }
.operator-runtime-content dt { color: #718096; font-size: 12px; }
.operator-runtime-content dd { margin: 0; color: #344b69; font: 12px/1.7 var(--scnet-font-mono); overflow-wrap: anywhere; }
.operator-empty { box-sizing: border-box; grid-column: 1 / -1; padding-bottom: 26px; text-align: center; }
.operator-empty button { min-height: 44px; border: 0; color: var(--scnet-primary); background: transparent; cursor: pointer; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 3px; }
@media (max-width: 1150px) { .operator-list { grid-template-columns: 1fr; } }
@media (max-width: 760px) {
  .operator-header { padding: 22px; }
  .operator-toolbar { margin-inline: 22px; }
  .operator-list { padding-inline: 22px; }
  .operator-search { width: 100%; }
  .operator-requirements { grid-template-columns: 1fr 1fr; gap: 12px; }
}
@media (max-width: 480px) {
  .operator-header { padding: 20px; }
  .operator-toolbar, .operator-search-result { margin-inline: 20px; }
  .operator-list { padding-inline: 20px; }
  .operator-symbol { display: none; }
  .operator-main { flex-wrap: wrap; }
  .operator-content { flex-basis: 55%; }
  .operator-selection-bar { padding-inline: 20px; }
  .operator-submit-panel { margin-inline: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .operator-batch-button, .operator-batch-icon svg { transition: none; }
  .operator-batch-button:enabled:hover, .operator-batch-button:enabled:active, .operator-batch-button .operator-batch-icon svg { transform: none; }
  .is-primary.is-confirmed .operator-batch-icon path, .operator-batch-feedback, .operator-submit-spinner { animation: none; }
  .operator-filter-move, .operator-filter-enter-active, .operator-filter-leave-active { transition: none; }
  .operator-details::details-content { transition: none; }
.operator-item::before, .operator-select-button, .operator-select-icon svg { transition: none; }
}
</style>
