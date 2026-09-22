<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSlidingHighlight } from '~/composables/useSlidingHighlight'
import { formatBytes, formatNumber, statusText } from '~/composables/useFormat'
import type { Operator, OperatorRef } from '~/types'

const props = defineProps<{ domain: string; operators: Operator[]; selectedOperators: OperatorRef[]; chosenIds: string[]; submitting?: boolean; submittedMessage?: string }>()
const emit = defineEmits<{ 'update:chosenIds': [value: string[]]; submit: [] }>()
const chosenSet = computed(() => new Set(props.chosenIds))
const chosenCount = computed(() => props.operators.filter((item) => chosenSet.value.has(item.name)).length)
/** 提交按钮仅在首个学科域（地球动力学）体验中启用 */
const interactive = computed(() => props.domain === 'geodynamics')
const submittedNames = computed(() => props.operators.filter((item) => chosenSet.value.has(item.name)).map((item) => displayName(item)))
const submitting = computed(() => props.submitting === true)
const showSubmitPanel = computed(() => submitting.value || !!props.submittedMessage)
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
      <span role="status">本次已选 <strong>{{ chosenCount }}</strong> 个算子</span>
      <div class="operator-batch-actions">
        <button type="button" class="operator-batch-button is-primary" :class="{ 'is-confirmed': actionFeedback === 'recommended' }" :disabled="!recommendedCount" @click="useRecommended">
          <span class="operator-batch-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-9" /></svg></span>
          <span class="operator-batch-label"><span :class="{ 'is-hidden': actionFeedback === 'recommended' }">采用场景推荐</span><span v-if="actionFeedback === 'recommended'" class="operator-batch-feedback">已采用推荐</span></span>
        </button>
        <button type="button" class="operator-batch-button is-clear" :class="{ 'is-confirmed': actionFeedback === 'cleared' }" :disabled="!chosenCount" @click="clearSelection">
          <span class="operator-batch-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 8a6 6 0 1 1 0 5M4 3v5h5" /></svg></span>
          <span class="operator-batch-label"><span :class="{ 'is-hidden': actionFeedback === 'cleared' }">清空选择</span><span v-if="actionFeedback === 'cleared'" class="operator-batch-feedback">已清空</span></span>
        </button>
        <button v-if="interactive" type="button" class="operator-batch-button is-submit" :disabled="!chosenCount || submitting" @click="emit('submit')">
          <span class="operator-batch-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M3 11l4.5 4.5L17 5" /></svg></span>
          <span class="operator-batch-label">{{ submitting ? '提交中…' : '提交算子' }}</span>
        </button>
        <span class="operator-action-status" role="status">{{ actionFeedback === 'recommended' ? '已采用场景推荐算子' : actionFeedback === 'cleared' ? '已清空算子选择' : '' }}</span>
      </div>
    </div>
    <div v-if="showSubmitPanel" class="operator-submit-panel" role="status">
      <div class="operator-submit-head">
        <span v-if="submitting" class="operator-submit-spinner" aria-hidden="true" />
        <strong>{{ submitting ? '正在提交本次体验所选算子…' : props.submittedMessage }}</strong>
      </div>
      <ul v-if="submittedNames.length" class="operator-submit-list" aria-label="本次提交的算子">
        <li v-for="name in submittedNames" :key="name">{{ name }}</li>
      </ul>
    </div>
    <p v-if="query.trim()" class="operator-search-result" role="status">找到 {{ ordered.length }} 个匹配算子</p>
    <div ref="listFrame" class="operator-list-frame">
    <TransitionGroup tag="div" name="operator-filter" class="operator-list" @before-leave="positionLeavingItem" @after-leave="clearItemPosition" @leave-cancelled="clearItemPosition" @before-enter="clearItemPosition">
      <article v-for="operator in ordered" :key="operator.name" class="operator-item" :class="{ 'is-chosen': chosenSet.has(operator.name) }">
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
          <details class="operator-details">
            <summary :aria-label="'查看 ' + displayName(operator) + ' 的运行详情'">运行详情</summary>
            <dl><div><dt>运行镜像</dt><dd>{{ operator.runtime || '未提供' }}</dd></div><div><dt>调用入口</dt><dd>{{ operator.handler || '未提供' }}</dd></div></dl>
          </details>
          <button type="button" class="operator-select-button" :aria-pressed="chosenSet.has(operator.name)" :aria-label="'选择算子：' + displayName(operator)" :disabled="!isAvailable(operator) && !chosenSet.has(operator.name)" @click="toggleOperator(operator)">
            <span class="operator-select-icon" aria-hidden="true"><span>+</span><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-9"/></svg></span>
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
.operator-batch-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 0 13px; border: 1px solid #d5dfeb; border-radius: 6px; background: #fff; color: #526176; font: inherit; font-weight: 500; cursor: pointer; transition: background-color 200ms ease, border-color 200ms ease, box-shadow 200ms ease, transform 220ms cubic-bezier(.2,.8,.2,1); }
.operator-batch-button.is-primary { border-color: #bfd5f3; background: #edf4ff; color: var(--scnet-primary); }
.operator-batch-button:enabled:hover { transform: translateY(-2px); border-color: #9dbde8; background: #f0f6ff; box-shadow: 0 4px 10px rgb(23 105 210 / 10%); }
.operator-batch-button.is-primary:enabled:hover { border-color: #86b1ed; background: #deebff; }
.operator-batch-button:enabled:active { transform: translateY(0) scale(.97); box-shadow: none; transition-duration: 90ms; }
.operator-batch-button:disabled { border-color: #e1e6ed; background: #f4f6f8; color: #929dab; box-shadow: none; cursor: not-allowed; }
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
.operator-batch-button.is-submit { border-color: var(--scnet-primary); background: var(--scnet-primary); color: #fff; }
.operator-batch-button.is-submit:enabled:hover { border-color: #0b5bd3; background: #0b5bd3; }
.operator-submit-panel { display: grid; gap: 10px; margin: 0 30px 18px; padding: 14px 18px; border: 1px solid #dce7f7; border-radius: 8px; background: #f5f8fe; }
.operator-submit-head { display: flex; align-items: center; gap: 10px; color: var(--scnet-primary); font-size: 14px; }
.operator-submit-spinner { width: 16px; height: 16px; flex: 0 0 16px; border: 2px solid #bfd5f3; border-top-color: var(--scnet-primary); border-radius: 50%; animation: operator-spin 700ms linear infinite; }
.operator-submit-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.operator-submit-list li { padding: 3px 10px; border: 1px solid #d5dfeb; border-radius: 999px; background: #fff; color: var(--scnet-text-secondary); font-size: 12px; }
@keyframes operator-spin { to { transform: rotate(360deg); } }
@keyframes operator-confirm { from { stroke-dashoffset: 22; } to { stroke-dashoffset: 0; } }
@keyframes operator-feedback { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
.operator-select-button { display: inline-flex; justify-content: center; align-items: center; gap: 7px; min-width: 118px; min-height: 44px; padding: 0 14px; border: 1px solid #d2dce9; border-radius: 6px; background: #fff; color: var(--scnet-primary); font-size: 14px; cursor: pointer; transition: var(--scnet-hover-transition), color 180ms ease, transform 180ms ease; }
.operator-select-button[aria-pressed="true"] { background: var(--scnet-primary); border-color: var(--scnet-primary); color: #fff; }
.operator-select-button:enabled:active { transform: scale(.97); }
.operator-select-icon { position: relative; width: 18px; height: 18px; line-height: 18px; }
.operator-select-icon > span { display: block; font-size: 21px; transition: opacity 140ms ease, transform 180ms ease; }
.operator-select-icon svg { position: absolute; inset: 0; width: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.operator-select-icon path { stroke-dasharray: 20; stroke-dashoffset: 20; transition: stroke-dashoffset 220ms ease; }
.operator-select-button[aria-pressed="true"] .operator-select-icon > span { opacity: 0; transform: scale(.5); }
.operator-select-button[aria-pressed="true"] .operator-select-icon path { stroke-dashoffset: 0; transition-delay: 80ms; }
.operator-select-button:enabled:hover { border-color: var(--scnet-primary); }
.operator-select-button:disabled { color: #a1a8b3; cursor: not-allowed; }
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
.operator-item::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: #edf4ff; transform: scaleX(0); transform-origin: left center; transition: transform 360ms var(--scnet-hover-easing); pointer-events: none; }
.operator-item.is-chosen::before { transform: scaleX(1); }
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
.operator-bottom { margin-top: 0; }
.operator-requirements { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 16px 0; margin: 0; border-block: 1px solid #e3eaf4; }
.operator-requirements > div { display: grid; align-content: start; gap: 6px; min-width: 0; }
.operator-requirements dt { font-size: 12px; color: #687588; }
.operator-requirements dd { margin: 0; font: 500 14px var(--scnet-font-mono); overflow-wrap: anywhere; }
.operator-requirements small { font: 12px var(--scnet-font-sans); }
.operator-runtime { text-transform: capitalize; }
.operator-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 0 16px; margin-top: 16px; }
.operator-details { grid-column: 1 / -1; grid-row: 1; min-width: 0; }
.operator-details summary { display: list-item; width: fit-content; max-width: calc(100% - 136px); min-height: 44px; padding-block: 11px; color: var(--scnet-primary); cursor: pointer; font-size: 13px; }
.operator-details dl { display: grid; gap: 12px; margin: 12px 0 0; padding: 16px 20px; background: #f7f9fc; border-radius: 6px; }
.operator-actions > button { grid-column: 2; grid-row: 1; position: relative; z-index: 1; }
@supports (interpolate-size: allow-keywords) and (transition-behavior: allow-discrete) {
  .operator-details { interpolate-size: allow-keywords; }
  .operator-details::details-content {
    block-size: 0;
    opacity: 0;
    overflow: clip;
    transition: block-size 280ms var(--scnet-hover-easing), opacity 180ms ease, content-visibility 280ms allow-discrete;
  }
  .operator-details[open]::details-content { block-size: auto; opacity: 1; }
  .operator-details[open] > dl { animation: none; }
}
.operator-details dl > div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
.operator-details dt { color: #687588; font-size: 12px; }
.operator-details dd { margin: 0; font: 12px/1.7 var(--scnet-font-mono); overflow-wrap: anywhere; }
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
  .operator-item::before, .operator-select-button, .operator-select-icon > span, .operator-select-icon path { transition: none; }
}
</style>
