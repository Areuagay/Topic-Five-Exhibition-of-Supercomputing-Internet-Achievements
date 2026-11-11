<script setup lang="ts">
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, ref } from 'vue'
import RunDetailContent from '~/components/run/RunDetailContent.vue'

const props = defineProps<{
  domain: string
  available?: boolean
  runStatus?: string
  progress?: number
  runId: string
}>()
const emit = defineEmits<{ 'back-to-monitor': []; refresh: [] }>()

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
    <Suspense v-if="props.runId && props.available" :timeout="0" @resolve="revealLoadedResult">
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
      <strong>{{ !runId ? '暂无可展示的运行记录' : ['running', 'queued', 'pending', 'paused'].includes(runStatus ?? '') ? '任务尚未完成' : '该记录暂无结果文件' }}</strong>
      <el-progress v-if="runId && ['running', 'queued', 'pending', 'paused'].includes(runStatus ?? '')" :percentage="progress ?? 0" style="width: min(360px, 100%)" />
      <p>{{ runId && ['running', 'queued', 'pending', 'paused'].includes(runStatus ?? '') ? '任务跑完后这里会自动显示图表与成果；也可以先切到已完成的记录看效果。' : '成功完成且具有结果文件的任务可在此查看图表与成果。' }}</p>
      <p v-if="runId && ['running', 'queued', 'pending', 'paused'].includes(runStatus ?? '')" class="exp-result-tip">
        返回「执行监控」后，在上方运行记录里选一条带「查看结果」的历史记录即可查看已完成的结果。
      </p>
      <div class="exp-result-actions">
        <RunPauseButton :domain="domain" :run-id="runId" :status="runStatus" @changed="emit('refresh')" />
        <button type="button" class="sc-action sc-action--soft" @click="emit('back-to-monitor')">返回执行监控</button>
      </div>
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
.exp-result-empty .exp-result-tip { max-width: 560px; color: #8a5a12; }
.exp-result-actions { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
.exp-result-empty button { padding: 8px 14px; border: 1px solid #bfd5f3; border-radius: 6px; background: #edf4ff; color: var(--scnet-primary); cursor: pointer; }
</style>
