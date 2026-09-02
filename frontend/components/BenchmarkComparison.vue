<script setup lang="ts">
import { formatNumber } from '~/composables/useFormat'
import type { Benchmark, BenchmarkSeries } from '~/types'

const props = defineProps<{
  benchmark: Benchmark[string]
}>()

const seriesColors = ['#0b5bd3', '#789bc8', '#b2c1d3', '#d0d9e4']

function numericValue(series: BenchmarkSeries, key: string): number {
  const value = Number(series[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

function dimensionMax(key: string): number {
  return Math.max(0, ...props.benchmark.series.map((series) => numericValue(series, key)))
}

function barWidth(key: string, series: BenchmarkSeries): string {
  const max = dimensionMax(key)
  if (max <= 0) return '0%'
  return `${Math.min(100, Math.max(0, numericValue(series, key) / max * 100))}%`
}

function valueText(series: BenchmarkSeries, key: string): string {
  return formatNumber(series[key], 2)
}

function seriesColor(index: number): string {
  return seriesColors[index % seriesColors.length] ?? seriesColors[0]
}
</script>

<template>
  <div class="benchmark-comparison" aria-label="各项性能指标按自身量纲分别比较">
    <section
      v-for="dimension in benchmark.dimensions"
      :key="dimension.key"
      class="benchmark-metric-row"
      :aria-label="`${dimension.name}，单位 ${dimension.unit}`"
    >
      <div class="benchmark-metric-name">
        <h4>{{ dimension.name }}</h4>
        <p>{{ dimension.unit }}</p>
      </div>

      <div
        class="benchmark-series-grid"
        :style="{ '--benchmark-series-count': benchmark.series.length }"
      >
        <div
          v-for="(series, seriesIndex) in benchmark.series"
          :key="series.name"
          class="benchmark-series-item"
        >
          <div class="benchmark-series-meta">
            <span>{{ series.name }}</span>
            <strong>{{ valueText(series, dimension.key) }}</strong>
          </div>
          <div class="benchmark-series-track" aria-hidden="true">
            <span
              class="benchmark-series-fill"
              :style="{
                width: barWidth(dimension.key, series),
                backgroundColor: seriesColor(seriesIndex),
              }"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.benchmark-comparison {
  min-width: 0;
}

.benchmark-metric-row {
  display: grid;
  grid-template-columns: minmax(140px, 0.22fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(24px, 3vw, 54px);
  padding: 14px 0;
  border-top: 1px solid var(--scnet-divider);
}

.benchmark-metric-row:first-child {
  padding-top: 0;
  border-top: 0;
}

.benchmark-metric-row:last-child {
  padding-bottom: 0;
}

.benchmark-metric-name h4 {
  margin: 0;
  color: var(--scnet-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.45;
}

.benchmark-metric-name p {
  margin: 3px 0 0;
  color: var(--scnet-text-muted);
  font-size: 13px;
  line-height: 1.45;
}

.benchmark-series-grid {
  --benchmark-series-count: 2;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(var(--benchmark-series-count), minmax(0, 1fr));
}

.benchmark-series-item {
  min-width: 0;
  padding: 0 clamp(10px, 1vw, 18px);
}

.benchmark-series-item:first-child {
  padding-left: 0;
}

.benchmark-series-item + .benchmark-series-item {
  border-left: 1px solid var(--scnet-divider);
}

.benchmark-series-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.benchmark-series-meta span {
  min-width: 0;
  overflow: visible;
  color: var(--scnet-text-secondary);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: clip;
  white-space: normal;
}

.benchmark-series-meta strong {
  flex: 0 0 auto;
  color: var(--scnet-text);
  font-size: 18px;
  font-weight: 650;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.benchmark-series-track {
  height: 5px;
  overflow: hidden;
  margin-top: 8px;
  border-radius: 3px;
  background: #edf1f6;
}

.benchmark-series-fill {
  height: 100%;
  display: block;
  border-radius: inherit;
}

@media (max-width: 900px) {
  .benchmark-metric-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

@media (max-width: 620px) {
  .benchmark-series-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .benchmark-series-item {
    padding: 0;
  }

  .benchmark-series-item + .benchmark-series-item {
    padding-top: 12px;
    border-top: 1px solid var(--scnet-divider);
    border-left: 0;
  }
}
</style>
