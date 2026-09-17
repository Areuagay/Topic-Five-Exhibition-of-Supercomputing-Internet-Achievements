<script setup lang="ts">
import { computed } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'
import { formatNumber } from '~/composables/useFormat'

const { getIndex, getClusters } = useApi()
const appStore = useAppStore()
const { data: indexData, pending, error, refresh } = await useAsyncData(
  'index',
  () => getIndex(),
  { default: () => null },
)
const { data: clusterData } = await useAsyncData(
  'clusters',
  () => getClusters(),
  { default: () => [] },
)

if (indexData.value) appStore.setIndex(indexData.value.domains, indexData.value.clusters)

const domains = computed(() =>
  (indexData.value?.domains ?? []).filter((domain) => domain.domain !== 'multicenter'),
)
const totalScenarios = computed(() =>
  domains.value.reduce((sum, domain) => sum + (domain.scenario_count ?? 0), 0),
)
const multicenter = computed(() =>
  (indexData.value?.domains ?? []).find((domain) => domain.domain === 'multicenter'),
)
const clusters = computed(() => clusterData.value ?? [])
const onlineClusterCount = computed(() =>
  clusters.value.filter((cluster) => cluster.status === 'online').length,
)
const degradedClusterCount = computed(() =>
  clusters.value.filter((cluster) => cluster.status === 'degraded').length,
)
const offlineClusterCount = computed(() =>
  clusters.value.filter((cluster) => cluster.status === 'offline').length,
)

const DOMAIN_CODES: Record<string, string> = {
  geodynamics: 'GD',
  llm: 'AI',
  automotive: 'CAE',
  uav: 'UAV',
  drug: 'BIO',
  dft: 'DFT',
}

function domainCode(domain: string): string {
  return DOMAIN_CODES[domain] ?? 'APP'
}

function clusterName(id: string): string {
  return indexData.value?.clusters.find((cluster) => cluster.id === id)?.name ?? id
}

function statusLabel(status: string): string {
  return status === 'degraded' ? '降级' : status === 'offline' ? '离线' : '在线'
}

function statusClass(status: string): string {
  return status === 'degraded'
    ? 'status-degraded'
    : status === 'offline'
      ? 'status-offline'
      : 'status-online'
}

function utilization(value: number): string {
  return `${Math.min(100, Math.max(0, Number(value) || 0))}%`
}
</script>

<template>
  <section class="application-panel">
    <header class="application-titlebar">
      <h1>应用示范</h1>
    </header>

    <div v-if="error" class="application-error">
      <el-result icon="error" title="应用数据加载失败" sub-title="请刷新重试或检查服务连接">
        <template #extra>
          <el-button type="primary" @click="refresh()">重新加载</el-button>
        </template>
      </el-result>
    </div>

    <div v-else v-loading="pending" class="application-content">
      <div class="application-overview">
        <div class="application-overview-main">
          <div class="application-overview-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <path d="M17.5 3.1 21 6.5 17.5 10 14 6.5 17.5 3.1Z" />
            </svg>
          </div>
          <div>
            <h2>应用成果总览</h2>
            <p>{{ domains.length }} 个领域，{{ totalScenarios }} 个应用场景</p>
          </div>
        </div>
      </div>

      <div v-if="domains.length" class="application-card-grid">
        <NuxtLink
          v-for="domain in domains"
          :key="domain.domain"
          class="application-card"
          :to="`/domains/${domain.domain}/scenarios`"
          :aria-label="`进入${domain.name}应用成果`"
        >
          <div class="application-card-head">
            <span class="application-code">{{ domainCode(domain.domain) }}</span>
            <div class="application-card-title">
              <h3>{{ domain.name }}</h3>
            </div>
          </div>
          <p class="application-description">{{ domain.description }}</p>
          <div class="application-meta">
            <span><strong>{{ domain.scenario_count }}</strong> 个应用场景</span>
            <span><strong>{{ domain.run_count }}</strong> 条运行记录</span>
          </div>
          <div class="application-clusters">
            <span v-for="cluster in domain.cluster_hint" :key="cluster">
              {{ clusterName(cluster) }}
            </span>
          </div>
          <footer class="application-card-entry">
            <span>进入应用成果</span>
            <span aria-hidden="true">→</span>
          </footer>
        </NuxtLink>
      </div>
      <el-empty v-else description="暂无应用成果" :image-size="72" />

      <section v-if="multicenter || clusters.length" class="platform-section">
        <div class="platform-section-heading">
          <span class="platform-section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="6" cy="7" r="2.25" />
              <circle cx="18" cy="7" r="2.25" />
              <circle cx="12" cy="18" r="2.25" />
              <path d="m8 8.2 3 7.5M16 8.2l-3 7.5M8.3 7h7.4" />
            </svg>
          </span>
          <h2>平台能力与资源状态</h2>
        </div>

        <div class="platform-console">
          <NuxtLink
            v-if="multicenter"
            to="/multicenter"
            class="multicenter-card"
            aria-label="进入函数多中心联调"
          >
            <div class="multicenter-card-head">
              <span class="multicenter-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M9.5 14.5 14.5 9.5" />
                  <path d="m7.8 17.2-1.4 1.4a3.5 3.5 0 0 1-5-5l3.2-3.2a3.5 3.5 0 0 1 5 0" />
                  <path d="m16.2 6.8 1.4-1.4a3.5 3.5 0 0 1 5 5l-3.2 3.2a3.5 3.5 0 0 1-5 0" />
                </svg>
              </span>
              <div>
                <h3>{{ multicenter.name }}</h3>
              </div>
              <span class="status-badge status-online">可用</span>
            </div>

            <div class="multicenter-meta">
              <span><strong>{{ multicenter.run_count }}</strong> 条运行记录</span>
              <span><strong>{{ clusters.length }}</strong> 个算力中心</span>
            </div>
            <div class="multicenter-clusters">
              <span v-for="cluster in multicenter.cluster_hint" :key="cluster">
                {{ clusterName(cluster) }}
              </span>
            </div>
            <footer class="multicenter-link">
              进入联调视图
              <span aria-hidden="true">→</span>
            </footer>
          </NuxtLink>

          <section class="cluster-board">
            <header class="cluster-board-head">
              <div>
                <h3>算力中心资源状态</h3>
              </div>
              <div class="cluster-status-summary" aria-label="算力中心状态汇总">
                <span><i class="status-dot status-dot-online" />{{ onlineClusterCount }} 在线</span>
                <span v-if="degradedClusterCount">
                  <i class="status-dot status-dot-degraded" />{{ degradedClusterCount }} 降级
                </span>
                <span v-if="offlineClusterCount">
                  <i class="status-dot status-dot-offline" />{{ offlineClusterCount }} 离线
                </span>
              </div>
            </header>

            <div class="cluster-status-grid">
              <article
                v-for="cluster in clusters"
                :key="cluster.id"
                class="cluster-status-card"
                :class="{ 'is-degraded': cluster.status === 'degraded' }"
              >
                <header class="cluster-status-head">
                  <div>
                    <h3>{{ cluster.name }}</h3>
                    <p>{{ cluster.location }} · {{ cluster.architecture }} · {{ cluster.scheduler }}</p>
                  </div>
                  <span
                    class="status-badge"
                    :class="statusClass(cluster.status)"
                  >
                    {{ statusLabel(cluster.status) }}
                  </span>
                </header>

                <div class="utilization-row">
                  <div class="utilization-label">
                    <span>CPU 利用率</span>
                    <strong>{{ utilization(cluster.cpu_utilization) }}</strong>
                  </div>
                  <div class="utilization-track">
                    <span :style="{ width: utilization(cluster.cpu_utilization) }" />
                  </div>
                </div>
                <div class="utilization-row">
                  <div class="utilization-label">
                    <span>内存利用率</span>
                    <strong>{{ utilization(cluster.memory_utilization) }}</strong>
                  </div>
                  <div class="utilization-track">
                    <span :style="{ width: utilization(cluster.memory_utilization) }" />
                  </div>
                </div>

                <footer class="cluster-numbers">
                  <span>节点 <strong>{{ formatNumber(cluster.total_nodes) }}</strong></span>
                  <span>核数 <strong>{{ formatNumber(cluster.total_cores) }}</strong></span>
                  <span>任务 <strong>{{ formatNumber(cluster.active_jobs) }}</strong></span>
                  <span>排队 <strong>{{ formatNumber(cluster.queue_length) }}</strong></span>
                </footer>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.application-panel {
  min-height: calc(100vh - 28px);
  overflow: hidden;
  background: var(--scnet-panel);
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  box-shadow: 0 1px 5px rgba(31, 45, 61, 0.06);
}
.application-titlebar {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 32px;
  border-bottom: 1px solid var(--scnet-divider);
}
.application-titlebar h1 {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  color: var(--scnet-text);
  font-size: 22px;
  font-weight: 600;
}
.application-titlebar h1::before {
  content: '';
  width: 4px;
  height: 26px;
  border-radius: 2px;
  background: var(--scnet-primary);
}
.application-content {
  min-height: calc(100vh - 120px);
  padding: 28px 32px 38px;
}
.application-overview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.application-overview-main {
  display: flex;
  align-items: center;
  gap: 12px;
}
.application-overview-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: var(--scnet-primary-soft);
  color: var(--scnet-primary);
}
.application-overview-icon svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.application-overview h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 22px;
}
.application-overview-main p {
  margin: 2px 0 0;
  color: var(--scnet-text-muted);
  font-size: 12px;
  line-height: 20px;
}
.application-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(250px, 1fr));
  gap: 20px;
}
.application-card {
  min-height: 312px;
  display: flex;
  flex-direction: column;
  padding: 26px 26px 0;
  border: 1px solid var(--scnet-border);
  border-radius: 10px;
  background: #fff;
  color: inherit;
  text-decoration: none;
  touch-action: manipulation;
  transition:
    background-color 280ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 280ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.application-card:hover,
.application-card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--scnet-primary);
  background: #fff;
  box-shadow: 0 12px 28px rgba(11, 91, 211, 0.12);
}
.application-card:focus-visible {
  outline: 2px solid var(--scnet-primary);
  outline-offset: 3px;
}
.application-card-head { display: flex; align-items: center; gap: 13px; }
.application-code {
  min-width: 44px;
  height: 44px;
  display: inline-grid;
  place-items: center;
  padding: 0 7px;
  border-radius: 8px;
  background: var(--scnet-primary-soft);
  color: var(--scnet-primary);
  font-size: 13px;
  font-weight: 700;
  transition:
    background-color 280ms cubic-bezier(0.22, 1, 0.36, 1),
    color 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.application-card:hover .application-code,
.application-card:focus-visible .application-code {
  background: var(--scnet-primary);
  color: #fff;
}
.application-card-title { min-width: 0; }
.application-card-title h3 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 19px;
  font-weight: 600;
  line-height: 1.45;
}
.application-description {
  min-height: 3.5em;
  margin: 18px 0 0;
  color: var(--scnet-text-secondary);
  font-size: 14px;
  line-height: 1.75;
}
.application-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.application-meta span,
.application-clusters span {
  padding: 3px 8px;
  border-radius: 3px;
  background: #f4f6f8;
  color: var(--scnet-text-secondary);
  font-size: 11px;
}
.application-clusters { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 20px; }
.application-meta { gap: 16px; }
.application-meta span { padding: 0; background: transparent; font-size: 13px; }
.application-meta strong { color: var(--scnet-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.application-clusters span { border: 1px solid #edf0f4; background: #f8fafc; font-size: 12px; }
.application-card-entry {
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  border-top: 1px solid var(--scnet-divider);
  color: var(--scnet-primary);
  font-size: 14px;
  font-weight: 600;
}
.application-card-entry span:last-child { font-size: 18px; font-weight: 400; }
.platform-section {
  margin-top: 34px;
  padding-top: 28px;
  border-top: 1px solid var(--scnet-divider);
}
.platform-section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.platform-section-icon,
.multicenter-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  background: var(--scnet-primary-soft);
  color: var(--scnet-primary);
}
.platform-section-icon {
  width: 36px;
  height: 36px;
  border-radius: 7px;
}
.platform-section-icon svg,
.multicenter-icon svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.platform-section-heading h2 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 18px;
  font-weight: 600;
}
.platform-console {
  display: grid;
  grid-template-columns: minmax(280px, 0.88fr) minmax(0, 2.12fr);
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--scnet-border);
  border-radius: 10px;
  background: #fff;
}
.multicenter-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 22px;
  border-right: 1px solid #e6edf7;
  background: #f7faff;
  box-shadow: inset -16px 0 22px -26px rgba(11, 91, 211, 0.28);
  color: inherit;
  text-decoration: none;
  touch-action: manipulation;
  transition:
    background-color 280ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 280ms ease;
}
.multicenter-card::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(110deg, #e6f0ff, #f2f7ff);
  transform: scaleX(0);
  transform-origin: left;
  content: '';
  pointer-events: none;
}
.multicenter-card:is(:hover, :focus-visible)::before { transform: scaleX(1); }
@media (prefers-reduced-motion: no-preference) {
  .multicenter-card::before { transition: transform 420ms var(--scnet-hover-easing); }
  .multicenter-card .multicenter-link { transition: translate 300ms var(--scnet-hover-easing); }
  .multicenter-card:is(:hover, :focus-visible) .multicenter-link { translate: 3px 0; }
  .multicenter-card:active .multicenter-link { translate: 1px 0; }
}
.multicenter-card:hover,
.multicenter-card:focus-visible {
  background: #f2f7ff;
  box-shadow: inset 3px 0 0 var(--scnet-primary);
}
.multicenter-card:focus-visible {
  outline: 2px solid var(--scnet-primary);
  outline-offset: 3px;
}
.multicenter-card-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}
.multicenter-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
}
.multicenter-card h3,
.cluster-status-card h3 {
  margin: 0;
  color: var(--scnet-text);
  font-weight: 600;
}
.multicenter-card h3 { font-size: 18px; }
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  font-size: 11px;
  line-height: 1;
  transition:
    background-color 260ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 260ms cubic-bezier(0.22, 1, 0.36, 1),
    color 260ms cubic-bezier(0.22, 1, 0.36, 1);
}
.status-online {
  border-color: #d7edca;
  background: #f0f9eb;
  color: #55a630;
}
.status-degraded {
  border-color: #f5e4c8;
  background: #fdf6ec;
  color: #d98c28;
}
.status-offline {
  border-color: #f3d1d1;
  background: #fdf0f0;
  color: #d94f4f;
}
.multicenter-meta {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  color: var(--scnet-text-secondary);
  font-size: 12px;
}
.multicenter-meta strong { color: var(--scnet-text); font-size: 14px; }
.multicenter-clusters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}
.multicenter-clusters span {
  padding: 3px 7px;
  border: 1px solid var(--scnet-border);
  border-radius: 4px;
  color: var(--scnet-text-secondary);
  font-size: 11px;
}
.multicenter-link {
  min-height: 46px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid var(--scnet-divider);
  color: var(--scnet-primary);
  font-size: 14px;
  font-weight: 500;
}
.multicenter-link span { font-size: 18px; }
.cluster-board {
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.cluster-board-head {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--scnet-divider);
}
.cluster-board-head h3 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 17px;
  font-weight: 600;
}
.cluster-status-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--scnet-text-secondary);
  font-size: 11px;
}
.cluster-status-summary span { display: inline-flex; align-items: center; gap: 5px; }
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.status-dot-online { background: #67b84b; }
.status-dot-degraded { background: #e6a23c; }
.status-dot-offline { background: #d94f4f; }
.cluster-status-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--scnet-divider);
}
.cluster-status-card {
  padding: 18px 20px;
  background: #fff;
  transition: var(--scnet-hover-transition);
}
.cluster-status-card:hover { background: #f7faff; }
.cluster-status-card.is-degraded:hover {
  background: #fff9f0;
  box-shadow: inset 0 0 0 1px rgba(217, 140, 40, 0.24);
}
.cluster-status-card.is-degraded:hover .status-degraded {
  border-color: #edca91;
  background: #fbeddb;
  color: #c77918;
}
.cluster-status-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.cluster-status-card h3 { font-size: 14px; line-height: 1.45; }
.cluster-status-head p {
  overflow: hidden;
  margin: 3px 0 0;
  color: var(--scnet-text-muted);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.utilization-row { margin-top: 13px; }
.utilization-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
  color: var(--scnet-text-muted);
  font-size: 11px;
}
.utilization-label strong { color: var(--scnet-text-secondary); font-size: 12px; font-weight: 500; }
.utilization-track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf0f4;
}
.utilization-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--scnet-primary);
}
.cluster-numbers {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
  color: var(--scnet-text-muted);
  font-size: 11px;
}
.cluster-numbers strong { color: var(--scnet-text-secondary); font-weight: 500; }
.application-error { min-height: 520px; display: grid; place-items: center; }

@media (prefers-reduced-motion: reduce) {
  .application-card,
  .application-code,
  .multicenter-card,
  .cluster-status-card {
    transition-duration: 0.01ms;
  }

  .application-card:hover,
  .application-card:focus-visible {
    transform: none;
  }
}

@media (max-width: 1120px) {
  .application-content { padding: 24px; }
  .application-card-grid { grid-template-columns: repeat(2, minmax(250px, 1fr)); }
  .platform-console { grid-template-columns: 1fr; }
  .multicenter-card { border-right: 0; border-bottom: 1px solid var(--scnet-divider); }
}
@media (max-width: 700px) {
  .application-titlebar { min-height: auto; padding: 18px; }
  .application-content { padding: 18px; }
  .application-card-grid { grid-template-columns: 1fr; }
  .cluster-status-grid { grid-template-columns: 1fr; }
}
</style>
