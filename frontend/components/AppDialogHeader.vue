<script setup lang="ts">
import { X } from '@lucide/vue'

withDefaults(defineProps<{ title: string; titleId: string; closeLabel?: string }>(), { closeLabel: '关闭弹窗' })
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="app-dialog-heading">
    <h2 :id="titleId">{{ title }}</h2>
    <button type="button" class="app-dialog-close sc-action sc-action--soft sc-action--icon" :aria-label="closeLabel" :title="closeLabel" @click="$emit('close')"><X aria-hidden="true" /></button>
  </div>
</template>

<style scoped>
.app-dialog-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.app-dialog-heading h2 { min-width:0; margin:0; color:var(--scnet-text); font:600 18px/1.5 var(--scnet-font-sans); overflow-wrap:anywhere; }
.app-dialog-heading .app-dialog-close { flex-shrink:0; }
.app-dialog-heading .app-dialog-close svg { width:18px; height:18px; }
</style>
