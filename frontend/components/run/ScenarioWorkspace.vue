<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import type { DomainData } from '~/types/domain-data'
import type { Artifact } from '~/types'
import { getScenarioWorkspace } from '~/config/scenario-workspaces'
import ResourceState from './ResourceState.vue'
const props = defineProps<{ scenarioId: string; domain: string; data?: DomainData; pending?: boolean; error?: unknown; sourceType?: string; artifacts?: Artifact[]; artifactsPending?: boolean; artifactsError?: unknown }>()
defineEmits<{ retry: []; retryArtifacts: [] }>()
const components: Record<string, Component> = {
  'band-dos': defineAsyncComponent(() => import('~/components/domain-workspaces/dft/BandDOSWorkspace.vue')),
  'high-throughput-screening': defineAsyncComponent(() => import('~/components/domain-workspaces/dft/HighThroughputWorkspace.vue')),
  'virtual-screening': defineAsyncComponent(() => import('~/components/domain-workspaces/drug/VirtualScreeningWorkspace.vue')),
  'admet-prediction': defineAsyncComponent(() => import('~/components/domain-workspaces/drug/ADMETWorkspace.vue')),
  'swarm-coordination': defineAsyncComponent(() => import('~/components/domain-workspaces/uav/SwarmCoordinationWorkspace.vue')),
  'path-planning': defineAsyncComponent(() => import('~/components/domain-workspaces/uav/PathPlanningWorkspace.vue')),
  'wave-propagation': defineAsyncComponent(() => import('~/components/domain-workspaces/geodynamics/WavePropagationWorkspace.vue')),
  'tectonic-evolution': defineAsyncComponent(() => import('~/components/domain-workspaces/geodynamics/TectonicEvolutionWorkspace.vue')),
  'llm-pretraining': defineAsyncComponent(() => import('~/components/domain-workspaces/llm/LLMPretrainingWorkspace.vue')),
  'pinn-acceleration': defineAsyncComponent(() => import('~/components/domain-workspaces/llm/PINNWorkspace.vue')),
  'vehicle-crash': defineAsyncComponent(() => import('~/components/domain-workspaces/automotive/VehicleCrashWorkspace.vue')),
  'fatigue-life': defineAsyncComponent(() => import('~/components/domain-workspaces/automotive/FatigueLifeWorkspace.vue')),
}
const entry = computed(() => getScenarioWorkspace(props.scenarioId))
const workspace = computed(() => Object.hasOwn(components, props.scenarioId) ? components[props.scenarioId] : undefined)
const mismatched = computed(() => entry.value?.domain !== props.domain || (props.data?.scenario_id && props.data.scenario_id !== props.scenarioId))
</script>

<template>
  <section class="scenario-workspace" aria-labelledby="scenario-workspace-title">
    <header><h2 id="scenario-workspace-title">{{ entry?.title || '场景' }}专业工作台</h2></header>
    <div v-if="!entry" class="workspace-message" role="status">暂不支持此场景（Unsupported）</div>
    <div v-else-if="!entry.available" class="workspace-message" role="status">专业视图待完善</div>
    <ResourceState v-else :pending="pending" :error="error" :empty="!data" label="专业数据" @retry="$emit('retry')">
      <div v-if="mismatched" class="workspace-message" role="alert">专业数据与当前场景不匹配，请重试或检查任务数据。</div>
      <component :is="workspace" v-else-if="workspace && data" :data="data" v-bind="entry?.domain === 'automotive' ? { artifacts, artifactsPending, artifactsError } : {}" @retry-artifacts="$emit('retryArtifacts')" />
    </ResourceState>
  </section>
</template>

<style scoped>
.scenario-workspace { min-width: 0; overflow: hidden; border: 1px solid var(--scnet-divider); border-radius: 10px; background: #fff; box-shadow: 0 2px 8px rgb(31 45 61 / 3.5%); }
header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 22px 32px; border-bottom: 1px solid var(--scnet-divider); }
h2 { margin: 0; font-size: 19px; font-weight: 600; color: var(--scnet-text); }
header span { font-size: 12px; color: var(--scnet-text-muted); }
.workspace-message { padding: 28px 32px; font-size: 14px; color: var(--scnet-text-muted); }
@media (max-width: 700px) { header { padding: 18px; } }
</style>
