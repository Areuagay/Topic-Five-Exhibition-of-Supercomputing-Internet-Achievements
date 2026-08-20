<script setup lang="ts">
import { statusTagType, statusText } from '~/composables/useFormat'

defineProps<{ status?: string | null }>()
</script>

<template>
  <el-tag :type="statusTagType(status)" size="small" effect="light">
    {{ statusText(status) }}
  </el-tag>
</template>
