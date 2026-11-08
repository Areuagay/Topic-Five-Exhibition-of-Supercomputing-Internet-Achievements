<script setup lang="ts">
defineProps<{ pending?: boolean; error?: unknown; empty?: boolean; label: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="pending || error || empty" class="resource-state" :role="error ? 'alert' : 'status'" :aria-busy="pending">
    <span v-if="pending">正在加载{{ label }}…</span>
    <template v-else-if="error"><span>{{ label }}加载失败</span><button class="sc-action" type="button" @click="$emit('retry')">重试</button></template>
    <span v-else>暂无{{ label }}</span>
    <slot v-if="!pending" name="actions" />
  </div>
  <slot v-else />
</template>

<style scoped>
.resource-state { min-height: 100px; padding: 24px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; color: var(--scnet-text-muted); font-size: 14px; }
</style>
