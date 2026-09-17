<script setup lang="ts">
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, ref } from 'vue'
import RunDetailContent from '~/components/run/RunDetailContent.vue'

const props = defineProps<{
  domain: string
  runId: string
}>()
const emit = defineEmits<{ 'back-to-monitor': [] }>()

const resultRoot = ref<HTMLElement>()
let active = false
let entryAnimation: Animation | undefined

function revealResult(): void {
  entryAnimation?.cancel()
  if (!active || !resultRoot.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  entryAnimation = resultRoot.value.animate([{ opacity: 0.35 }, { opacity: 1 }], {
    duration: 260,
    easing: 'ease-out',
  })
}

function revealLoadedResult(): void { void nextTick(revealResult) }
onActivated(() => { active = true; revealResult() })
onDeactivated(() => { active = false; entryAnimation?.cancel() })
onBeforeUnmount(() => entryAnimation?.cancel())
</script>

<template>
  <section ref="resultRoot" class="exp-result">
    <!-- 「结果展示」按「流程编排」所选运行记录，内联复用运行记录详情页的渲染，不离开当前页面 -->
    <Suspense v-if="props.runId" :timeout="0" @resolve="revealLoadedResult">
      <RunDetailContent
        :key="props.runId"
        :domain="props.domain"
        :run-id="props.runId"
        embedded
        @back-to-monitor="emit('back-to-monitor')"
      />
      <template #fallback>
        <div class="exp-result-loading" role="status" aria-busy="true">
          <p>正在加载结果…</p>
          <div class="exp-result-placeholder" aria-hidden="true" />
          <div class="exp-result-placeholder" aria-hidden="true" />
        </div>
      </template>
    </Suspense>
    <div v-else class="exp-result-empty" role="status">
      <strong>暂无可展示的运行记录</strong>
      <p>请在「执行监控」中选择一条运行记录，查看对应的结果详情。</p>
      <button type="button" @click="emit('back-to-monitor')">返回执行监控</button>
    </div>
  </section>
</template>

<style scoped>
.exp-result { min-width: 0; }
.exp-result-loading { min-height: 640px; display: grid; align-content: start; gap: 20px; }
.exp-result-loading p { margin: 0; padding: 24px 30px; color: var(--scnet-text-secondary); background: #fff; border: 1px solid var(--scnet-divider); border-radius: 10px; }
.exp-result-placeholder { height: 240px; border: 1px solid var(--scnet-divider); border-radius: 10px; background: #fff; }
.exp-result-empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 32px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  text-align: center;
}
.exp-result-empty strong { color: var(--scnet-text); font-size: 16px; }
.exp-result-empty p { margin: 0; color: var(--scnet-text-muted); font-size: 13px; }
.exp-result-empty button { padding: 8px 14px; border: 1px solid #bfd5f3; border-radius: 6px; background: #edf4ff; color: var(--scnet-primary); cursor: pointer; }
</style>
