<script setup lang="ts">
import RunDetailContent from '~/components/run/RunDetailContent.vue'

const props = defineProps<{
  domain: string
  runId: string
}>()
</script>

<template>
  <section class="exp-result">
    <!-- 「结果展示」按「流程编排」所选运行记录，内联复用运行记录详情页的渲染，不离开当前页面 -->
    <RunDetailContent
      v-if="props.runId"
      :key="props.runId"
      :domain="props.domain"
      :run-id="props.runId"
    />
    <div v-else class="exp-result-empty" role="status">
      <strong>暂无可展示的运行记录</strong>
      <p>请先在「流程编排」步骤中选择一条运行记录，再查看对应的结果详情。</p>
    </div>
  </section>
</template>

<style scoped>
.exp-result { min-width: 0; }
.exp-result-empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 32px;
  border: 1px solid var(--scnet-divider);
  border-radius: 10px;
  background: #fff;
  text-align: center;
}
.exp-result-empty strong { color: var(--scnet-text); font-size: 16px; }
.exp-result-empty p { margin: 0; color: var(--scnet-text-muted); font-size: 13px; }
</style>
