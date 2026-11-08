<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { Artifact } from '~/types'
import { resolveArtifactUrl } from '~/utils/workspace'
import ArtifactPreview from './ArtifactPreview.vue'
import { previewKind } from '~/utils/artifact-preview'
import { X, LoaderCircle } from '@lucide/vue'
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
  activeNotice.value = noticeId
  controller = new AbortController()
  try {
    // Check status before navigation so a missing artifact stays inside the page.
    const response = await fetch(downloadUrl.value, { headers: { Range: 'bytes=0-0' }, signal: controller.signal })
    await response.body?.cancel()
    if (!response.ok) throw new Error('Unavailable')
    closeNotice()
    const link = document.createElement('a')
    link.href = downloadUrl.value
    link.download = props.artifact.name
    link.click()
  } catch { if (!controller.signal.aborted && activeNotice.value === noticeId) error.value = '下载失败，请重试' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="artifact-actions">
    <button class="sc-action sc-action--small" v-if="previewUrl && artifact.preview_supported !== false" type="button" @click="show = true">预览</button>
    <el-popover v-if="downloadUrl" :visible="noticeVisible" placement="bottom-end" :width="280" transition="artifact-notice" popper-class="artifact-download-popover">
      <template #reference><button ref="downloadButton" class="download-trigger sc-action sc-action--small" type="button" :disabled="busy" :aria-busy="busy" @click="download"><span class="download-label">下载</span><LoaderCircle v-if="busy" class="download-spinner" :size="14" aria-hidden="true" /></button></template>
      <div ref="noticePanel" class="download-failure" role="alert">
        <div class="download-failure-heading"><strong>暂时无法下载</strong><button type="button" class="download-notice-close sc-action sc-action--ghost sc-action--icon" aria-label="关闭下载提示" title="关闭提示" @click="closeNotice"><X :size="18" aria-hidden="true" /></button></div>
        <p>文件可能暂不可用，请稍后重试。</p>
        <div class="download-notice-actions"><button class="retry-download sc-action sc-action--small" type="button" :disabled="busy" :aria-busy="busy" @click="download"><span class="download-label">重新下载</span><LoaderCircle v-if="busy" class="download-spinner" :size="14" aria-hidden="true" /></button></div>
      </div>
    </el-popover>
    <span v-if="!downloadUrl && !previewUrl">暂无可用文件</span>
    <el-dialog v-model="show" class="artifact-preview-dialog" :title="artifact.name" :show-close="false" width="min(900px, 92vw)" append-to-body destroy-on-close>
      <template #header="{ titleId }">
        <AppDialogHeader :title="artifact.name" :title-id="titleId" close-label="关闭文件预览" @close="show = false" />
      </template>
      <ArtifactPreview v-if="show" hide-caption :artifact="artifact" :source-type="sourceType" />
    </el-dialog>
  </div>
</template>

<style scoped>
.artifact-actions { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; }
span { color: var(--scnet-text-muted); }
.download-failure { padding:4px; font-family:var(--scnet-font-sans); }
.download-failure-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--scnet-text); }
.download-failure-heading strong { font-size:14px; font-weight:600; }
.download-failure-heading .download-notice-close { flex:none; width:32px; min-height:32px; padding:0; border-radius:50%; color:#64748b; }
.download-notice-close:enabled:hover { background:#e9eef5; color:#25364b; }
.download-notice-close svg { transition:transform 180ms ease; }
.download-notice-close:hover svg { transform:rotate(90deg); }
.download-failure p { margin:8px 0 16px; font-size:13px; line-height:1.6; color:var(--scnet-text-secondary); }
.download-notice-actions { display:flex; gap:8px; }
.download-trigger, .retry-download { position:relative; }
.download-trigger:enabled:hover, .retry-download:enabled:hover { transform:none; }
.download-label { color:inherit; }
[aria-busy='true'] > .download-label { visibility:hidden; }
.download-spinner { position:absolute; inset:0; margin:auto; animation:download-spin 900ms linear infinite; }
@keyframes download-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  button, .download-notice-close svg { transition:none; }
  button:enabled:hover, .download-notice-close:hover svg { transform:none; }
  .download-spinner { animation:none; }
}
</style>

<style>
.artifact-download-popover.artifact-notice-enter-active { transition:opacity 200ms ease; }
.artifact-download-popover.artifact-notice-leave-active { transition:opacity 140ms ease; pointer-events:none; }
.artifact-notice-enter-active .download-failure, .artifact-notice-leave-active .download-failure { transition:transform 200ms cubic-bezier(.22,1,.36,1); transform-origin:top right; }
.artifact-notice-enter-from, .artifact-notice-leave-to { opacity:0; }
.artifact-notice-enter-from .download-failure, .artifact-notice-leave-to .download-failure { transform:translateY(-5px) scale(.98); }
@media (prefers-reduced-motion: reduce) {
  .artifact-download-popover.artifact-notice-enter-active, .artifact-download-popover.artifact-notice-leave-active,
  .artifact-notice-enter-active .download-failure, .artifact-notice-leave-active .download-failure { transition:none; }
  .artifact-notice-enter-from .download-failure, .artifact-notice-leave-to .download-failure { transform:none; }
}
</style>
