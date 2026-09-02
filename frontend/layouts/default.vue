<script setup lang="ts">
useHead({ title: '超算互联网应用成果展' })
</script>

<template>
  <div class="embedded-shell">
    <main class="layout-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.embedded-shell { min-height: 100vh; background: var(--scnet-bg); }
.layout-content { min-height: 100vh; padding: 14px; }
@media (max-width: 768px) { .layout-content { padding: 8px; } }
</style>
