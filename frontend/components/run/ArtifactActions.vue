<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { Artifact } from '~/types'
import { resolveArtifactUrl } from '~/utils/workspace'
import ArtifactPreview from './ArtifactPreview.vue'
import { previewKind } from '~/utils/artifact-preview'
const props = defineProps<{ artifact: Artifact; sourceType?: string }>()
const config = useRuntimeConfig()
const show = ref(false)
const busy = ref(false)
const error = ref('')
const noticeId = useId()
const activeNotice = useState<string | null>('artifact-download-notice', () => null)
const noticeVisible = computed(() => !!error.value && activeNotice.value === noticeId)
const noticePanel = ref<HTMLElement>()
const downloadButton = ref<HTMLButtonElement>()
function closeNotice() {
  error.value = ''
  if (activeNotice.value === noticeId) activeNotice.value = null
}
watch(noticeVisible, (visible, _, onCleanup) => {
  if (!visible || import.meta.server) return
  const outside = (event: PointerEvent) => {
    const target = event.target as Node
    if (!noticePanel.value?.contains(target) && !downloadButton.value?.contains(target)) closeNotice()
  }
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeNotice() }
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('keydown', escape)
  onCleanup(() => {
    document.removeEventListener('pointerdown', outside, true)
    document.removeEventListener('keydown', escape)
  })
})
const downloadUrl = computed(() => resolveArtifactUrl(props.artifact.download_url, config.public.apiBase))
const previewUrl = computed(() => previewKind(props.artifact) ? resolveArtifactUrl(props.artifact.preview_url || props.artifact.download_url, config.public.apiBase) : '')
let controller: AbortController | undefined
onBeforeUnmount(() => { controller?.abort(); closeNotice() })
async function download() {
  if (busy.value || !downloadUrl.value) return
  busy.value = true
  error.value = ''
  activeNotice.value = noticeId
  controller = new AbortController()
  try {
    // Check status before navigation so a missing artifact stays inside the page.
    const response = await fetch(downloadUrl.value, { headers: { Range: 'bytes=0-0' }, signal: controller.signal })
    await response.body?.cancel()
    if (!response.ok) throw new Error('Unavailable')
    const link = document.createElement('a')
    link.href = downloadUrl.value
    link.download = props.artifact.name
    link.click()
  } catch { if (!controller.signal.aborted) error.value = '下载失败，请重试' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="artifact-actions">
    <button v-if="previewUrl && artifact.preview_supported !== false" type="button" @click="show = true">预览</button>
    <el-popover v-if="downloadUrl" :visible="noticeVisible" placement="bottom-end" :width="280">
      <template #reference><button ref="downloadButton" type="button" :disabled="busy" @click="download">{{ busy ? '准备中…' : '下载' }}</button></template>
      <div ref="noticePanel" class="download-failure" role="alert"><div class="download-failure-heading"><strong>暂时无法下载</strong><button type="button" aria-label="关闭下载提示" @click="closeNotice">×</button></div><p>文件可能暂不可用，请稍后重试。</p><button class="retry-download" type="button" @click="download">重新下载</button></div>
    </el-popover>
    <span v-if="!downloadUrl && !previewUrl">暂无可用文件</span>
    <el-dialog v-model="show" :title="artifact.name" width="min(900px, 92vw)" append-to-body destroy-on-close>
      <ArtifactPreview v-if="show" hide-caption :artifact="artifact" :source-type="sourceType" />
    </el-dialog>
  </div>
</template>

<style scoped>
.artifact-actions { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; }
button { min-height: 44px; padding: 0 8px; background: transparent; color: var(--scnet-primary); border: 0; cursor: pointer; }
button:hover { text-decoration: underline; }
button:disabled { opacity: .6; cursor: wait; }
button:focus-visible { outline: 2px solid var(--scnet-primary); outline-offset: -2px; }
span { color: var(--scnet-text-muted); }
.download-failure { padding:4px; font-family:var(--scnet-font-sans); }.download-failure-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--scnet-text); }.download-failure-heading strong { font-size:14px; font-weight:600; }.download-failure-heading button { min-height:28px; padding:0 6px; color:#8b96a7; font-size:22px; }.download-failure p { margin:8px 0 16px; font-size:13px; line-height:1.6; color:var(--scnet-text-secondary); }.download-failure .retry-download { min-height:34px; padding:6px 12px; border:1px solid #c4d5ed; border-radius:5px; background:#f5f8fd; font-size:13px; font-weight:600; }
</style>
