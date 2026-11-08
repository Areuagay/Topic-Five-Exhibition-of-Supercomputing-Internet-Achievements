<script setup lang="ts">
import { House } from '@lucide/vue'
</script>

<template>
  <NuxtLink to="/" class="app-home-link sc-action" aria-label="返回主页">
    <House aria-hidden="true" />
    <span>主页</span>
  </NuxtLink>
</template>

<style scoped>
.app-home-link.sc-action { flex:0 0 auto; min-width:88px; padding-inline:13px; }
.app-home-link.sc-action:hover svg { transform:translateY(-2px); }
.app-home-link.sc-action:active svg { transform:translateY(0); }
@media (max-width:760px) {
  .app-home-link.sc-action { min-width:80px; padding-inline:11px; }
}
@media (prefers-reduced-motion:reduce) {
  .app-home-link.sc-action:hover svg, .app-home-link.sc-action:active svg { transform:none; }
}
</style>
