<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Scenario } from '~/types'

const props = defineProps<{
  scenarios: Scenario[]
  modelValue: string
  domain: string
  runsActive?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()

interface NavigationTransition {
  from: string
  to: string
}

const trackRef = ref<HTMLElement | null>(null)
const indicatorReady = ref(false)
const pendingTransition = useState<NavigationTransition | null>(
  `scenario-selector-transition:${props.domain}`,
  () => null,
)
const indicatorStyle = ref({
  width: '0px',
  opacity: '0',
  transform: 'translate3d(0, 0, 0)',
})
let resizeObserver: ResizeObserver | undefined

function currentNavigationKey(): string {
  return props.runsActive ? '__runs__' : props.modelValue
}

function rememberNavigationOrigin(targetKey: string, event: MouseEvent): void {
  if (
    event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return

  pendingTransition.value = {
    from: currentNavigationKey(),
    to: targetKey,
  }
}

function updateIndicator(activeKey = currentNavigationKey()): void {
  const track = trackRef.value
  if (!track) return

  const activeItem = Array.from(track.querySelectorAll<HTMLElement>('[data-nav-key]'))
    .find((item) => item.dataset.navKey === activeKey)

  if (!activeItem) {
    indicatorStyle.value = {
      width: '0px',
      opacity: '0',
      transform: 'translate3d(0, 0, 0)',
    }
    return
  }

  const indicatorInset = 22
  indicatorStyle.value = {
    width: `${Math.max(24, activeItem.offsetWidth - indicatorInset * 2)}px`,
    opacity: '1',
    transform: `translate3d(${activeItem.offsetLeft + indicatorInset}px, 0, 0)`,
  }
}

watch(
  [
    () => props.modelValue,
    () => props.runsActive,
    () => props.scenarios.map((scenario) => `${scenario.id}:${scenario.name}`).join('|'),
  ],
  () => { void nextTick(updateIndicator) },
  { flush: 'post' },
)

onMounted(async () => {
  const activeKey = currentNavigationKey()
  const transition = pendingTransition.value
  pendingTransition.value = null
  const originKey = transition?.to === activeKey && transition.from !== activeKey
    ? transition.from
    : null

  if (originKey) {
    updateIndicator(originKey)
    await nextTick()
    indicatorReady.value = true
    await nextTick()
    requestAnimationFrame(() => {
      updateIndicator()
    })
  } else {
    updateIndicator()
    await nextTick()
    requestAnimationFrame(() => {
      indicatorReady.value = true
    })
  }

  if (typeof ResizeObserver !== 'undefined' && trackRef.value) {
    resizeObserver = new ResizeObserver(() => updateIndicator())
    resizeObserver.observe(trackRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <nav class="scenario-selector" aria-label="应用场景与运行记录">
    <div ref="trackRef" class="scenario-selector-track">
      <template v-for="scenario in scenarios" :key="scenario.id">
        <NuxtLink
          v-if="runsActive"
          class="scenario-selector-option"
          :data-nav-key="scenario.id"
          :to="{ path: `/domains/${domain}/scenarios`, query: { scenario: scenario.id } }"
          @click="rememberNavigationOrigin(scenario.id, $event)"
        >
          <span>{{ scenario.name }}</span>
        </NuxtLink>
        <button
          v-else
          type="button"
          class="scenario-selector-option"
          :data-nav-key="scenario.id"
          :class="{ 'is-active': scenario.id === modelValue }"
          :aria-current="scenario.id === modelValue ? 'page' : undefined"
          @click="$emit('update:modelValue', scenario.id)"
        >
          <span>{{ scenario.name }}</span>
        </button>
      </template>

      <NuxtLink
        class="scenario-selector-runs"
        data-nav-key="__runs__"
        :class="{ 'is-active': runsActive }"
        :to="`/domains/${domain}/runs`"
        :aria-current="runsActive ? 'page' : undefined"
        @click="rememberNavigationOrigin('__runs__', $event)"
      >
        运行记录
      </NuxtLink>

      <span
        class="scenario-selector-indicator"
        :class="{ 'is-ready': indicatorReady }"
        :style="indicatorStyle"
        aria-hidden="true"
      />
    </div>
  </nav>
</template>

<style scoped>
.scenario-selector {
  min-width: 0;
  display: flex;
  align-items: stretch;
  padding: 0 28px;
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}

.scenario-selector-track {
  position: relative;
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.scenario-selector-option,
.scenario-selector-runs {
  position: relative;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 0 22px;
  border: 0;
  background: transparent;
  color: #657287;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  touch-action: manipulation;
  transition: color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.scenario-selector-option:hover,
.scenario-selector-runs:hover {
  background: transparent;
  color: var(--scnet-primary);
}

.scenario-selector-option.is-active,
.scenario-selector-runs.is-active {
  background: transparent;
  color: var(--scnet-primary);
  font-weight: 600;
}

.scenario-selector-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 2;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--scnet-primary);
  pointer-events: none;
  transition: none;
  will-change: transform, width;
}

.scenario-selector-indicator.is-ready {
  transition:
    transform 300ms cubic-bezier(0.645, 0.045, 0.355, 1),
    width 300ms cubic-bezier(0.645, 0.045, 0.355, 1),
    opacity 160ms ease;
}

.scenario-selector-option:focus-visible,
.scenario-selector-runs:focus-visible {
  z-index: 1;
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: -3px;
  border-radius: 6px;
}

@media (max-width: 760px) {
  .scenario-selector {
    display: block;
    padding: 0 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scenario-selector-option,
  .scenario-selector-runs,
  .scenario-selector-indicator.is-ready {
    transition-duration: 0.01ms;
  }
}
</style>
