<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { createImageCache } from '~/utils/image-cache'
import type { Artifact } from '~/types'
import { resolveArtifactUrl } from '~/utils/workspace'
import { parseCsvPreview, previewKind } from '~/utils/artifact-preview'
import PreviewFailure from './PreviewFailure.vue'

const props = defineProps<{ artifact: Artifact; sourceType?: string; hideCaption?: boolean; preloadUrls?: string[] }>()
const config = useRuntimeConfig()
const url = computed(() => resolveArtifactUrl(props.artifact.preview_url || props.artifact.download_url, config.public.apiBase))
const format = computed(() => (props.artifact.format || props.artifact.name.split('.').pop() || '').toLowerCase())
const kind = computed(() => previewKind(props.artifact))
const isImage = computed(() => kind.value === 'image')
const isVideo = computed(() => kind.value === 'video')
const isText = computed(() => ['json', 'csv', 'text'].includes(kind.value ?? ''))
const csvRows = ref<string[][]>([])
const truncated = ref(false)
const columnCount = computed(() => Math.max(0, ...csvRows.value.map(row => row.length)))
const failed = ref(false)
const pending = ref(false)
const content = ref('')
const retryKey = ref(0)
const imageHost = ref<HTMLDivElement>()
const imageCache = createImageCache(async (source: string) => {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
})
onBeforeUnmount(() => imageCache.clear())
// Warm a bounded number of frames with two workers; each Image is decoded only once.
watch(() => props.preloadUrls, async (urls, _, onCleanup) => {
  if (import.meta.server) return
  let cancelled = false
  onCleanup(() => { cancelled = true })
  const queue = [...new Set((urls ?? []).map(value => resolveArtifactUrl(value, config.public.apiBase)).filter(Boolean))].slice(0, 24)
  await Promise.all([0, 1].map(async () => {
    while (queue.length && !cancelled) {
      try { await imageCache.get(queue.shift()!) } catch { /* Interactive preview provides retry. */ }
    }
  }))
}, { immediate: true, flush: 'post' })
watch([url, format, retryKey], async (_, __, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  failed.value = false
  content.value = ''
  csvRows.value = []
  truncated.value = false
  pending.value = false
  if (isImage.value && url.value && props.artifact.preview_supported !== false) {
    if (import.meta.server) return
    pending.value = true
    try {
      const nextImage = await imageCache.get(url.value)
      await nextTick()
      if (!controller.signal.aborted && imageHost.value) {
        nextImage.alt = props.artifact.name
        imageHost.value.replaceChildren(nextImage)
      }
    } catch { if (!controller.signal.aborted) failed.value = true }
    finally { if (!controller.signal.aborted) pending.value = false }
    return
  }
  if (!url.value || props.artifact.preview_supported === false || !isText.value) return
  pending.value = true
  try {
    const response = await fetch(url.value, { signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('Preview unavailable')
    // Bound text previews to 256 KiB, including chunked responses.
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let size = 0
    let result = ''
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      const remaining = 262144 - size
      result += decoder.decode(chunk.value.subarray(0, remaining), { stream: true })
      size += chunk.value.byteLength
      if (size >= 262144) { await reader.cancel(); truncated.value = true; break }
    }
    result += decoder.decode()
    if (controller.signal.aborted) return
    if (format.value === 'json' && size < 262144) result = JSON.stringify(JSON.parse(result), null, 2)
    if (kind.value === 'csv') {
      const parsed = parseCsvPreview(result, truncated.value)
      csvRows.value = parsed.rows
      truncated.value = parsed.truncated
    }
    content.value = result
  } catch { if (!controller.signal.aborted) failed.value = true }
  finally { if (!controller.signal.aborted) pending.value = false }
}, { immediate: true, flush: 'post' })
</script>

<template>
  <figure class="artifact-preview">
    <figcaption v-if="!hideCaption">
      <span>{{ artifact.name }}</span>
    </figcaption>
    <div v-if="isImage && url && artifact.preview_supported !== false" class="image-stage" :aria-busy="pending">
      <div ref="imageHost" class="image-host" />
      <PreviewFailure v-if="failed" class="image-failure" @retry="retryKey++" />
      <div v-else-if="pending" class="image-feedback loading-feedback" role="status">正在加载画面…</div>
    </div>
    <div v-else-if="!url || !kind" class="preview-message">该文件不支持预览，可使用下载查看。</div>
    <PreviewFailure v-else-if="failed" @retry="retryKey++; failed = false" />
    <div v-else-if="pending" class="preview-message" role="status">正在加载预览…</div>
    <video v-else-if="isVideo" :key="`${url}-${retryKey}`" :src="url" controls preload="metadata" :aria-label="artifact.name" @error="failed = true" />
    <audio v-else-if="kind === 'audio'" :key="`${url}-${retryKey}`" :src="url" controls preload="metadata" :aria-label="artifact.name" @error="failed = true" />
    <div v-else-if="kind === 'csv'" class="csv-preview">
      <template v-if="csvRows.length"><div class="csv-meta"><span>表格预览 <small>只读</small></span><span>{{ Math.max(0,csvRows.length - 1) }} 行 · {{ columnCount }} 列</span></div>
        <div class="csv-scroll" tabindex="0" role="region" :aria-label="`${artifact.name} 只读表格`"><table><thead><tr><th class="row-index" scope="col">#</th><th v-for="col in columnCount" :key="col" scope="col">{{ csvRows[0]?.[col-1] || `列 ${col}` }}</th></tr></thead><tbody><tr v-for="(row,index) in csvRows.slice(1)" :key="index"><th class="row-index" scope="row">{{ index+1 }}</th><td v-for="col in columnCount" :key="col">{{ row[col-1] ?? '' }}</td></tr></tbody></table></div>
      </template><div v-else class="preview-message">文件为空</div>
    </div>
    <pre v-else-if="isText" tabindex="0" :aria-label="`${artifact.name} 文件内容`">{{ content || '文件为空' }}</pre>
    <p v-if="truncated && !failed && !pending" class="preview-limit">仅显示部分内容，请下载查看完整文件。</p>
  </figure>
</template>

<style scoped>
.artifact-preview { margin: 0; min-width: 0; }
figcaption { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 12px 0; font-size: 13px; color: var(--scnet-text-muted); overflow-wrap: anywhere; }
.image-stage { position: relative; height: clamp(260px, 38vw, 480px); overflow: hidden; border: 1px solid var(--scnet-divider); border-radius: 6px; background: #f8fafc; }
.image-host { width: 100%; height: 100%; }
.image-failure { position:absolute; inset:0; height:100%; }
.csv-meta { display:flex; justify-content:space-between; gap:16px; padding:12px 0; font-size:13px; color:var(--scnet-text-secondary); }.csv-meta small { margin-left:8px; padding:3px 7px; background:#edf3fc; color:#47709f; border-radius:4px; }
.csv-scroll { max-height: min(56vh,520px); overflow:auto; border:1px solid #e1e8f0; border-radius:6px; }
.csv-scroll table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; color:var(--scnet-text); text-align:left; }
.csv-scroll th,.csv-scroll td { padding:10px 16px; line-height:20px; border-bottom:1px solid #edf1f5; border-right:1px solid #edf1f5; min-width:100px; max-width:360px; white-space:pre-wrap; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
.csv-scroll thead th { position:sticky; top:0; z-index:2; background:#edf3fb; font-weight:600; }.csv-scroll .row-index { position:sticky; left:0; box-sizing:border-box; min-width:60px; width:60px; max-width:60px; padding:10px 12px; white-space:nowrap; overflow-wrap:normal; word-break:normal; text-align:center; font-weight:500; font-family:var(--scnet-font-mono); color:#8692a3; background:#f7f9fc; }.csv-scroll thead .row-index { z-index:3; }.csv-scroll tbody tr:nth-child(even) td { background:#fafcfe; }.csv-scroll tbody td { transition: background-color var(--scnet-hover-duration) var(--scnet-hover-easing); }.csv-scroll tbody tr:hover td { background:var(--scnet-hover-bg); }
.csv-scroll:focus-visible { outline:2px solid var(--scnet-primary); outline-offset:2px; }.preview-limit { margin:12px 0 0; font-size:13px; color:var(--scnet-text-secondary); }audio { width:100%; margin:20px 0; }
.image-host :deep(img) { display: block; width: 100%; height: 100%; object-fit: contain; }
.loading-feedback { animation: reveal-loading 0s 180ms both; }
@keyframes reveal-loading { from { opacity: 0; } to { opacity: 1; } }
.image-feedback { position: absolute; inset: auto 0 0; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 12px; background: rgb(248 250 252 / 94%); color: var(--scnet-text-muted); font-size: 13px; }
video { display: block; width: 100%; max-height: 480px; object-fit: contain; border: 1px solid var(--scnet-divider); border-radius: 6px; background: #f8fafc; }
pre { max-height: 400px; overflow: auto; padding: 16px; background: #f5f7fa; font-size: 13px; }
.preview-message { min-height: 160px; display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--scnet-text-muted); font-size: 14px; }
button { min-height: 44px; border: 1px solid #c9d9ec; border-radius: 6px; background: #f5f8fc; color: var(--scnet-primary); padding: 0 16px; cursor: pointer; }
button:focus-visible, pre:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: 2px; }
</style>
