<script setup lang="ts">
import type { MetricKV } from '~/types'
import { formatNumber } from '~/composables/useFormat'
import { unitText } from '~/utils/workspace'

defineProps<{ metrics: MetricKV[] }>()
</script>

<template>
  <div class="stat-grid">
    <div v-for="(m, i) in metrics" :key="i" class="stat-card">
      <div class="stat-label">{{ m.label }}</div>
      <div class="stat-value">
        {{ formatNumber(m.value, 2) }}<span v-if="unitText(m.unit)" class="stat-unit">{{ unitText(m.unit) }}</span>
      </div>
    </div>
  </div>
</template>
