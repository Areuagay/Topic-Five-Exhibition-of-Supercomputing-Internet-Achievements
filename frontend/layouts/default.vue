<script setup lang="ts">
useHead({ title: '超算互联网应用成果展' })
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="page-main">
      <slot />
    </main>
    <footer class="app-footer">
      <span>课题五 · 超算互联网应用成果展</span>
      <span class="muted">当前数据为模拟数据（simulated），接入真实后端后自动切换</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 24px;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 13px;
}
</style>
