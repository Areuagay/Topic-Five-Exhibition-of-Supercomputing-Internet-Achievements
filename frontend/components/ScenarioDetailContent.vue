<script setup lang="ts">
import { unitText } from '~/utils/workspace'
import { formatNumber } from '~/composables/useFormat'
import type { Benchmark, MetricKV, ParamField, ScenarioDetail } from '~/types'

defineProps<{
  detail?: ScenarioDetail
  benchmark?: Benchmark[string]
  params: ParamField[]
  clusterName: (id: string) => string
  hideOverview?: boolean
}>()

function metricValue(metric: MetricKV): string {
  return formatNumber(metric.value, 2).replace(/\^3/g, '³')
}

function metricUnit(unit?: string): string {
  return unitText(unit) === 'x' ? '×' : unitText(unit)
}

function architectureName(item: ScenarioDetail['architecture'][number]): string {
  return typeof item === 'string' ? item : item.name
}

function architectureDescription(item: ScenarioDetail['architecture'][number]): string | undefined {
  return typeof item === 'string' ? undefined : item.description
}
</script>

<template>
  <section v-if="!detail" class="scenario-result-empty">
    <el-empty description="未找到该场景详情" :image-size="72" />
  </section>

  <article v-else class="scenario-result-panel">
    <header v-if="!hideOverview" class="scenario-result-hero">
      <div class="scenario-result-heading">
        <h2 class="scenario-result-title">{{ detail.name }}</h2>
        <p class="scenario-result-description">{{ detail.description }}</p>

        <div v-if="detail.tech_stack.length" class="scenario-tech-stack" aria-label="技术栈">
          <span class="scenario-tech-stack-label">技术栈</span>
          <span v-for="item in detail.tech_stack" :key="item" class="scenario-tech-stack-item">{{ item }}</span>
        </div>
      </div>

      <dl v-if="detail.summary_metrics.length" class="scenario-summary-metrics" aria-label="关键指标">
        <div v-for="metric in detail.summary_metrics" :key="metric.label">
          <dt>{{ metric.label }}</dt>
          <dd>
            <span class="scenario-summary-value">{{ metricValue(metric) }}</span>
            <small v-if="metricUnit(metric.unit)">{{ metricUnit(metric.unit) }}</small>
          </dd>
        </div>
      </dl>
    </header>

    <section class="scenario-result-section scenario-overview-section">
      <div class="scenario-section-heading">
        <h3>背景与方法</h3>
      </div>

      <div class="scenario-overview-grid">
        <section>
          <h4>应用背景</h4>
          <p>{{ detail.background }}</p>
        </section>
        <section>
          <h4>计算方法</h4>
          <p>{{ detail.method }}</p>
        </section>
      </div>
    </section>

    <section class="scenario-result-section">
      <div class="scenario-section-heading">
        <h3>并行架构</h3>
      </div>

      <ol v-if="detail.architecture.length" class="scenario-architecture-list">
        <li v-for="(item, index) in detail.architecture" :key="`${architectureName(item)}-${index}`">
          <span class="scenario-architecture-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h4>{{ architectureName(item) }}</h4>
            <p v-if="architectureDescription(item)">{{ architectureDescription(item) }}</p>
          </div>
        </li>
      </ol>
      <p v-else class="scenario-section-empty">暂无架构说明</p>
    </section>

    <section v-if="detail.operators.length" class="scenario-result-section">
      <div class="scenario-section-heading">
        <h3>核心算子</h3>
      </div>

      <div class="scenario-table-wrap">
        <el-table :data="detail.operators" size="default">
          <el-table-column prop="id" label="算子 ID" min-width="180" class-name="mono" />
          <el-table-column prop="name" label="名称" min-width="220" />
        </el-table>
      </div>
    </section>

    <section v-if="benchmark" class="scenario-result-section">
      <div class="scenario-section-heading">
        <h3>性能基准</h3>
      </div>

      <BenchmarkComparison :benchmark="benchmark" />
    </section>

    <section v-if="params.length" class="scenario-result-section">
      <div class="scenario-section-heading">
        <h3>提交参数</h3>
      </div>

      <div class="scenario-table-wrap">
        <el-table :data="params" size="default">
          <el-table-column prop="name" label="参数名" min-width="150" class-name="mono" />
          <el-table-column prop="label" label="说明" min-width="150" />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column label="必填" width="80">
            <template #default="{ row }">{{ row.required ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column label="默认值" min-width="120">
            <template #default="{ row }">{{ row.default_value ?? '—' }}</template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="220" />
        </el-table>
      </div>
    </section>

    <section v-if="detail.highlights.length" class="scenario-result-section scenario-highlight-section">
      <div class="scenario-section-heading">
        <h3>成果亮点</h3>
      </div>

      <dl class="scenario-highlight-grid">
        <div v-for="metric in detail.highlights" :key="metric.label">
          <dt>{{ metric.label }}</dt>
          <dd>
            <span class="scenario-highlight-value">{{ metricValue(metric) }}</span>
            <small v-if="metricUnit(metric.unit)">{{ metricUnit(metric.unit) }}</small>
          </dd>
        </div>
      </dl>
    </section>

    <section v-if="detail.supported_clusters.length" class="scenario-result-section scenario-cluster-section">
      <div class="scenario-section-heading">
        <h3>支持算力中心</h3>
      </div>

      <div class="scenario-cluster-list">
        <span v-for="cluster in detail.supported_clusters" :key="cluster">
          {{ clusterName(cluster) }}
        </span>
      </div>
    </section>
  </article>
</template>

<style scoped>
.scenario-result-empty,
.scenario-result-panel {
  border: 1px solid #e1e6ed;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 7px rgba(31, 45, 61, 0.045);
}

.scenario-result-empty {
  min-height: 360px;
  display: grid;
  place-items: center;
}

.scenario-result-panel {
  min-width: 0;
  overflow: hidden;
  animation: scenario-result-enter 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.scenario-result-hero {
  display: grid;
  grid-template-columns: minmax(0, 960px) minmax(420px, 640px);
  align-items: end;
  justify-content: space-between;
  gap: clamp(48px, 5vw, 112px);
  padding: clamp(26px, 2.2vw, 38px);
}

.scenario-result-heading {
  width: 100%;
  min-width: 0;
  max-width: 960px;
}

.scenario-result-title {
  margin: 0;
  color: var(--scnet-text);
  font-size: clamp(24px, 1.65vw, 30px);
  font-weight: 650;
  line-height: 1.35;
  text-wrap: balance;
}

.scenario-result-description {
  max-width: 860px;
  margin: 10px 0 0;
  color: var(--scnet-text-secondary);
  font-size: 17px;
  line-height: 1.75;
  text-wrap: pretty;
}

.scenario-tech-stack {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  margin-top: 16px;
}

.scenario-tech-stack-label {
  display: inline-flex;
  align-items: center;
  margin-right: 16px;
  color: var(--scnet-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}

.scenario-tech-stack-label::before {
  width: 2px;
  height: 14px;
  margin-right: 8px;
  border-radius: 1px;
  background: var(--scnet-primary);
  content: '';
}

.scenario-tech-stack-item {
  display: inline-flex;
  align-items: baseline;
  padding: 0;
  border: 0;
  background: transparent;
  color: #45678f;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.scenario-tech-stack-item + .scenario-tech-stack-item::before {
  content: '·';
  margin: 0 10px;
  color: #aebdd0;
  font-weight: 400;
}

.scenario-summary-metrics {
  width: 100%;
  max-width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  align-items: center;
  margin: 0;
  padding-left: clamp(32px, 3vw, 56px);
  border-left: 1px solid var(--scnet-divider);
}

.scenario-summary-metrics > div {
  min-width: 0;
  padding: 10px clamp(18px, 1.5vw, 26px);
}

.scenario-summary-metrics > div:first-child {
  padding-left: 0;
}

.scenario-summary-metrics > div + div {
  border-left: 1px solid var(--scnet-divider);
}

.scenario-summary-metrics dt {
  overflow: hidden;
  color: var(--scnet-text-muted);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scenario-summary-metrics dd {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 4px;
  overflow: visible;
  margin: 4px 0 0;
  color: var(--scnet-text);
  font-size: 22px;
  font-weight: 650;
  line-height: 1.3;
  white-space: normal;
  font-variant-numeric: tabular-nums;
}

.scenario-summary-value {
  white-space: nowrap;
}

.scenario-summary-metrics small {
  margin-left: 0;
  color: var(--scnet-text-muted);
  font-size: 13px;
  font-weight: 400;
  white-space: nowrap;
}

.scenario-result-section {
  display: grid;
  grid-template-columns: minmax(135px, 0.22fr) minmax(0, 1fr);
  gap: clamp(24px, 3.5vw, 64px);
  padding: clamp(28px, 3vw, 48px) clamp(26px, 3.4vw, 56px);
  border-top: 1px solid var(--scnet-divider);
}

.scenario-highlight-section,
.scenario-cluster-section {
  padding-block: clamp(24px, 2.2vw, 34px);
}

.scenario-section-heading {
  align-self: center;
  justify-self: center;
  text-align: center;
}

.scenario-section-heading h3 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.45;
}

.scenario-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(28px, 4vw, 72px);
}

.scenario-overview-grid section + section {
  padding-left: clamp(28px, 4vw, 72px);
  border-left: 1px solid var(--scnet-divider);
}

.scenario-overview-grid h4 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 19px;
  font-weight: 600;
  line-height: 1.5;
}

.scenario-architecture-list h4 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}

.scenario-overview-grid p,
.scenario-architecture-list p {
  margin: 9px 0 0;
  color: var(--scnet-text-secondary);
  font-size: 16px;
  line-height: 1.85;
  white-space: pre-line;
}

.scenario-architecture-list {
  display: flex;
  align-items: center;
  overflow-x: auto;
  margin: 0;
  padding: 16px 18px;
  border: 1px solid #e1e8f0;
  border-radius: 8px;
  background: #f8fafc;
  list-style: none;
  scrollbar-width: thin;
}

.scenario-architecture-list li {
  position: relative;
  min-width: max-content;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 0 auto;
  padding: 0;
}

.scenario-architecture-list li:not(:last-child)::after {
  content: '→';
  flex: 0 0 auto;
  margin-right: clamp(14px, 1.7vw, 28px);
  margin-left: auto;
  color: #9bacc1;
  font-size: 16px;
  font-weight: 400;
  line-height: 1;
}

.scenario-architecture-list li > div {
  margin: 0;
}

.scenario-architecture-list h4 {
  text-align: left;
  white-space: nowrap;
}

.scenario-architecture-list p {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.55;
  text-align: left;
}

.scenario-architecture-index {
  width: auto;
  height: auto;
  display: inline-flex;
  place-items: center;
  flex: 0 0 auto;
  padding: 3px 7px;
  border-radius: 4px;
  background: var(--scnet-primary-soft);
  color: var(--scnet-primary);
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.scenario-section-empty {
  margin: 0;
  color: var(--scnet-text-muted);
  font-size: 15px;
}

.scenario-table-wrap {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--scnet-divider);
  border-radius: 7px;
}

.scenario-table-wrap :deep(.el-table) {
  --el-table-header-bg-color: #f7f9fc;
  --el-table-row-hover-bg-color: var(--scnet-hover-bg);
  font-size: 16px;
}

.scenario-table-wrap :deep(.el-table th.el-table__cell) {
  font-size: 16px;
}

.scenario-table-wrap :deep(.el-table th.mono.el-table__cell) {
  font-family: var(--scnet-font-sans);
}

.scenario-table-wrap :deep(.el-table td.mono.el-table__cell) {
  font-family: var(--scnet-font-mono);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: -0.01em;
}

.scenario-table-wrap :deep(.el-table::before) {
  display: none;
}

.scenario-highlight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0;
  margin: 0;
  padding: 10px 0;
  border-top: 1px solid var(--scnet-divider);
  border-bottom: 1px solid var(--scnet-divider);
}

.scenario-highlight-grid > div {
  min-width: 0;
  padding: 7px clamp(18px, 2vw, 32px);
  border: 0;
  border-radius: 0;
  background: transparent;
}

.scenario-highlight-grid > div:first-child {
  padding-left: 0;
}

.scenario-highlight-grid > div:last-child {
  padding-right: 0;
}

.scenario-highlight-grid > div + div {
  border-left: 1px solid var(--scnet-divider);
}

.scenario-highlight-grid dt {
  overflow: hidden;
  color: var(--scnet-text-muted);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scenario-highlight-grid dd {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  overflow: visible;
  margin: 5px 0 0;
  color: var(--scnet-text);
  font-size: clamp(22px, 1.45vw, 27px);
  font-weight: 650;
  line-height: 1.3;
  white-space: normal;
  font-variant-numeric: tabular-nums;
}

.scenario-highlight-value,
.scenario-highlight-grid small {
  white-space: nowrap;
}

.scenario-highlight-grid small {
  color: var(--scnet-text-muted);
  font-size: 13px;
  font-weight: 400;
}

.scenario-cluster-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  align-items: stretch;
  gap: 0;
  border-top: 1px solid var(--scnet-divider);
  border-bottom: 1px solid var(--scnet-divider);
}

.scenario-cluster-list span {
  min-width: 0;
  min-height: 58px;
  display: flex;
  align-items: center;
  padding: 0 clamp(18px, 2vw, 30px);
  color: var(--scnet-text-secondary);
  font-size: 15px;
  font-weight: 550;
  line-height: 1.5;
}

.scenario-cluster-list span:first-child {
  padding-left: 0;
}

.scenario-cluster-list span:last-child {
  padding-right: 0;
}

.scenario-cluster-list span + span {
  border-left: 1px solid var(--scnet-divider);
}

@keyframes scenario-result-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1180px) {
  .scenario-result-hero {
    display: block;
  }

  .scenario-summary-metrics {
    width: fit-content;
    margin-top: 24px;
    padding-left: 0;
    border-left: 0;
  }
}

@media (max-width: 900px) {

  .scenario-result-section {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

@media (max-width: 760px) {
  .scenario-result-hero {
    padding: 24px 22px;
  }

  .scenario-result-section {
    padding: 28px 22px;
  }

  .scenario-summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .scenario-summary-metrics > div {
    padding: 10px 18px;
  }

  .scenario-summary-metrics > div:nth-child(odd) {
    padding-left: 0;
    border-left: 0;
  }

  .scenario-overview-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .scenario-overview-grid section + section {
    padding-top: 24px;
    padding-left: 0;
    border-top: 1px solid var(--scnet-divider);
    border-left: 0;
  }

  .scenario-highlight-grid,
  .scenario-cluster-list {
    grid-template-columns: 1fr;
  }

  .scenario-highlight-grid > div,
  .scenario-highlight-grid > div:first-child,
  .scenario-highlight-grid > div:last-child {
    padding: 13px 0;
  }

  .scenario-highlight-grid > div + div,
  .scenario-cluster-list span + span {
    border-top: 1px solid var(--scnet-divider);
    border-left: 0;
  }

  .scenario-cluster-list span,
  .scenario-cluster-list span:first-child,
  .scenario-cluster-list span:last-child {
    min-height: 50px;
    padding: 0;
  }

}

@media (prefers-reduced-motion: reduce) {
  .scenario-result-panel {
    animation-duration: 0.01ms;
  }
}
</style>
