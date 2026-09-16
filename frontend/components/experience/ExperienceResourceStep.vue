<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, statusText } from '~/composables/useFormat'
import type { MultiCluster } from '~/types'

const props = defineProps<{
  clusters: MultiCluster[]
  supportedClusters: string[]
}>()

const supportedSet = computed(() => new Set(props.supportedClusters))

/** 支持本场景的算力中心排前，便于引导选择 */
const ordered = computed(() =>
  [...props.clusters].sort(
    (a, b) => Number(supportedSet.value.has(b.id)) - Number(supportedSet.value.has(a.id)),
  ),
)

function utilization(value: number): string {
  return `${formatNumber(value, 0)}%`
}
</script>

<template>
  <div class="exp-resource">
    <p class="exp-hint">
      该步骤将跳转主前端的「算力中心 / 资源调度」页面完成集群与资源池选择。
      此处预置展示调度前的资源视图，数据来自 <code>GET /api/v1/multicenter/clusters</code>。
    </p>

    <div v-if="ordered.length" class="exp-cluster-grid">
      <article
        v-for="cluster in ordered"
        :key="cluster.id"
        class="exp-cluster-card"
        :class="{ 'is-supported': supportedSet.has(cluster.id) }"
      >
        <header class="exp-cluster-head">
          <div>
            <h3>{{ cluster.name }}</h3>
            <p class="exp-cluster-location">{{ cluster.location }} · {{ cluster.architecture }}</p>
          </div>
          <el-tag
            :type="supportedSet.has(cluster.id) ? 'success' : 'info'"
            effect="light"
            size="small"
          >
            {{ supportedSet.has(cluster.id) ? '支持本场景' : statusText(cluster.status) }}
          </el-tag>
        </header>

        <dl class="exp-cluster-metrics">
          <div>
            <dt>节点总数</dt>
            <dd>{{ formatNumber(cluster.total_nodes) }}</dd>
          </div>
          <div>
            <dt>CPU 核数</dt>
            <dd>{{ formatNumber(cluster.total_cores) }}</dd>
          </div>
          <div>
            <dt>GPU 卡数</dt>
            <dd>{{ formatNumber(cluster.gpu_count) }}</dd>
          </div>
          <div>
            <dt>排队任务</dt>
            <dd>{{ formatNumber(cluster.queue_length) }}</dd>
          </div>
        </dl>

        <div class="exp-cluster-usage">
          <div class="exp-usage-row">
            <span>CPU 利用率</span>
            <el-progress :percentage="Number(cluster.cpu_utilization) || 0" :stroke-width="8" :show-text="false" />
            <em>{{ utilization(cluster.cpu_utilization) }}</em>
          </div>
          <div class="exp-usage-row">
            <span>内存利用率</span>
            <el-progress :percentage="Number(cluster.memory_utilization) || 0" :stroke-width="8" :show-text="false" color="#39a96b" />
            <em>{{ utilization(cluster.memory_utilization) }}</em>
          </div>
        </div>

        <footer class="exp-cluster-foot">
          <span>调度器：{{ cluster.scheduler }}</span>
          <span>活跃任务：{{ formatNumber(cluster.active_jobs) }}</span>
        </footer>
      </article>
    </div>

    <el-empty v-else description="暂无算力中心数据" :image-size="60" />
  </div>
</template>

<style scoped>
.exp-resource {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.exp-hint {
  margin: 0;
  padding: 14px 18px;
  border: 1px solid var(--scnet-divider);
  border-left: 3px solid var(--scnet-primary);
  border-radius: 8px;
  background: var(--scnet-primary-soft);
  color: var(--scnet-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.exp-hint code {
  font-family: var(--scnet-font-mono);
  font-size: 12px;
  color: var(--scnet-text);
}

.exp-cluster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.exp-cluster-card {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.exp-cluster-card.is-supported {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 10px rgba(11, 91, 211, 0.08);
}

.exp-cluster-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.exp-cluster-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--scnet-text);
}

.exp-cluster-location {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--scnet-text-muted);
}

.exp-cluster-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 0;
  padding: 12px 0;
  border-top: 1px solid var(--scnet-divider);
  border-bottom: 1px solid var(--scnet-divider);
}

.exp-cluster-metrics dt {
  font-size: 12px;
  color: var(--scnet-text-muted);
}

.exp-cluster-metrics dd {
  margin: 2px 0 0;
  font-family: var(--scnet-font-mono);
  font-size: 16px;
  font-weight: 600;
  color: var(--scnet-text);
}

.exp-cluster-usage {
  display: grid;
  gap: 8px;
}

.exp-usage-row {
  display: grid;
  grid-template-columns: 72px 1fr 48px;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--scnet-text-secondary);
}

.exp-usage-row em {
  font-style: normal;
  text-align: right;
  font-family: var(--scnet-font-mono);
  color: var(--scnet-text);
}

.exp-cluster-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--scnet-text-muted);
}
</style>
