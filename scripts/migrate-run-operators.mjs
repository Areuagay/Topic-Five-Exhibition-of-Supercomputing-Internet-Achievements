/**
 * 迁移六个领域的运行记录：
 *   1. 旧版工作流算子 → 当前算子库（只保留当前算子）；
 *   2. 工作流节点补齐算子名称、运行环境、CPU / GPU / 内存 / 累计核时；
 *   3. 运行记录的起止时间与累计运行时间对齐。
 *
 * 幂等：重复执行不会改变已迁移的数据。
 *
 *   node scripts/migrate-run-operators.mjs
 *   node scripts/migrate-run-operators.mjs --check   # 只检查是否需要迁移
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyOperatorPlan, needsOperatorPlan, OPERATOR_PLAN_VERSION } from '../backend/operator-plan.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MOCK_DIR = resolve(ROOT, 'mock-data')
const RUNTIME_DIR = resolve(ROOT, '.runtime-data')
const DOMAINS = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']
const CHECK = process.argv.includes('--check')

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
const addSeconds = (iso, seconds) => {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return iso
  const target = new Date(time + seconds * 1000)
  if (String(iso).endsWith('Z')) return target.toISOString()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(target).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`
}

function scenarioList(document) {
  const data = document?.data ?? document ?? {}
  return Array.isArray(data) ? data : Object.values(data)
}

function syncSummary(run, detail) {
  for (const key of ['status', 'progress', 'current_stage', 'elapsed_seconds', 'start_time', 'end_time', 'origin',
    'nodes', 'cpu_cores', 'gpu_count', 'memory_gb', 'core_hours', 'planned_seconds', 'remaining_seconds', 'resource_source']) {
    if (detail[key] !== undefined) run[key] = detail[key]
  }
  run.selected_operator_ids = Array.isArray(detail.selected_operator_ids) ? [...detail.selected_operator_ids] : []
  run.has_result = detail.status === 'success' && detail.has_result === true
  run.has_workflow = true
  if (Array.isArray(detail.metrics?.metrics)) run.metrics_snapshot = structuredClone(detail.metrics.metrics)
}

function alignTimes(detail) {
  if (!detail.start_time) return
  if (['success', 'failed', 'stopped'].includes(detail.status)) {
    detail.end_time = addSeconds(detail.start_time, Number(detail.elapsed_seconds) || 0)
  }
}

let changedFiles = 0
for (const domain of DOMAINS) {
  const operators = readJson(resolve(MOCK_DIR, domain, 'operators.json')).data
  const names = new Set(operators.map(operator => operator.name))
  const scenarios = scenarioList(readJson(resolve(MOCK_DIR, domain, 'scenario-details.json')))
  const scenarioOperators = scenarioId => scenarios.find(item => item.id === scenarioId)?.operators ?? []

  const detailDir = resolve(MOCK_DIR, domain, 'run-details')
  for (const file of existsSync(detailDir) ? readdirSync(detailDir) : []) {
    if (!file.endsWith('.json')) continue
    const path = resolve(detailDir, file)
    const document = readJson(path)
    const detail = document?.data
    if (!detail) continue
    const changed = applyOperatorPlan(domain, detail, operators, scenarioOperators(detail.scenario_id), {
      plannedSeconds: detail.elapsed_seconds,
    }) || needsOperatorPlan(detail, names)
    alignTimes(detail)
    if (changed && !CHECK) writeJson(path, document)
    if (changed) {
      changedFiles += 1
      if (CHECK) console.log(`[check] ${domain}/${file} 需要迁移`)
    }
  }

  const statePath = resolve(RUNTIME_DIR, `${domain}.json`)
  if (!existsSync(statePath)) continue
  const state = readJson(statePath)
  let changed = false
  for (const run of state.runs) {
    const detail = state.details[run.run_id]
    if (!detail) continue
    // 预置记录以 mock-data 中已迁移的详情为准，运行期创建的历史记录按旧算子映射。
    if (detail.origin === 'seed') {
      const seedPath = resolve(MOCK_DIR, domain, 'run-details', `${run.run_id}.json`)
      if (existsSync(seedPath)) {
        const seed = readJson(seedPath)?.data
        if (Array.isArray(seed?.selected_operator_ids) && seed.selected_operator_ids.length) {
          detail.selected_operator_ids = [...seed.selected_operator_ids]
        }
      }
    }
    // 旧版按 tick 压缩的实时任务没有新时钟标记；按已记录的耗时收尾。
    if (detail.origin === 'runtime' && !detail._clock && ['running', 'queued', 'pending'].includes(detail.status)) {
      detail._clock = 'static'
      detail.status = 'success'
      detail.progress = 100
      detail.current_stage = 'completed'
      if (detail.start_time) detail.end_time = addSeconds(detail.start_time, detail.elapsed_seconds)
    }
    const migrated = applyOperatorPlan(domain, detail, operators, scenarioOperators(detail.scenario_id), {
      plannedSeconds: detail.elapsed_seconds,
      realtime: detail._clock === 'realtime',
    }) || needsOperatorPlan(detail, names)
    alignTimes(detail)
    syncSummary(run, detail)
    if (migrated) changed = true
  }
  if (changed && !CHECK) {
    writeJson(statePath, state)
    changedFiles += 1
  }
  console.log(`[migrate] ${domain}: ${state.runs.length} 条运行记录${changed ? (CHECK ? ' 需要迁移' : ' 已更新') : ' 无需更新'}`)
}

console.log(CHECK
  ? `[check] 共 ${changedFiles} 个文件需要迁移（算子计划版本 ${OPERATOR_PLAN_VERSION}）`
  : `[migrate] 完成，更新 ${changedFiles} 个文件（算子计划版本 ${OPERATOR_PLAN_VERSION}）`)
