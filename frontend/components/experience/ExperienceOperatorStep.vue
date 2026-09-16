<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes, formatNumber, statusText } from '~/composables/useFormat'
import type { Operator, OperatorRef } from '~/types'
const props = defineProps<{
  domain: string
  operators: Operator[]
  selectedOperators: OperatorRef[]
}>()

const selectedNames = computed(
  () => new Set(props.selectedOperators.flatMap((item) => [item.id, item.name])),
)

function isSelected(operator: Operator): boolean {
  return selectedNames.value.has(operator.name)
}

const ordered = computed(() =>
  [...props.operators].sort((a, b) => Number(isSelected(b)) - Number(isSelected(a))),
)

function memoryText(memoryMb: number): string {
  return formatBytes(memoryMb * 1024 * 1024)
}
</script>

<template>
  <div class="exp-operator">
    <p class="exp-hint">
      该步骤将跳转主前端的「算子市场」页面完成算子选择与注册。
      此处预置展示本场景推荐算子，数据来自 <code>GET /api/v1/{{ domain }}/operators</code>。
    </p>

    <div v-if="ordered.length" class="exp-operator-grid">
      <article
        v-for="operator in ordered"
        :key="operator.name"
        class="exp-operator-card"
        :class="{ 'is-selected': isSelected(operator) }"
      >
        <header class="exp-operator-head">
          <div>
            <h3>{{ operator.name }}</h3>
            <p class="exp-operator-version">{{ operator.runtime_type }} · {{ operator.version }}</p>
          </div>
          <el-tag
            :type="isSelected(operator) ? 'success' : 'info'"
            effect="light"
            size="small"
          >
            {{ isSelected(operator) ? '已选用' : '可选' }}
          </el-tag>
        </header>

        <p class="exp-operator-desc">{{ operator.description }}</p>

        <dl class="exp-operator-metrics">
          <div>
            <dt>CPU 核数</dt>
            <dd>{{ formatNumber(operator.cpu_cores) }}</dd>
          </div>
          <div>
            <dt>GPU 卡数</dt>
            <dd>{{ formatNumber(operator.gpu_count) }}</dd>
          </div>
          <div>
            <dt>内存</dt>
            <dd>{{ memoryText(operator.memory_mb) }}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{{ statusText(operator.status) }}</dd>
          </div>
        </dl>
      </article>
    </div>

    <el-empty v-else description="暂无算子数据" :image-size="60" />
  </div>
</template>

<style scoped>
.exp-operator {
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

.exp-operator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.exp-operator-card {
  display: grid;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.exp-operator-card.is-selected {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 10px rgba(11, 91, 211, 0.08);
}

.exp-operator-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.exp-operator-head h3 {
  margin: 0;
  font-family: var(--scnet-font-mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--scnet-text);
}

.exp-operator-version {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--scnet-text-muted);
}

.exp-operator-desc {
  margin: 0;
  min-height: 44px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--scnet-text-secondary);
}

.exp-operator-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 12px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--scnet-divider);
}

.exp-operator-metrics dt {
  font-size: 12px;
  color: var(--scnet-text-muted);
}

.exp-operator-metrics dd {
  margin: 2px 0 0;
  font-family: var(--scnet-font-mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--scnet-text);
}
</style>
