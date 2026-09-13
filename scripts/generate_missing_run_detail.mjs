/**
 * Fill in run-detail records that are missing from mock-data.
 *
 * Currently the only gap is geodynamics GEO-20260811-0009 (tectonic-evolution):
 * its run entry declares `has_detail: true`, but no run-details JSON exists, so
 * the detail page would 404 and show no domain_data. This script clones the
 * GEO-20260811-0010 template (same scenario) and regenerates a complete,
 * deterministic tectonic-evolution domain_data for the running job.
 *
 * Usage: node scripts/generate_missing_run_detail.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const mockDir = resolve(repoRoot, 'mock-data')

const DOMAIN = 'geodynamics'
const RUN_ID = 'GEO-20260811-0009'
const TEMPLATE_ID = 'GEO-20260811-0010'

const round = (value, digits = 6) => Number(value.toFixed(digits))
const clip = (value, low, high) => Math.min(high, Math.max(low, value))

function seedFromString(text) {
  let hash = 2166136261 >>> 0
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function mulberry32(seed) {
  let state = seed >>> 0
  return function next() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = mulberry32(seedFromString(RUN_ID))

function normal() {
  let u = 0
  let v = 0
  while (u === 0) u = random()
  while (v === 0) v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function buildTectonicDomainData(previewFrames) {
  const count = 48
  const times = Array.from({ length: count }, (_, i) => (100 * i) / (count - 1))

  const temperatureSeries = times.map((time) => {
    const avg = clip(900 + 120 * Math.sin(time / 18) + normal() * 8, 300, 1800)
    const max = clip(avg + 350 + 40 * Math.sin(time / 12), 300, 1800)
    return {
      time: round(time, 3),
      max_temperature: round(max, 2),
      avg_temperature: round(avg, 2),
    }
  })

  const velocitySeries = times.map((time) => {
    const max = Math.abs(4.5e-9 * (1 + 0.2 * Math.sin(time / 15)) + normal() * 1e-10)
    const avg = max * (0.35 + 0.05 * random())
    return {
      time: round(time, 3),
      max_velocity: round(max, 12),
      avg_velocity: round(avg, 12),
    }
  })

  const nonlinearSeries = []
  for (let i = 1; i <= 35; i += 1) {
    let residual = 0.2 * Math.exp(-i / 6) + 1e-5
    if (i - 1 === 12) residual *= 1.35
    if (i - 1 === 22) residual *= 1.2
    residual *= 1 + normal() * 0.03
    nonlinearSeries.push({ iteration: i, residual: round(residual, 10) })
  }

  const fieldFrames = previewFrames.map((frame, index) => ({
    time: round(times[Math.min(index * 6, count - 1)], 3),
    temperature_preview: frame.temperature_preview,
    velocity_preview: frame.velocity_preview,
  }))

  return {
    source_type: 'simulated',
    execution_mode: 'simulated',
    scenario_id: 'tectonic-evolution',
    scenario_alias: 'plate-tectonics',
    temperature_series: temperatureSeries,
    velocity_series: velocitySeries,
    nonlinear_series: nonlinearSeries,
    field_frames: fieldFrames,
  }
}

const template = JSON.parse(
  readFileSync(resolve(mockDir, DOMAIN, 'run-details', `${TEMPLATE_ID}.json`), 'utf8'),
)
const runs = JSON.parse(readFileSync(resolve(mockDir, DOMAIN, 'runs.json'), 'utf8'))
const run = (runs.data || []).find((item) => item.run_id === RUN_ID)
if (!run) throw new Error(`run ${RUN_ID} not found in ${DOMAIN}/runs.json`)

const data = template.data
const domainData = buildTectonicDomainData(data.domain_data.field_frames)

data.run_id = run.run_id
data.scenario_id = run.scenario_id
data.scenario_name = run.scenario_name
data.status = run.status
data.progress = run.progress
data.execution_mode = run.execution_mode
data.cluster_id = run.cluster_id
data.cluster_name = run.cluster_name
data.job_id = run.job_id
data.current_stage = run.current_stage
data.start_time = run.start_time
data.end_time = run.end_time || ''
data.elapsed_seconds = run.elapsed_seconds
data.nodes = run.nodes
data.cpu_cores = run.cpu_cores
data.gpu_count = run.gpu_count
data.memory_gb = run.memory_gb
data.core_hours = run.core_hours
data.source_type = run.source_type

data.metrics = {
  progress: run.progress,
  metrics: (run.metrics_snapshot || []).map((metric) => ({ ...metric })),
  domain_data: domainData,
}
data.domain_data = domainData

data.workflow = {
  nodes: [
    { id: 'prepare', name: '数据预处理', status: 'success', progress: 100, cluster_id: run.cluster_id },
    { id: 'partition', name: '网格划分与域分解', status: 'success', progress: 100, cluster_id: run.cluster_id },
    { id: 'solver', name: '耦合求解', status: 'running', progress: run.progress, cluster_id: run.cluster_id },
    { id: 'post', name: '结果后处理', status: 'pending', progress: 0, cluster_id: run.cluster_id },
  ],
  edges: [
    { source: 'prepare', target: 'partition' },
    { source: 'partition', target: 'solver' },
    { source: 'solver', target: 'post' },
  ],
}

data.logs = {
  next_offset: 5,
  has_more: false,
  lines: [
    {
      seq: 1,
      timestamp: '2026-08-11T08:00:02+08:00',
      level: 'INFO',
      cluster_id: run.cluster_id,
      message: `任务提交成功，作业ID ${run.job_id}，分配节点 ${run.nodes} 个（${run.cpu_cores} 核）`,
    },
    {
      seq: 2,
      timestamp: '2026-08-11T08:01:40+08:00',
      level: 'INFO',
      cluster_id: run.cluster_id,
      message: '初始板块几何与物性参数加载完成（粘度分层、密度场、初始速度场）',
    },
    {
      seq: 3,
      timestamp: '2026-08-11T08:05:12+08:00',
      level: 'INFO',
      cluster_id: run.cluster_id,
      message: '非结构网格生成：3500 万单元，完成 16 域分解，负载均衡度 0.97',
    },
    {
      seq: 4,
      timestamp: '2026-08-11T08:05:40+08:00',
      level: 'INFO',
      cluster_id: run.cluster_id,
      message: '开始耦合求解：动量守恒 + 能量守恒 + 热-力学耦合迭代',
    },
    {
      seq: 5,
      timestamp: '2026-08-11T10:30:00+08:00',
      level: 'INFO',
      cluster_id: run.cluster_id,
      message: '时间步 2900/5000 完成，平均 Newton 迭代 4 次收敛',
    },
  ],
}

const outputPath = resolve(mockDir, DOMAIN, 'run-details', `${RUN_ID}.json`)
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
console.log(`generated ${outputPath}`)
