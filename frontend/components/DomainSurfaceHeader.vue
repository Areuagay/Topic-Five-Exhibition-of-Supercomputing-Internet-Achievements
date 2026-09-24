<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <header class="domain-surface-header">
    <div class="domain-surface-heading">
      <NuxtLink to="/" class="domain-home-link" aria-label="返回主页">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5v-9.7Z" />
        </svg>
        <span>主页</span>
      </NuxtLink>

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

.domain-surface-heading,
.domain-home-link {
  display: flex;
  align-items: center;
}

.domain-surface-heading {
  min-width: 0;
  gap: 20px;
}

.domain-home-link {
  min-height: 44px;
  flex: 0 0 auto;
  gap: 7px;
  padding: 0 10px;
  border-radius: 5px;
  color: #586579;
  font-size: 13px;
  font-weight: 500;
  touch-action: manipulation;
  transition:
    background-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
    color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.domain-home-link svg {
  width: 17px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.domain-home-link:hover {
  background: var(--scnet-primary-soft);
  color: var(--scnet-primary);
}

.domain-home-link:focus-visible {
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: 2px;
}

.domain-heading-divider {
  width: 1px;
  height: 38px;
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

  .domain-home-link span,
  .domain-heading-divider {
    display: none;
  }

  .domain-surface-title h1 {
    font-size: 20px;
  }

}

@media (prefers-reduced-motion: reduce) {
  .domain-home-link {
    transition-duration: 0.01ms;
  }
}
</style>
