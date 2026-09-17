<script setup lang="ts">
import { statusTagType, statusText } from '~/composables/useFormat'

defineProps<{ status?: string | null }>()
</script>

<template>
  <el-tag :type="statusTagType(status)" :class="{ 'is-queued': status === 'queued' || status === 'pending' }" size="small" effect="light">
    {{ statusText(status) }}
  </el-tag>
</template>

<style scoped>
.el-tag.is-queued { color: #92632e; background-color: #fff1dc; border-color: #ecd4af; }
</style>
