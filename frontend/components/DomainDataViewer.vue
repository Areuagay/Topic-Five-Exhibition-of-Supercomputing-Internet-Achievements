<script setup lang="ts">
import { computed, ref } from 'vue'
import DomainTrajectoryDetails from './DomainTrajectoryDetails.vue'
import { isCompactValue, layoutDataBlocks } from '~/utils/domain-data-layout'

interface Props {
  data: unknown
  fieldKey?: string
  depth?: number
  inline?: boolean
  report?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  fieldKey: '',
  depth: 0,
  inline: false,
  report: false,
})

const MAX_TABLE_ROWS = 40
const MAX_CHIPS = 24
const MAX_INLINE_CHIPS = 8

const showAllRows = ref(false)
const inlineDetailsMounted = ref(false)

function onInlineToggle(event: Event) {
  if ((event.currentTarget as HTMLDetailsElement).open) inlineDetailsMounted.value = true
}

const ENUM_TEXT: Record<string, Record<string, string>> = {
  source_type: { simulated: '模拟数据', real: '真实数据' },
  execution_mode: { simulated: '模拟执行', real: '真实执行' },
  status: {
    running: '运行中',
    completed: '已完成',
    success: '已完成',
    failed: '失败',
    pending: '等待中',
    queued: '排队中',
    cancelled: '已取消',
    converged: '已收敛',
    diverged: '未收敛',
  },
  level: { info: '信息', warn: '警告', warning: '警告', error: '错误', debug: '调试' },
}

const LABELS: Record<string, string> = {
  scenario_id: '场景标识',
  scenario_alias: '场景别名',
  source_type: '数据来源',
  execution_mode: '执行模式',
  // 波动传播
  residual_series: '残差收敛序列',
  residual: '残差',
  iteration: '迭代',
  step_time: '步进耗时',
  seismogram_series: '地震波形序列',
  time: '时间',
  amplitude: '振幅',
  wavefield_frames: '波场快照',
  step: '步进',
  simulation_time: '模拟时间',
  preview_url: '预览图',
  artifact_id: '产物标识',
  domain_partitions: '区域分解',
  partition_id: '分区',
  cells: '网格单元',
  cores: '核心数',
  // 板块构造
  temperature_series: '温度序列',
  max_temperature: '最高温度',
  avg_temperature: '平均温度',
  velocity_series: '速度序列',
  max_velocity: '最大速度',
  avg_velocity: '平均速度',
  nonlinear_series: '非线性迭代残差',
  field_frames: '场快照',
  temperature_preview: '温度场预览',
  velocity_preview: '速度场预览',
  // LLM 预训练
  training_series: '训练曲线',
  loss: '损失',
  learning_rate: '学习率',
  tokens_per_second: '吞吐量(tokens/s)',
  gpu_utilization: 'GPU 利用率',
  communication_overhead: '通信开销',
  gpu_metrics: 'GPU 指标',
  gpu_id: 'GPU 编号',
  utilization: '利用率',
  memory_utilization: '显存利用率',
  temperature: '温度',
  parallel_config: '并行配置',
  data_parallel: '数据并行',
  tensor_parallel: '张量并行',
  pipeline_parallel: '流水并行',
  world_size: '总进程数',
  checkpoint_events: '检查点事件',
  timestamp: '时间戳',
  size_gb: '大小(GB)',
  path: '路径',
  // PINN 加速
  pinn_training_series: 'PINN 训练曲线',
  epoch: '轮次',
  total_loss: '总损失',
  physics_loss: '物理损失',
  data_loss: '数据损失',
  validation_error: '验证误差',
  prediction_error_series: '预测误差',
  l2_error: 'L2 误差',
  max_error: '最大误差',
  residual_field: '残差场',
  x: 'X',
  y: 'Y',
  values: '数值',
  sampling_statistics: '采样统计',
  physics_points: '物理点',
  boundary_points: '边界点',
  data_points: '数据点',
  // 整车碰撞
  energy_series: '能量曲线',
  kinetic_energy: '动能',
  internal_energy: '内能',
  hourglass_energy: '沙漏能',
  kinetic: '动能',
  internal: '内能',
  hourglass: '沙漏能',
  acceleration_series: '加速度曲线',
  acceleration_g: '加速度(g)',
  intrusion_series: '侵入量曲线',
  intrusion_mm: '侵入量(mm)',
  critical_results: '关键结果',
  peak_acceleration_g: '峰值加速度(g)',
  max_intrusion_mm: '最大侵入量(mm)',
  max_stress_mpa: '最大应力(MPa)',
  energy_error_percent: '能量误差(%)',
  // 疲劳寿命
  damage_series: '损伤曲线',
  cycle: '循环次数',
  damage_ratio: '损伤比',
  sn_curve: 'S-N 曲线',
  stress_amplitude: '应力幅',
  cycles_to_failure: '失效循环',
  critical_locations: '关键位置',
  location: '位置',
  max_stress: '最大应力',
  damage: '损伤',
  predicted_life: '预测寿命',
  // 无人机集群
  total_uavs: '无人机总数',
  sample_uav_count: '采样无人机数',
  trajectory_samples: '轨迹采样',
  uav_id: '无人机编号',
  points: '轨迹点',
  t: '时间',
  z: 'Z',
  formation_series: '编队误差序列',
  formation_error: '编队误差',
  active_uavs: '活跃无人机',
  completed_uavs: '已完成无人机',
  collision_events: '碰撞事件',
  uav_ids: '无人机编号',
  mission_targets: '任务目标',
  target_id: '目标编号',
  // 无人机路径规划
  environment: '环境',
  width: '宽',
  height: '高',
  start: '起点',
  goal: '终点',
  obstacles: '障碍物',
  type: '类型',
  w: '宽',
  h: '高',
  cx: '中心X',
  cy: '中心Y',
  r: '半径',
  best_path: '最优路径',
  cost_series: '代价曲线',
  best_cost: '最优代价',
  average_cost: '平均代价',
  path_preview: '路径预览',
  // 虚拟筛选
  screening_funnel: '筛选漏斗',
  input: '输入',
  preprocessed: '预处理',
  docked: '对接',
  property_passed: '性质过滤',
  top_n: 'Top N',
  score_distribution: '分数分布',
  min: '最小值',
  max: '最大值',
  count: '数量',
  top_candidates: '候选分子',
  rank: '排名',
  compound_id: '化合物编号',
  docking_score: '对接分数',
  molecular_weight: '分子量',
  logp: 'LogP',
  // ADMET 预测
  filter_rule: '过滤规则',
  toxicity_lt: '毒性阈值',
  absorption_gt: '吸收阈值',
  distribution_gt: '分布阈值',
  admet_summary: 'ADMET 汇总',
  total: '总数',
  passed: '通过',
  failed: '失败',
  candidate_properties: '候选化合物性质',
  absorption: '吸收',
  distribution: '分布',
  metabolism: '代谢',
  excretion: '排泄',
  toxicity: '毒性',
  risk_distribution: '风险分布',
  risk_level: '风险等级',
  property_distribution: '性质分布',
  mean: '均值',
  std: '标准差',
  bins: '分箱',
  // 能带 / 态密度
  scf_series: 'SCF 收敛',
  total_energy: '总能量',
  energy_delta: '能量变化',
  band_structure: '能带结构',
  k_labels: 'K 点标签',
  k_positions: 'K 点位置',
  fermi_energy: '费米能级',
  bands: '能带',
  band_index: '能带序号',
  energies: '能量',
  dos_series: '态密度',
  energy: '能量',
  total_dos: '总态密度',
  structure: '晶体结构',
  lattice: '晶格',
  atoms: '原子',
  element: '元素',
  note: '说明',
  // 高通量筛选
  batch_summary: '批次汇总',
  completed: '已完成',
  converged: '已收敛',
  qualified: '合格',
  materials: '材料',
  material_id: '材料编号',
  formula: '化学式',
  formation_energy: '形成能',
  formation_energy_lt: '形成能阈值',
  band_gap: '带隙',
  stability_score: '稳定性评分',
  cluster_id: '簇编号',
  candidate_ranking: '候选排序',
  score: '评分',
  reason: '理由',
  cluster_distribution: '簇分布',
  cluster_name: '簇名称',
  assigned: '分配数',
  band_gap_range: '带隙范围',
  stability_score_gt: '稳定性阈值',
}

function prettifyKey(key: string): string {
  if (!key) return ''
  return LABELS[key] ?? key.replace(/_/g, ' ')
}

function formatNumberValue(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(6)))
}

function formatScalar(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  const map = ENUM_TEXT[key]
  const raw = String(value)
  if (map && map[raw]) return map[raw]
  if (typeof value === 'number') return formatNumberValue(value)
  return raw
}

type Kind = 'empty' | 'empty-array' | 'scalar' | 'chips' | 'table' | 'object'

const kind = computed<Kind>(() => {
  const value = props.data
  if (value === null || value === undefined || value === '') return 'empty'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'empty-array'
    const allObjects = value.every(
      (item) => item !== null && typeof item === 'object' && !Array.isArray(item),
    )
    return allObjects ? 'table' : 'chips'
  }
  if (typeof value === 'object') return 'object'
  return 'scalar'
})

const isUrl = computed(() => typeof props.data === 'string' && /^https?:\/\//.test(props.data))

const urlLabel = computed(() => {
  const text = String(props.data)
  return text.length > 64 ? `${text.slice(0, 61)}…` : text
})

const rawSummary = computed(() => {
  const value = props.data
  if (Array.isArray(value)) return `${value.length} 项`
  if (value && typeof value === 'object') {
    return `${Object.keys(value as Record<string, unknown>).length} 个字段`
  }
  return formatScalar(props.fieldKey, value)
})

const chipItems = computed<unknown[]>(() => {
  const list = Array.isArray(props.data) ? props.data : []
  return list.slice(0, props.inline ? MAX_INLINE_CHIPS : MAX_CHIPS)
})

const chipHidden = computed(() => {
  const list = Array.isArray(props.data) ? props.data : []
  return Math.max(0, list.length - chipItems.value.length)
})

const tableRowsAll = computed<Record<string, unknown>[]>(() => {
  const list = Array.isArray(props.data) ? props.data : []
  return list.map((row) =>
    row !== null && typeof row === 'object' && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : { value: row },
  )
})

const tableColumns = computed<string[]>(() => {
  const columns: string[] = []
  for (const row of tableRowsAll.value.slice(0, 20)) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }
  return columns
})

const tableRows = computed<Record<string, unknown>[]>(() => {
  if (props.inline || showAllRows.value) return tableRowsAll.value
  return tableRowsAll.value.slice(0, MAX_TABLE_ROWS)
})

const tableHidden = computed(() => tableRowsAll.value.length - tableRows.value.length)

const objectEntries = computed<{ key: string; value: unknown }[]>(() => {
  const value = props.data
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }))
})

const scalarEntries = computed(() =>
  objectEntries.value.filter(entry => props.report ? isCompactValue(entry.value) : entry.value === null || typeof entry.value !== 'object'),
)

const blockEntries = computed(() => {
  const entries = objectEntries.value.filter(entry => !scalarEntries.value.includes(entry))
  if (!props.report) return entries.map(entry => ({ ...entry, fullWidth: false }))
  return layoutDataBlocks(entries)
})
</script>

<template>
  <div class="ddv" :class="[inline ? 'ddv-inline' : 'ddv-block', { 'ddv-report': report }]">
    <template v-if="kind === 'scalar'">
      <a
        v-if="isUrl"
        class="ddv-link"
        :href="String(data)"
        target="_blank"
        rel="noopener noreferrer"
      >{{ urlLabel }}</a>
      <span v-else>{{ formatScalar(fieldKey, data) }}</span>
    </template>

    <span v-else-if="kind === 'empty'" class="ddv-empty">—</span>
    <span v-else-if="kind === 'empty-array'" class="ddv-empty">（空）</span>

    <div v-else-if="kind === 'chips'" class="ddv-chips">
      <span
        v-for="(item, index) in chipItems"
        :key="index"
        class="ddv-chip"
        :title="formatScalar(fieldKey, item)"
      >{{ formatScalar(fieldKey, item) }}</span>
      <span v-if="chipHidden" class="ddv-chip ddv-chip-more">+{{ chipHidden }}</span>
    </div>

    <details v-else-if="kind === 'table' && inline" class="ddv-inline-details" @toggle="onInlineToggle">
      <summary>{{ rawSummary }}</summary>
      <DomainDataViewer v-if="inlineDetailsMounted" :data="data" :field-key="fieldKey" :depth="depth + 1" />
    </details>

    <DomainTrajectoryDetails v-else-if="kind === 'table' && fieldKey === 'trajectory_samples' && !inline" :samples="tableRowsAll" />

    <div v-else-if="kind === 'table'" class="ddv-table-wrap">
      <div class="ddv-table-scroll" tabindex="0" role="region" :aria-label="prettifyKey(fieldKey) || '数据表格'">
        <table class="ddv-table">
          <thead>
            <tr>
              <th v-for="column in tableColumns" :key="column">{{ prettifyKey(column) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in tableRows" :key="rowIndex">
              <td v-for="column in tableColumns" :key="column">
                <DomainDataViewer :data="row[column]" :field-key="column" :depth="depth + 1" inline />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ddv-table-note">
        <span>共 {{ tableRowsAll.length }} 行</span>
        <button v-if="tableHidden" type="button" class="ddv-more" @click="showAllRows = true">
          展开全部（还有 {{ tableHidden }} 行）
        </button>
      </p>
    </div>

    <details v-else-if="kind === 'object' && inline" class="ddv-inline-details" @toggle="onInlineToggle">
      <summary>{{ rawSummary }}</summary>
      <DomainDataViewer v-if="inlineDetailsMounted" :data="data" :field-key="fieldKey" :depth="depth + 1" />
    </details>

    <div v-else-if="kind === 'object'" class="ddv-object">
      <dl v-if="scalarEntries.length" class="ddv-facts">
        <div v-for="entry in scalarEntries" :key="entry.key">
          <dt>{{ prettifyKey(entry.key) }}</dt>
          <dd><DomainDataViewer v-if="Array.isArray(entry.value)" :data="entry.value" :field-key="entry.key" inline /><template v-else>{{ formatScalar(entry.key, entry.value) }}</template></dd>
        </div>
      </dl>
      <section v-for="entry in blockEntries" :key="entry.key" class="ddv-block" :class="{ 'ddv-block-wide': entry.fullWidth }">
        <h4 v-if="entry.key" class="ddv-block-title">{{ prettifyKey(entry.key) }}</h4>
        <DomainDataViewer :data="entry.value" :field-key="entry.key" :depth="depth + 1" :report="report" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.ddv {
  min-width: 0;
  color: #33445c;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.ddv-inline {
  display: inline-block;
  max-width: 100%;
  vertical-align: top;
}

.ddv-empty {
  color: #9aa7b8;
}

.ddv-link {
  color: #1769d2;
  text-decoration: none;
  word-break: break-all;
}

.ddv-link:hover {
  text-decoration: underline;
}

.ddv-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ddv-chip {
  display: inline-block;
  min-width: 0;
  max-width: 240px;
  overflow: hidden;
  padding: 2px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #f5f8fc;
  color: #4a5a70;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ddv-chip-more {
  border-style: dashed;
  color: #7d899a;
}

.ddv-object {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.ddv-facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px 20px;
  margin: 0;
}

.ddv-facts > div {
  min-width: 0;
}

.ddv-facts dt {
  color: #7d899a;
  font-size: 12px;
}

.ddv-facts dd {
  margin: 2px 0 0;
  color: #253044;
  font-size: 14px;
  font-weight: 600;
}

.ddv-block {
  min-width: 0;
}

.ddv-block-title {
  margin: 0 0 8px;
  color: #3a4a60;
  font-size: 14px;
  font-weight: 600;
}

.ddv-table-wrap {
  min-width: 0;
}

.ddv-table-scroll {
  max-width: 100%;
  overflow-x: auto;
}

.ddv-report > .ddv-object > .ddv-facts {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
}
@media (min-width: 1100px) {
  .ddv-report > .ddv-object { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 28px; align-items: start; }
  .ddv-report > .ddv-object > .ddv-facts,
  .ddv-report > .ddv-object > .ddv-block-wide { grid-column: 1 / -1; }
}

.ddv-table-scroll:focus-visible {
  outline: 2px solid var(--scnet-primary);
  outline-offset: 2px;
}

.ddv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.ddv-table th,
.ddv-table td {
  padding: 6px 12px;
  border-bottom: 1px solid #edf1f5;
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}

.ddv-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fbfcfe;
  color: #687588;
  font-weight: 600;
}

.ddv-table tbody > tr > td {
  transition: background-color var(--scnet-hover-duration) var(--scnet-hover-easing);
}

.ddv-table tbody > tr:hover > td {
  background: var(--scnet-hover-bg);
}

.ddv-table-note {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 0;
  color: #7d899a;
  font-size: 12px;
}

.ddv-more {
  border: 1px solid #c9d9ec;
  border-radius: 4px;
  background: #f5f8fc;
  color: #1769d2;
  cursor: pointer;
  font-size: 12px;
  padding: 3px 10px;
}

.ddv-more:hover {
  background: #eaf1fb;
}

.ddv-inline-details > summary {
  color: #1769d2;
  cursor: pointer;
  font-size: 12px;
}

.ddv-inline-details[open] > summary {
  margin-bottom: 8px;
}

@media (max-width: 700px) {
  .ddv-facts {
    grid-template-columns: 1fr;
  }

  .ddv-chip {
    max-width: 160px;
  }
}
</style>
