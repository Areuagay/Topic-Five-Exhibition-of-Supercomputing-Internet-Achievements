<script setup lang="ts">
import { computed } from 'vue'
import RunDetailContent from '~/components/run/RunDetailContent.vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'

definePageMeta({ key: route => route.fullPath })
const route = useRoute()
const domain = String(route.params.domain)
const runId = String(route.params.runId)

const { getIndex, getScenarios } = useApi()
const appStore = useAppStore()

const { data: indexData } = await useAsyncData('index', () => getIndex(), { default: () => null })
if (indexData.value) {
  appStore.setIndex(indexData.value.domains, indexData.value.clusters)
}

const { data: scenarios } = await useAsyncData(`scenarios-${domain}`, () => getScenarios(domain), { default: () => [] })
const domainInfo = computed(() => appStore.domains.find((item) => item.domain === domain))
</script>

<template>
  <section class="run-detail-page">
    <section class="run-detail-surface">
        <DomainSurfaceHeader
          :title="domainInfo?.name ?? domain"
        />

      <ScenarioSelector
        :scenarios="scenarios ?? []"
        model-value=""
        :domain="domain"
        runs-active
      />

      <RunDetailContent :domain="domain" :run-id="runId" />
    </section>
  </section>
</template>

<style scoped>
/* 运行详情页壳层：仅承载标题与场景导航，记录正文由 RunDetailContent 复用渲染。 */
.run-detail-page {
  width: 100%;
  min-width: 0;
}

.run-detail-surface {
  overflow: hidden;
  border: 1px solid var(--scnet-divider);
  border-radius: 12px;
  background: #f5f7fa;
  box-shadow: 0 2px 8px rgba(31, 45, 61, 0.045);
}
</style>
