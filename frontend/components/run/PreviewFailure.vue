<script setup lang="ts">
defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="preview-failure" role="alert">
    <div class="failure-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13l6 5m0-5-6 5"/></svg></div>
    <strong>暂时无法预览此文件</strong>
    <p>文件可能暂不可用，请重试或下载后查看。</p>
    <button type="button" @click="$emit('retry')">重新加载</button>
  </div>
</template>
<style scoped>
.preview-failure { min-height:240px; box-sizing:border-box; padding:30px 20px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background:#f8fafc; border:1px solid #e4eaf2; border-radius:8px; color:var(--scnet-text); font-family:var(--scnet-font-sans); }
.failure-icon { width:48px; height:48px; display:grid; place-items:center; border-radius:12px; background:#eaf0f8; color:#71849e; margin-bottom:16px; }.failure-icon svg { width:25px; height:25px; }
strong { font-size:16px; font-weight:600; }p { margin:9px 0 20px; font-size:13px; line-height:1.7; color:var(--scnet-text-secondary); }
button { min-height:38px; padding:8px 18px; border:1px solid #bcd0ed; border-radius:6px; background:white; color:var(--scnet-primary); font:inherit; font-size:13px; font-weight:600; cursor:pointer; }button:hover { background:#edf4ff; }button:focus-visible { outline:2px solid var(--scnet-primary); outline-offset:2px; }
</style>
