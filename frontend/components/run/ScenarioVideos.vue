<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { Play } from '@lucide/vue'
import { useApi } from '~/composables/useApi'
import { resolveArtifactUrl } from '~/utils/workspace'
import ResourceState from './ResourceState.vue'

const props = defineProps<{ domain: string; scenarioId: string }>()
const config = useRuntimeConfig()
const { getScenarioVideos } = useApi()
const headingId = useId()
const player = ref<HTMLVideoElement>()
const selectedId = ref('')
const failed = ref(false)
const retryKey = ref(0)
const { data: videos, pending, error, refresh } = useAsyncData(
  () => `scenario-videos-${props.domain}-${props.scenarioId}`,
  () => getScenarioVideos(props.domain, props.scenarioId),
  { server: false, lazy: true },
)
const current = computed(() => videos.value?.find(item => item.id === selectedId.value) ?? videos.value?.[0])
const videoUrl = computed(() => resolveArtifactUrl(current.value?.video_url, config.public.apiBase))
function pause() { player.value?.pause() }
function select(id: string) { if (current.value?.id !== id) { pause(); selectedId.value = id } }
async function retry() {
  failed.value = false
  retryKey.value++
  await refresh()
}
watch(() => current.value?.id, () => { failed.value = false; retryKey.value = 0 })
onDeactivated(pause)
onBeforeUnmount(pause)
function duration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` }
</script>

<template>
  <section v-if="pending || error || videos?.length" class="scenario-videos" :aria-labelledby="headingId">
    <header class="scenario-videos-heading">
      <h2 :id="headingId">场景演示视频</h2>
      <span v-if="videos?.length">{{ videos.length }} 个视频</span>
    </header>
    <ResourceState :pending="pending" :error="error" :empty="!videos?.length" label="演示视频" @retry="refresh()">
      <div v-if="current" class="scenario-videos-body">
        <div class="scenario-videos-choices" role="group" aria-label="选择演示视频">
          <button v-for="item in videos" :key="item.id" type="button" class="sc-action sc-action--small"
            :class="{ 'is-selected': item.id === current.id }" :aria-pressed="item.id === current.id" @click="select(item.id)">
            <Play aria-hidden="true" /><span>{{ item.title }}</span><small>{{ duration(item.duration_seconds) }}</small>
          </button>
        </div>
        <div class="scenario-video-stage">
          <div v-if="!current.available || failed" class="scenario-video-failure" role="alert">
            <strong>视频暂时无法播放</strong>
            <p>请重试，或选择其他演示视频。</p>
            <button class="sc-action" type="button" @click="retry">重新加载</button>
          </div>
          <video v-else ref="player" :key="`${current.id}-${retryKey}`" :src="videoUrl" controls playsinline preload="metadata"
            :aria-label="current.title" @error="failed = true" />
        </div>
      </div>
    </ResourceState>
  </section>
</template>

<style scoped>
.scenario-videos { min-width: 0; overflow: hidden; border: 1px solid var(--scnet-divider); border-radius: 10px; background: var(--scnet-panel); box-shadow: 0 2px 8px rgb(31 45 61 / 3.5%); }
.scenario-videos-heading { min-height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 32px; border-bottom: 1px solid var(--scnet-divider); }
.scenario-videos-heading h2 { margin: 0; color: var(--scnet-text); font-size: 19px; font-weight: 650; line-height: 1.35; }
.scenario-videos-heading > span { flex-shrink: 0; color: var(--scnet-text-muted); font-size: 12px; }
.scenario-videos-body { padding: 24px 32px; }
.scenario-videos-choices { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
.scenario-videos-choices .sc-action { max-width: 100%; height: auto; min-height: 36px; white-space: normal; text-align: left; }
.scenario-videos-choices .sc-action.is-selected { border-color: var(--scnet-primary); color: var(--scnet-primary); background: var(--scnet-primary-soft); }
.scenario-videos-choices svg { width: 14px; height: 14px; flex-shrink: 0; }
.scenario-videos-choices small { color: var(--scnet-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.scenario-video-stage { overflow: hidden; border: 1px solid var(--scnet-divider); border-radius: 8px; background: var(--scnet-subtle); }
.scenario-video-stage video { display: block; width: 100%; aspect-ratio: 16 / 9; max-height: 560px; object-fit: contain; background: #101820; }
.scenario-video-failure { min-height: 240px; display: grid; justify-items: center; align-content: center; gap: 12px; padding: 28px; color: var(--scnet-text-secondary); }
.scenario-video-failure p { margin: 0; font-size: 13px; }
@media (max-width: 700px) { .scenario-videos-heading { padding: 18px 20px; min-height: 64px; } .scenario-videos-body { padding: 18px 20px; } .scenario-videos-choices { gap: 8px; margin-bottom: 16px; } }
</style>
