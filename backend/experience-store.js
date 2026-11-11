import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scenarioMetrics } from './scenario-metrics.js'
import { createDatasetFiles } from './dataset-files.js'
import { applyOperatorPlan, annotateJoins, estimatePlanSeconds, needsOperatorPlan, propagateTerminal } from './operator-plan.js'

export const EXPERIENCE_DOMAINS = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']
const PREFIXES = ['GEO', 'LLM', 'AUTO', 'UAV', 'DRUG', 'DFT']
const copy = value => structuredClone(value)
const envelope = data => ({ code: 200, message: 'success', data })
const error = (message, code = 400) => ({ code, message, data: null })
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
  const scenarioDetails = domain => {
    const document = readSeed(`${domain}/scenario-details.json`)
    const data = document?.data ?? document ?? {}
    return Array.isArray(data) ? data : Object.values(data)
  }
  const scenarioOperators = (domain, scenarioId) => {
    const scenario = scenarioDetails(domain).find(item => item?.id === scenarioId)
    return scenario?.operators ?? []
  }
  /** 历史记录迁移：旧算子换成当前算子库，并按算子信息生成节点资源。 */
  const ensureOperatorPlan = (domain, detail, options = {}) => {
    if (!detail) return false
    const list = operators(domain)
    const names = new Set(list.map(operator => operator.name))
    if (!needsOperatorPlan(detail, names) && !options.force) return false
    const changed = applyOperatorPlan(domain, detail, list, scenarioOperators(domain, detail.scenario_id), {
      plannedSeconds: detail.elapsed_seconds,
      ...options,
    })
    return changed
  }
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
        if (!detail) continue
        // 旧版按 tick 压缩的实时任务没有新时钟标记；按已记录的耗时收尾，避免永久停在运行中。
        if (detail.origin === 'runtime' && !detail._clock && ['running', 'queued', 'pending'].includes(detail.status)) {
          detail._clock = 'static'
          detail.status = 'success'
          detail.progress = 100
          detail.current_stage = 'completed'
          if (detail.start_time) detail.end_time = addSeconds(detail.start_time, detail.elapsed_seconds)
        }
        ensureOperatorPlan(domain, detail, detail._clock === 'realtime'
          ? { realtime: true, plannedSeconds: detail.planned_seconds }
          : { plannedSeconds: detail.elapsed_seconds })
        // 历史记录的起止时间与累计运行时间保持一致；实时任务由推进逻辑维护。
        if (detail._clock !== 'realtime' && detail.start_time && ['success', 'failed', 'stopped'].includes(detail.status)) {
          detail.end_time = addSeconds(detail.start_time, detail.elapsed_seconds)
        }
        if (detail._clock !== 'realtime') {
          if (detail.status === 'success') detail.progress = 100
          normalizeWorkflow(detail)
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
      detail.progress = progress
      if (run.status === 'success') detail.status = 'success'
      // 预置记录是历史任务；已开始且耗时已过期的运行中记录按完成处理，避免永久停在运行中。
      if (run.status === 'running' && detail.start_time) {
        detail.status = 'success'
        detail.progress = 100
        detail.current_stage = 'completed'
        detail.end_time = addSeconds(detail.start_time, detail.elapsed_seconds)
      }
      ensureOperatorPlan(domain, detail, { plannedSeconds: detail.elapsed_seconds })
      detail._clock = 'static'
      if (detail.start_time && ['success', 'failed', 'stopped'].includes(detail.status)) {
        detail.end_time = addSeconds(detail.start_time, detail.elapsed_seconds)
      }
      // 历史记录：DAG 节点状态必须与任务终态一致，节点数也要与图上数量一致
      normalizeWorkflow(detail)
      const metrics = scenarioMetrics(detail.scenario_id, detail.metrics?.domain_data, detail.progress)
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
    for (const key of ['status', 'progress', 'current_stage', 'elapsed_seconds', 'start_time', 'end_time', 'origin',
      'nodes', 'cpu_cores', 'gpu_count', 'memory_gb', 'core_hours', 'planned_seconds', 'remaining_seconds', 'resource_source']) {
      run[key] = detail[key]
    }
    run.selected_operator_ids = Array.isArray(detail.selected_operator_ids) ? [...detail.selected_operator_ids] : []
    run.has_result = detail.status === 'success' && detail.has_result === true
    run.has_workflow = true
    run.metrics_snapshot = copy(detail.metrics?.metrics ?? [])
  }

  /**
   * 让 DAG 节点状态与任务状态保持一致。
   *
   * 历史记录的 workflow 来自同类模板（可能是一条运行中的记录），合并后会出现
   * 「任务已成功、图上还在跑」的矛盾。这里按任务终态统一收口：
   * - success：所有节点已完成，进度 100
   * - failed / stopped：失败或停止之前的节点视为已完成，命中的节点保留原状态，其余等待
   * - 运行中（running/queued/pending）：只补默认字段，交给实时推进逻辑
   * 同时把节点数量写回 detail.nodes，避免「工作节点 8 个」和图上 3 个节点打架。
   */
  function normalizeWorkflow(detail) {
    const nodes = detail.workflow?.nodes ?? []
    if (!nodes.length) return
    const terminal = ['success', 'failed', 'stopped'].includes(detail.status)

    if (detail.status === 'success') {
      for (const node of nodes) {
        node.status = 'success'
        node.progress = 100
      }
    } else if (terminal) {
      // 按图的上游/下游收口：失败节点之前（祖先）已完成，之后（后代）未开始，
      // 与失败分支无关的并行分支保留原状态。以前按下标处理，并行图会错位。
      if (nodes.some(node => ['failed', 'stopped'].includes(node.status))) {
        propagateTerminal(nodes, detail.workflow?.edges ?? [])
      } else {
        const hit = nodes.length - 1
        nodes.forEach((node, index) => {
          if (index < hit) { node.status = 'success'; node.progress = 100 }
          else { node.status = 'failed'; node.progress = Math.min(99, Math.max(1, Number(node.progress) || 100)) }
        })
      }
    } else {
      for (const node of nodes) {
        if (!node.status) node.status = 'pending'
        if (typeof node.progress !== 'number') node.progress = 0
      }
    }

    detail.nodes = nodes.length

    // 总体进度以节点时长为准重新计算，避免「总体 99% 但节点加起来 275%」这种对不上。
    // 只处理失败/停止：成功记录一律 100%，其耗时与总时长沿用原计划，不做回写。
    const totalPlanned = nodes.reduce((sum, node) => sum + (Number(node.planned_seconds) || 0), 0)
    const totalElapsed = nodes.reduce((sum, node) => sum + (Number(node.elapsed_seconds) || 0), 0)
    if (totalPlanned > 0 && terminal && detail.status !== 'success') {
      detail.planned_seconds = Math.round(totalPlanned)
      detail.progress = Math.min(99, Math.max(0, Math.round((totalElapsed / totalPlanned) * 100)))
      detail.elapsed_seconds = Math.round(totalElapsed)
      detail.remaining_seconds = Math.max(0, detail.planned_seconds - detail.elapsed_seconds)
      if (detail.start_time) {
        detail.end_time = new Date(Date.parse(detail.start_time) + detail.elapsed_seconds * 1000).toISOString()
      }
    }
  }

  /**
   * 实时推进：界面耗时和进度条都按墙钟时间计算，不再用固定 tick 压缩演示时长。
   * 每个节点按算子资源排出的计划区间推进；总进度与总时长始终一致。
   */
  function tickRealtime(detail, time) {
    const queuedUntil = detail._queued_until ? Date.parse(detail._queued_until) : 0
    if (['queued', 'pending'].includes(detail.status)) {
      if (!queuedUntil || time < queuedUntil) return
      detail.status = 'running'
      detail.start_time = new Date(queuedUntil).toISOString()
    }
    if (detail.status !== 'running') return
    const started = Date.parse(detail.start_time)
    if (!Number.isFinite(started)) return
    const planned = Math.max(1, Number(detail.planned_seconds) || 1)
    const elapsed = Math.max(0, Math.min(planned, (time - started) / 1000))
    const runSeconds = Math.min(planned, Math.floor(elapsed))
    detail.elapsed_seconds = runSeconds
    detail.remaining_seconds = Math.max(0, planned - runSeconds)

    const nodes = detail.workflow.nodes
    for (const node of nodes) {
      const start = Number(node.planned_start_seconds) || 0
      const duration = Math.max(1, Number(node.planned_seconds) || 1)
      const nodeProgress = Math.min(100, Math.max(0, (elapsed - start) / duration * 100))
      node.progress = Math.round(nodeProgress * 100) / 100
      node.elapsed_seconds = Math.round(duration * nodeProgress / 100)
      node.core_hours = Math.round((Number(node.cpu_cores) || 0) * node.elapsed_seconds / 3600 * 100) / 100
      node.status = nodeProgress >= 100 ? 'success' : elapsed >= start ? 'running' : 'pending'
    }
    annotateJoins(detail.workflow)

    const allDone = nodes.every(node => node.status === 'success')
    // 总进度与墙钟时间严格同步：走完计划总时长才到 100%，不受轮询或节点并行数影响。
    const overall = Math.min(99, Math.floor(runSeconds / planned * 100))
    detail.progress = allDone ? 100 : overall
    detail.core_hours = Math.round(nodes.reduce((sum, node) => sum + (Number(node.core_hours) || 0), 0) * 100) / 100
    const running = nodes.filter(node => node.status === 'running')
    if (allDone) {
      detail.status = 'success'
      detail.progress = 100
      detail.elapsed_seconds = planned
      detail.remaining_seconds = 0
      detail.end_time = new Date(started + planned * 1000).toISOString()
      detail.current_stage = 'completed'
      for (const node of nodes) { node.status = 'success'; node.progress = 100 }
    } else {
      detail.current_stage = running.length ? running.map(node => node.name).join('、') : '等待依赖'
    }
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
      if (!detail || detail._clock !== 'realtime') continue
      if (!['running', 'queued', 'pending'].includes(detail.status)) continue
      const before = `${detail.status}:${detail.progress}:${detail.elapsed_seconds}`
      tickRealtime(detail, now())
      if (`${detail.status}:${detail.progress}:${detail.elapsed_seconds}` !== before) dirty = true
      syncSummary(run, detail)
    }
    if (dirty) save(domain, state)
  }

  /**
   * 实时提交的任务原本没有日志，页面上的「运行日志」会一直空着。
   * 这里按节点状态实时生成时间线日志，让新建任务也有可读的执行记录。
   */
  function synthLogs(detail) {
    const nodes = detail.workflow?.nodes ?? []
    if (!nodes.length) return { next_offset: 0, has_more: false, lines: [] }
    const start = Date.parse(detail.start_time) || now()
    const lines = [{
      seq: 1,
      timestamp: new Date(start).toISOString(),
      level: 'INFO',
      message: `[${detail.cluster_name || detail.cluster_id || '调度中心'}] 任务 ${detail.run_id} 进入队列，等待资源分配`,
    }]
    let seq = 2
    for (const node of nodes) {
      if (node.status === 'pending') break
      const at = new Date(start + (Number(node.planned_start_seconds) || 0) * 1000).toISOString()
      lines.push({ seq: seq++, timestamp: at, level: 'INFO', message: `[${node.cluster_id || detail.cluster_id || '-'}] 开始执行「${node.name}」` })
      if (node.status === 'success') {
        const fin = new Date(start + ((Number(node.planned_start_seconds) || 0) + (Number(node.planned_seconds) || 0)) * 1000).toISOString()
        lines.push({
          seq: seq++,
          timestamp: fin,
          level: 'INFO',
          message: `[${node.cluster_id || detail.cluster_id || '-'}] 「${node.name}」完成，累计 ${Number(node.core_hours || 0).toFixed(2)} 核时`,
        })
      } else if (node.status === 'running') {
        lines.push({
          seq: seq++,
          timestamp: new Date(now()).toISOString(),
          level: 'INFO',
          message: `[${node.cluster_id || detail.cluster_id || '-'}] 「${node.name}」进度 ${Number(node.progress || 0).toFixed(0)}%，已运行 ${Number(node.elapsed_seconds || 0)} 秒`,
        })
      } else if (node.status === 'failed') {
        lines.push({ seq: seq++, timestamp: new Date(now()).toISOString(), level: 'ERROR', message: `[${node.cluster_id || '-'}] 「${node.name}」执行失败` })
      }
    }
    if (detail.status === 'paused') {
      lines.push({ seq: seq++, timestamp: new Date(now()).toISOString(), level: 'WARN', message: '任务已暂停，可再次点击暂停按钮继续执行' })
    }
    return { next_offset: lines.length, has_more: false, lines }
  }

  function publicDetail(detail) {
    const result = copy(detail)
    for (const key of Object.keys(result)) if (key.startsWith('_')) delete result[key]
    for (const node of result.workflow?.nodes ?? []) delete node._elapsed_ticks
    result.server_time = new Date(now()).toISOString()
    result.has_result = result.status === 'success' && result.has_result === true
    if (!result.logs?.lines?.length) result.logs = synthLogs(detail)
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
      const planSeconds = estimatePlanSeconds(chosen)
      const queuedUntil = now() + 5000
      const detail = { ...copy(template), run_id: runId, domain, scenario_id: id, status: 'queued', progress: 0,
        execution_mode: 'simulated', source_type: 'simulated', origin: 'runtime', has_detail: true, has_result: true,
        job_id: String(now()).slice(-8) + seq, start_time: '', end_time: '', elapsed_seconds: 0,
        selected_operator_ids: ids, current_stage: '排队等待', status_note: '',
        _clock: 'realtime', _queued_until: new Date(queuedUntil).toISOString(), _last_tick: now(),
        planned_seconds: planSeconds, remaining_seconds: planSeconds,
        workflow: { nodes: [{ id: 'prepare' }, ...chosen.map((op, i) => ({ id: `operator-${i}`, operator_id: op.name })), { id: 'post' }], edges: [] },
        logs: { lines: [], next_offset: 0, has_more: false },
      }
      applyOperatorPlan(domain, detail, available, scenario?.operators ?? [], { realtime: true, plannedSeconds: planSeconds })
      detail.status = 'queued'
      detail.current_stage = '排队等待'
      detail.elapsed_seconds = 0
      detail.progress = 0
      detail.remaining_seconds = planSeconds
      for (const node of detail.workflow.nodes) { node.status = 'pending'; node.progress = 0; node.elapsed_seconds = 0; node.core_hours = 0 }
      detail.metrics.progress = 0
      for (const metric of detail.metrics.metrics ?? []) {
        if (['time_step', 'step', 'simulation_step', 'scf_iteration', 'completed_compounds', 'kpoint_progress', 'cpu_utilization', 'gpu_utilization'].includes(metric.name)) metric.value = 0
      }
      const initialMetrics = scenarioMetrics(id, detail.metrics.domain_data, 0)
      if (initialMetrics) detail.metrics.metrics = initialMetrics
      state.details[runId] = detail
      const run = { ...copy(state.runs.find(r => r.scenario_id === id)), run_id: runId, job_id: detail.job_id, has_detail: true }
      syncSummary(run, detail)
      state.runs.unshift(run)
      save(domain, state)
      return envelope({ run_id: runId, workflow: copy(detail.workflow), progress: 0, selected_operator_ids: ids, planned_seconds: planSeconds })
    }
    if (resource === 'runs' && method === 'POST' && (action === 'pause' || action === 'resume')) {
      const detail = state.details[id]
      if (!detail) return error('运行记录不存在', 404)
      if (action === 'pause') {
        if (!['running', 'queued', 'pending'].includes(detail.status)) return error('当前任务不可暂停')
        detail._paused_status = detail.status
        detail.status = 'paused'
        detail.current_stage = '已暂停'
        // 正在跑的节点一并置为「已暂停」，避免暂停后 DAG 仍显示运行中
        for (const node of detail.workflow?.nodes ?? []) {
          if (node.status === 'running') node.status = 'paused'
        }
        const run = state.runs.find(r => r.run_id === id)
        if (run) syncSummary(run, detail)
      } else {
        if (detail.status !== 'paused') return error('当前任务未暂停')
        const elapsed = Math.max(0, Number(detail.elapsed_seconds) || 0)
        const resumeTo = detail._paused_status === 'queued' ? 'queued' : 'running'
        delete detail._paused_status
        detail.status = resumeTo
        // 恢复时把暂停的节点还原成运行中，继续按墙钟推进
        for (const node of detail.workflow?.nodes ?? []) {
          if (node.status === 'paused') node.status = 'running'
        }
        if (resumeTo === 'running') {
          // 把开始时间整体后移，已运行时长不因暂停而丢失
          detail.start_time = new Date(now() - elapsed * 1000).toISOString()
          detail._clock = 'realtime'
          const running = detail.workflow.nodes.filter(n => n.status === 'running')
          detail.current_stage = running.length ? running.map(n => n.name).join('、') : '继续执行'
        } else {
          detail.current_stage = '排队等待'
        }
        const run = state.runs.find(r => r.run_id === id)
        if (run) syncSummary(run, detail)
      }
      save(domain, state)
      return envelope(publicDetail(detail))
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
