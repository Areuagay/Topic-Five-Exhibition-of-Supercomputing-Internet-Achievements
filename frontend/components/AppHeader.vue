<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '~/stores/app'
import { useApi } from '~/composables/useApi'

const route = useRoute()
const appStore = useAppStore()
const { getIndex } = useApi()

// 缓存首页索引（SSR 与客户端共享 key，避免重复请求）
const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) {
  appStore.setIndex(indexData.value.domains, indexData.value.clusters)
}

const DOMAIN_ICONS: Record<string, string> = {
  geo: '🌍', llm: '🤖', auto: '🚗', uav: '🚁', drug: '💊', dft: '⚛️', multi: '🔗',
}

/** 不含多中心的学科域导航项 */
const domainItems = computed(() =>
  appStore.domains.filter((d) => d.domain !== 'multicenter'),
)

const activeMenu = computed(() => {
  if (route.path === '/') return '/'
  if (route.path.startsWith('/multicenter')) return '/multicenter'
  const m = route.path.match(/^\/domains\/([^/]+)/)
  return m ? `/domains/${m[1]}/scenarios` : '/'
})
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <NuxtLink to="/" class="brand">
        <span class="brand-logo">超</span>
        <span class="brand-text">超算互联网应用成果展</span>
      </NuxtLink>

      <el-menu :default-active="activeMenu" mode="horizontal" router :ellipsis="false" class="nav-menu">
        <el-menu-item index="/">总览</el-menu-item>
        <el-menu-item
          v-for="d in domainItems"
          :key="d.domain"
          :index="`/domains/${d.domain}/scenarios`"
        >
          <span class="nav-icon">{{ DOMAIN_ICONS[d.icon] ?? '📦' }}</span>
          {{ d.short_name }}
        </el-menu-item>
        <el-menu-item index="/multicenter">
          <span class="nav-icon">{{ DOMAIN_ICONS.multi }}</span>
          多中心联调
        </el-menu-item>
      </el-menu>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  background: #0f172a;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.25);
}

.header-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  text-decoration: none;
}

.brand-logo {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1a6dff, #38bdf8);
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-text {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
}

.nav-menu {
  flex: 1;
  background: transparent;
  border-bottom: none;
  min-width: 0;
}

.nav-menu :deep(.el-menu-item) {
  color: #cbd5e1;
}

.nav-menu :deep(.el-menu-item:hover) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.nav-menu :deep(.el-menu-item.is-active) {
  color: #fff;
  background: rgba(26, 109, 255, 0.25);
  border-bottom-color: #1a6dff;
}

.nav-icon {
  margin-right: 4px;
  font-size: 14px;
}
</style>
