import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scenarioMetrics } from './scenario-metrics.js'
import { createDatasetFiles } from './dataset-files.js'
import { advanceWorkflow, buildOperatorWorkflow } from './workflow-engine.js'

export const EXPERIENCE_DOMAINS = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']
const PREFIXES = ['GEO', 'LLM', 'AUTO', 'UAV', 'DRUG', 'DFT']
const TICK_MS = 1300
const copy = value => structuredClone(value)
const envelope = data => ({ code: 200, message: 'success', data })
const error = (message, code = 400) => ({ code, message, data: null })

// Secondary scenarios have their own scientific stages, rather than borrowing
// the first scenario's workflow. Newly submitted runs use the selected operators.
const SCENARIO_STAGES = {
  'tectonic-evolution': ['岩石圈数据准备', '网格划分', '热力学耦合求解', '构造演化分析'],
  'pinn-acceleration': ['物理约束准备', '求解域采样', 'PINN并行训练', '预测误差评估'],
  'fatigue-life': ['载荷谱准备', '应力响应计算', '疲劳损伤累积', '寿命评估'],
  'path-planning': ['环境地图准备', '航迹搜索', '避障检测', '路径评估'],
  'admet-prediction': ['分子数据准备', '分子描述符计算', 'ADMET性质预测', '风险报告生成'],
  'high-throughput-screening': ['材料结构准备', '批量结构弛豫', '批量自洽场计算', '候选材料筛选'],
}

function chain(nodes) {
  return { nodes, edges: nodes.slice(1).map((node, i) => ({ source: nodes[i].id, target: node.id })) }
}

export function createExperienceStore({ dataDir, runtimeDir, now = Date.now }) {
  const files = createDatasetFiles({ dataDir, runtimeDir })
  const states = new Map()
  const readSeed = path => {
    try { return JSON.parse(readFileSync(resolve(dataDir, path), 'utf8')).data } catch { return null }
  }
  const operators = domain => readSeed(`${domain}/operators.json`) ?? []
  const save = (domain, state) => {
    mkdirSync(runtimeDir, { recursive: true })
    const path = resolve(runtimeDir, `${domain}.json`)
    writeFileSync(`${path}.tmp`, JSON.stringify(state))
    renameSync(`${path}.tmp`, path)
  }

  function useDefault(domain, dataset) {
    const file = files.defaultFile(domain, dataset)
    if (!file) return false
    const preview = files.inspect(domain, dataset, readFileSync(file.path), file.name)
    Object.assign(dataset, { input_source: 'default', uploaded: true, status: 'ready', source: '默认数据', size_bytes: preview.size_bytes, grid: preview.summary })
    return true
  }

  function stateFor(domain) {
    if (states.has(domain)) return states.get(domain)
    const path = resolve(runtimeDir, `${domain}.json`)
    if (existsSync(path)) {
      const state = JSON.parse(readFileSync(path, 'utf8'))
      for (const dataset of state.datasets) {
        if (dataset.builtin) { dataset.input_source = 'builtin'; continue }
        if (files.stored(domain, dataset)) { dataset.input_source = 'upload'; continue }
        if (dataset.upload_file || dataset.input_source === 'upload') {
          dataset.input_source = 'upload'
          dataset.uploaded = false
          dataset.imported = false
          dataset.status = 'pending'
          delete dataset.upload_file
        } else {
          if (dataset.input_source !== 'default') dataset.imported = false
          useDefault(domain, dataset)
        }
      }
      for (const run of state.runs) {
        const detail = state.details[run.run_id]
        // Completed simulated runtime records can adopt the dependency layout
        // without changing execution history or restarting an active task.
        if (detail.origin === 'runtime' && detail.status === 'success' && !detail._workflow_version) {
          detail.workflow = buildOperatorWorkflow(domain, detail.workflow.nodes, detail._ticks_per_node || 5)
          detail._workflow_version = 2
        }
        const metrics = scenarioMetrics(detail.scenario_id, detail.metrics?.domain_data, detail.progress)
        if (metrics) detail.metrics.metrics = metrics
        syncSummary(run, detail)
      }
      states.set(domain, state)
      return state
    }
    const runs = readSeed(`${domain}/runs.json`) ?? []
    const datasets = readSeed(`${domain}/datasets.json`) ?? []
    const originals = new Map(runs.map(run => [run.run_id, readSeed(`${domain}/run-details/${run.run_id}.json`)]))
    const templates = {}
    for (const run of runs) {
      const detail = originals.get(run.run_id)
      if (detail?.metrics?.domain_data && (!templates[run.scenario_id] || run.status === 'success')) {
        templates[run.scenario_id] = copy(detail)
      }
    }
    for (const scenario of new Set(datasets.map(d => d.scenario_id))) {
      const scope = datasets.filter(d => d.scenario_id === scenario)
      const builtin = scope.find(d => d.format === 'HDF5') ?? scope[0]
      for (const dataset of scope) {
        dataset.builtin = dataset.format === 'HDF5' || dataset === builtin
        dataset.uploaded = dataset.builtin
        dataset.imported = dataset.uploaded && dataset.imported === true
        dataset.source_type = 'simulated'
        if (dataset._pristine?.size_bytes) dataset.size_bytes = dataset._pristine.size_bytes
        if (dataset.uploaded) dataset.status = 'ready'
        if (dataset.builtin) dataset.input_source = 'builtin'
        else useDefault(domain, dataset)
      }
      // Include a complete result and a history-only success in every scenario.
      const completed = runs.filter(r => r.scenario_id === scenario && r.status === 'success')
      if (!completed.some(r => r.has_detail && originals.get(r.run_id)) && completed[0] && templates[scenario]) {
        completed[0].has_detail = true
        originals.set(completed[0].run_id, copy(templates[scenario]))
      }
    }
    const details = {}
    for (const run of runs) {
      const original = originals.get(run.run_id)
      const template = original ?? templates[run.scenario_id] ?? {}
      const detail = { ...copy(template), ...copy(run), origin: 'seed' }
      detail.has_result = !!original?.metrics?.domain_data && run.has_detail === true
      detail.workflow = copy(template.workflow ?? chain([{ id: 'prepare', name: '数据准备' }, { id: 'compute', name: '计算执行' }, { id: 'post', name: '结果整理' }]))
      if (SCENARIO_STAGES[run.scenario_id]) {
        detail.workflow = chain(SCENARIO_STAGES[run.scenario_id].map((name, i) => ({ id: `stage-${i}`, name, cluster_id: run.cluster_id })))
      }
      detail.metrics = copy(original?.metrics ?? { metrics: run.metrics_snapshot ?? [] })
      if (!detail.has_result) detail.artifacts = []
      const progress = run.status === 'success' ? 100 : Math.min(99, Math.max(0, Number(run.progress) || 0))
      let remaining = progress * detail.workflow.nodes.length
      for (const node of detail.workflow.nodes) {
        node.progress = Math.min(100, remaining)
        remaining -= node.progress
        node.status = node.progress >= 100 ? 'success' : node.progress > 0 ? run.status : 'pending'
      }
      detail.progress = progress
      const metrics = scenarioMetrics(detail.scenario_id, detail.metrics?.domain_data, progress)
      if (metrics) detail.metrics.metrics = metrics
      detail._last_tick = now()
      detail._queue_ticks = 0
      detail._tick_seconds = 120
      detail._ticks_per_node = 5
      details[run.run_id] = detail
      syncSummary(run, detail)
    }
    const state = { datasets, runs, details, templates }
    states.set(domain, state)
    save(domain, state)
    return state
  }

  function syncSummary(run, detail) {
    for (const key of ['status', 'progress', 'current_stage', 'elapsed_seconds', 'start_time', 'end_time', 'origin']) run[key] = detail[key]
    detail.core_hours = Number(((detail.cpu_cores || 0) * (detail.elapsed_seconds || 0) / 3600).toFixed(1))
    run.core_hours = detail.core_hours
    run.has_result = detail.status === 'success' && detail.has_result === true
    run.has_workflow = true
    run.metrics_snapshot = copy(detail.metrics?.metrics ?? [])
  }

  function tick(detail, tickTime) {
    if (['queued', 'pending'].includes(detail.status)) {
      detail._queue_ticks += 1
      if (detail._queue_ticks >= 4) {
        detail.status = 'running'
        detail.start_time = new Date(tickTime).toISOString()
      }
      return
    }
    const nodes = detail.workflow.nodes
    const allDone = advanceWorkflow(detail.workflow, detail._ticks_per_node, detail._tick_seconds)
    detail.progress = allDone ? 100 : Math.min(99, Math.round(nodes.reduce((sum, n) => sum + n.progress, 0) / nodes.length))
    detail.elapsed_seconds += detail._tick_seconds
    const failed = nodes.some(n => ['failed', 'blocked'].includes(n.status))
    const active = nodes.filter(n => n.status === 'running')
    detail.status = failed ? 'failed' : allDone ? 'success' : 'running'
    detail.current_stage = failed ? '执行失败' : allDone ? 'completed' : active.length > 1 ? `并行执行 · ${active.length} 个节点` : active[0]?.name ?? '等待依赖'
    if (allDone || failed) detail.end_time = new Date(tickTime).toISOString()
    if (detail.metrics) {
      detail.metrics.progress = detail.progress
      for (const metric of detail.metrics.metrics ?? []) {
        if (metric.total && ['time_step', 'step', 'simulation_step', 'scf_iteration', 'completed_compounds', 'kpoint_progress'].includes(metric.name)) metric.value = Math.round(metric.total * detail.progress / 100)
        if (['cpu_utilization', 'gpu_utilization'].includes(metric.name)) metric.value = allDone ? 0 : 65 + Math.round(detail.progress / 4)
      }
      const metrics = scenarioMetrics(detail.scenario_id, detail.metrics.domain_data, detail.progress)
      if (metrics) detail.metrics.metrics = metrics
    }
  }

  function advance(domain, state) {
    let dirty = false
    for (const run of state.runs) {
      const detail = state.details[run.run_id]
      if (!['running', 'queued', 'pending'].includes(detail.status)) continue
      const ticks = Math.max(0, Math.floor((now() - detail._last_tick) / TICK_MS))
      if (!ticks) continue
      // A complete demo needs fewer than 200 ticks; long absences stay bounded.
      for (let i = 0; i < Math.min(ticks, 500) && ['running', 'queued', 'pending'].includes(detail.status); i++) tick(detail, detail._last_tick + (i + 1) * TICK_MS)
      detail._last_tick += ticks * TICK_MS
      syncSummary(run, detail)
      dirty = true
    }
    if (dirty) save(domain, state)
  }

  function publicDetail(detail) {
    const result = copy(detail)
    result.core_hours = Number(((result.cpu_cores || 0) * (result.elapsed_seconds || 0) / 3600).toFixed(1))
    for (const key of Object.keys(result)) if (key.startsWith('_')) delete result[key]
    for (const node of result.workflow?.nodes ?? []) delete node._elapsed_ticks
    result.has_result = result.status === 'success' && result.has_result === true
    if (!result.has_result) {
      delete result.domain_data
      result.artifacts = []
      result.metrics = { progress: result.progress, metrics: result.metrics?.metrics ?? [] }
    }
    return result
  }

  /**
   * 算力中心资源状态以超算平台「全局资源视图」同步下来的数据为准，这里只刷新更新时间；
   * 不再用前端导入的数据集数量改写 CPU / GPU 占用，避免覆盖平台下发的运行任务与排队等待。
   */
  function clusters() {
    const items = copy(readSeed('multicenter/clusters.json') ?? [])
    for (const cluster of items) cluster.updated_at = new Date(now()).toISOString()
    return items
  }

  function read(parts) {
    const [domain, resource, id, sub] = parts
    if (domain === 'multicenter' && resource === 'clusters') return envelope(clusters())
    if (!EXPERIENCE_DOMAINS.includes(domain) || !['datasets', 'runs'].includes(resource)) return null
    const state = stateFor(domain)
    if (resource === 'datasets') {
      if (!id) return envelope(state.datasets.map(dataset => files.describe(domain, dataset)))
      const dataset = state.datasets.find(item => item.dataset_id === id)
      if (!dataset) return error('数据集不存在', 404)
      if (sub === 'preview') {
        const file = files.current(domain, dataset)
        if (!file) return error('请先上传文件后再预览', 404)
        try { return envelope(files.inspect(domain, dataset, readFileSync(file.path), file.name)) }
        catch (cause) { return error(cause.message) }
      }
      return envelope(files.describe(domain, dataset))
    }
    advance(domain, state)
    if (!id) return envelope(copy(state.runs))
    if (!state.details[id]) return error('运行记录不存在', 404)
    const detail = publicDetail(state.details[id])
    return envelope(sub ? detail[sub] : detail)
  }

  function write(method, parts, body) {
    const [domain, resource, id, action, verb] = parts
    if (!EXPERIENCE_DOMAINS.includes(domain)) return null
    const state = stateFor(domain)
    if (resource === 'datasets' && (method === 'DELETE' || (method === 'POST' && action === 'upload'))) {
      const dataset = state.datasets.find(d => d.dataset_id === id)
      if (!dataset) return error('数据集不存在', 404)
      if (dataset.builtin) return error('内置数据无需上传，不能移除或替换')
      const previous = copy(dataset)
      if (method === 'POST') {
        if (!Buffer.isBuffer(body?.buffer)) return error('请选择并上传本地文件')
        try {
          dataset.upload_file = files.save(domain, dataset, body.buffer, body.file_name)
        } catch (cause) { return error(cause.message) }
        dataset.size_bytes = dataset.upload_file.size_bytes
        dataset.grid = dataset.upload_file.summary
        dataset.source = '用户上传'
        dataset.input_source = 'upload'
      } else {
        delete dataset.upload_file
        if (!useDefault(domain, dataset)) {
          Object.assign(dataset, previous)
          return error('默认数据不可用', 404)
        }
      }
      dataset.uploaded = true
      dataset.imported = false
      dataset.status = dataset.uploaded ? 'ready' : 'pending'
      dataset.updated_at = new Date(now()).toISOString()
      try { save(domain, state) }
      catch (cause) {
        if (method === 'POST') files.remove(domain, dataset)
        Object.keys(dataset).forEach(key => delete dataset[key])
        Object.assign(dataset, previous)
        return error('文件状态保存失败，请重试', 500)
      }
      files.remove(domain, previous)
      return envelope(files.describe(domain, dataset))
    }
    if (resource === 'scenarios' && method === 'POST' && action === 'import') {
      const scope = state.datasets.filter(d => d.scenario_id === id)
      if (!scope.length) return error('场景不存在', 404)
      const uploaded = scope.filter(d => d.uploaded)
      if (!uploaded.length) return error('请先上传数据')
      const newly = uploaded.filter(d => !d.imported)
      newly.forEach(d => { d.imported = true })
      save(domain, state)
      return envelope({ status: newly.length ? 'imported' : 'already_all', message: newly.length ? `本次导入 ${newly.length} 项数据，可前往资源调度` : '当前就绪数据均已导入', newly_count: newly.length, total_imported: uploaded.length, total_uploaded: uploaded.length })
    }
    if (resource === 'scenarios' && method === 'POST' && action === 'operators' && verb === 'submit') {
      const template = state.templates[id]
      if (!template) return error('场景不存在或缺少结果模板', 404)
      const ids = [...new Set(Array.isArray(body?.operator_ids) ? body.operator_ids : [])]
      const available = operators(domain)
      const chosen = ids.map(name => available.find(o => o.name === name && ['available', 'registered'].includes(o.status)))
      if (!ids.length || chosen.some(o => !o)) return error('请选择有效且可用的算子')
      const prefix = PREFIXES[EXPERIENCE_DOMAINS.indexOf(domain)]
      const seq = 1 + Math.max(0, ...state.runs.map(r => Number(r.run_id.split('-').at(-1)) || 0))
      const runId = `${prefix}-${new Date(now()).toISOString().slice(0, 10).replaceAll('-', '')}-${String(seq).padStart(4, '0')}`
      const scenarios = readSeed(`${domain}/scenario-details.json`) ?? []
      const scenario = Object.values(scenarios).find(s => s.id === id) ?? scenarios[id]
      const nodes = [{ id: 'prepare', name: '输入数据准备' }, ...chosen.map((op, i) => ({ id: `operator-${i}`, name: scenario?.operators?.find(ref => ref.id === op.name)?.name ?? op.display_name ?? op.name, operator_id: op.name })), { id: 'post', name: '结果整理与输出' }]
      const cpu = chosen.reduce((sum, op) => sum + (op.cpu_cores || 0), 0)
      const ticksPerNode = Math.min(6, 3 + Math.floor(cpu / 256))
      const workflow = buildOperatorWorkflow(domain, nodes.map((node, i) => ({ ...node, progress: 0, status: i === 0 ? 'running' : 'pending', cluster_id: template.cluster_id })), ticksPerNode)
      const detail = { ...copy(template), run_id: runId, domain, scenario_id: id, status: 'running', progress: 0,
        execution_mode: 'simulated', source_type: 'simulated', origin: 'runtime', has_detail: true, has_result: true,
        job_id: String(now()).slice(-8) + seq, start_time: new Date(now()).toISOString(), end_time: '', elapsed_seconds: 0,
        selected_operator_ids: ids, current_stage: '输入数据准备',
        _last_tick: now(), _ticks_per_node: ticksPerNode, _tick_seconds: Math.min(600, 90 + cpu), _queue_ticks: 0, _workflow_version: 2,
        workflow,
        logs: { lines: [], next_offset: 0, has_more: false },
      }
      detail.metrics.progress = 0
      for (const metric of detail.metrics.metrics ?? []) {
        if (['time_step', 'step', 'simulation_step', 'scf_iteration', 'completed_compounds', 'kpoint_progress', 'cpu_utilization', 'gpu_utilization'].includes(metric.name)) metric.value = 0
      }
      const initialMetrics = scenarioMetrics(id, detail.metrics.domain_data, 0)
      if (initialMetrics) detail.metrics.metrics = initialMetrics
      state.details[runId] = detail
      const run = { ...copy(state.runs.find(r => r.scenario_id === id)), run_id: runId, job_id: detail.job_id, has_detail: true, selected_operator_ids: ids }
      syncSummary(run, detail)
      state.runs.unshift(run)
      save(domain, state)
      return envelope({ run_id: runId, workflow: copy(detail.workflow), progress: 0, selected_operator_ids: ids })
    }
    if (resource === 'runs' && method === 'POST' && action === 'advance') {
      // Compatibility endpoint; elapsed time, never request count, drives progress.
      return read([domain, 'runs', id])
    }
    return null
  }
  function file(domain, id, kind) {
    if (!EXPERIENCE_DOMAINS.includes(domain)) return null
    const dataset = stateFor(domain).datasets.find(item => item.dataset_id === id)
    if (!dataset || dataset.builtin) return null
    return kind === 'sample' ? files.defaultFile(domain, dataset) : files.current(domain, dataset)
  }
  return { read, write, operators, file }
}
