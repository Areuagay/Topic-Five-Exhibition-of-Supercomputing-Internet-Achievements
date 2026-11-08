<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <header class="domain-surface-header">
    <div class="domain-surface-heading">
      <AppHomeLink />

      <span class="domain-heading-divider" aria-hidden="true" />

      <div class="domain-surface-title">
        <h1>{{ title }}</h1>
      </div>
    </div>
  </header>
</template>

<style scoped>
.domain-surface-header {
  min-height: 76px;
  display: flex;
  align-items: center;
  padding: 14px clamp(22px, 2.1vw, 36px);
  border-bottom: 1px solid var(--scnet-divider);
  background: #fff;
}

.domain-surface-heading {
  display: flex;
  align-items: center;
}

.domain-surface-heading {
  min-width: 0;
  gap: 20px;
}





.domain-heading-divider {
  width: 1px;
  height: 28px;
  flex: 0 0 auto;
  background: var(--scnet-divider);
}

.domain-surface-title {
  min-width: 0;
}

.domain-surface-title h1 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.35;
  text-wrap: balance;
}

@media (max-width: 760px) {
  .domain-surface-header {
    min-height: 84px;
    padding: 16px;
  }

  .domain-surface-heading {
    gap: 10px;
  }

  .domain-heading-divider {
    display: none;
  }

  .domain-surface-title h1 {
    font-size: 20px;
  }

}


</style>
