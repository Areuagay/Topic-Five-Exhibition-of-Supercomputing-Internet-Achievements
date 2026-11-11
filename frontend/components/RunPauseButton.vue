<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pause, Play } from '@lucide/vue'
import { useApi } from '~/composables/useApi'

const props = withDefaults(defineProps<{
  domain: string
  runId?: string
  status?: string
  /** 紧凑模式：用于监控列表的任务条 */
  compact?: boolean
}>(), { runId: '', status: '', compact: false })

const emit = defineEmits<{ changed: [status: string] }>()
const { pauseRun, resumeRun } = useApi()
const busy = ref(false)
const failed = ref('')

const paused = computed(() => props.status === 'paused')
const canPause = computed(() => ['running', 'queued', 'pending'].includes(props.status ?? ''))
const visible = computed(() => !!props.runId && (paused.value || canPause.value))
const label = computed(() => (paused.value ? '继续运行' : '暂停'))

async function toggle(): Promise<void> {
  if (!props.runId || busy.value) return
  busy.value = true
  failed.value = ''
  try {
    const next = paused.value
      ? await resumeRun(props.domain, props.runId)
      : await pauseRun(props.domain, props.runId)
    emit('changed', next.status)
  } catch (error) {
    failed.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <span v-if="visible" class="run-pause">
    <button
      type="button"
      class="run-pause__btn"
      :class="{ 'is-paused': paused, 'is-compact': compact }"
      :disabled="busy"
      :aria-label="`${label}当前任务`"
      :title="failed || `${label}当前任务`"
      @click.stop="toggle"
    >
      <Play v-if="paused" :size="compact ? 13 : 15" aria-hidden="true" />
      <Pause v-else :size="compact ? 13 : 15" aria-hidden="true" />
      <span>{{ busy ? '处理中…' : label }}</span>
    </button>
    <em v-if="failed" class="run-pause__error">{{ failed }}</em>
  </span>
</template>

<style scoped>
.run-pause { display: inline-flex; align-items: center; gap: 6px; }
.run-pause__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #d5dde8;
  border-radius: 6px;
  background: #fff;
  color: #45536a;
  font-family: var(--scnet-font-sans);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 160ms, background-color 160ms, color 160ms;
}
.run-pause__btn.is-compact { min-height: 28px; padding: 0 10px; font-size: 12px; border-radius: 5px; }
.run-pause__btn:hover { border-color: #9eb7da; background: #f6f9fd; color: var(--scnet-primary); }
.run-pause__btn:disabled { opacity: 0.6; cursor: progress; }
.run-pause__btn.is-paused { border-color: #bfd5f3; background: #edf4ff; color: var(--scnet-primary); }
.run-pause__error { color: #c0392b; font-size: 12px; font-style: normal; }
</style>
