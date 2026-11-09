/**
 * 算子运行环境与资源规划。
 *
 * 1. 运行环境以平台函数注册示例中的真实 runtime 为准：
 *    - `.sif` 镜像 → Singularity；
 *    - 镜像地址（hub...:tag / local/...:tag）→ Docker；
 *    - `runtimeType=instance` 是平台部署方式，底层仍可能是 Singularity 镜像。
 * 2. 工作流节点上的 CPU / GPU / 内存 / 累计核时全部来自所选算子，
 *    不再使用运行记录里写死的整机分配值。
 * 3. 历史运行记录里的旧算子按 LEGACY_OPERATOR_MAP 迁移到当前算子库。
 */
import { buildOperatorWorkflow } from './workflow-engine.js'

export const OPERATOR_PLAN_VERSION = 4

/** 旧版模拟算子 id → 当前算子库 id。同一领域内按语义就近替换。 */
export const LEGACY_OPERATOR_MAP = {
  'fd-wave-solver': 'supg',
  'fem-pde-solver': 'supg',
  'nonlinear-solver': 'supg',
  'fft-operator': 'uzawa',
  'sparse-matrix': 'citcoms-regional',
  'crash-solver': 'structural-thermal-load',
  'structural-mechanics': 'structural-thermal-load',
  'fatigue-analysis': 'structural-thermal-load',
  'ai-train-megatron': 'megatron-core',
  'ai-train-pinn': 'pytorch-ddp',
  'ai-eval-perplexity': 'transformers-trainer',
  'ai-eval-pinn': 'lightgbm',
  'consensus-control': 'incompressible-driftflux',
  'path-planning': 'potential-foam',
  'collision-detection': 'check-mesh',
  'molecular-docking': 'molecular-docking-gpu',
  'score-merge': 'pose-energy-extraction',
  'admet-predict': 'reasonability-assessment',
  'property-report': 'reasonability-assessment',
  'band-dos-post': 'symtopo-band',
  'scf-solver': 'vasp-dft',
  'high-throughput-runner': 'crystalformer-sample',
}

const DEFAULT_PLAN_SECONDS = 240
const MIN_PLAN_SECONDS = 240
const MAX_PLAN_SECONDS = 900

/** 运行环境归类：真实 runtime 优先于平台 runtimeType。 */
export function resolveRuntime(operator = {}) {
  const runtimeType = String(operator.runtime_type || '').toLowerCase()
  const deploymentType = String(operator.deployment_type || '').toLowerCase()
  const rawType = runtimeType || deploymentType
  const runtime = String(operator.runtime || '')
  const image = String(operator.image || '')
  const isSif = /\.sif(?:\s|$)/i.test(runtime) || /\.sif(?:\s|$)/i.test(image)
  const looksDocker = /^(?:hub\.|local\/|docker:)/i.test(runtime)
    || /:[\w][\w.-]*$/.test(runtime)
    || rawType === 'docker'
    || rawType === 'docker-run'
  let kind = 'container'
  if (isSif || rawType === 'singularity') kind = 'singularity'
  else if (looksDocker) kind = 'docker'
  else if (rawType === 'instance') kind = 'instance'

  const label = kind === 'singularity'
    ? 'Singularity'
    : kind === 'docker'
      ? 'Docker'
      : kind === 'instance'
        ? '平台实例'
        : '容器'
  const deployment = deploymentType === 'instance' || rawType === 'instance'
    ? '平台实例'
    : deploymentType === 'docker-run' || rawType === 'docker-run'
      ? 'Docker 运行'
      : ''
  return { kind, label, deployment }
}

/** 算子声明的资源；CPU 至少按单核调用计，内存未知时保持 0 并在界面显示“按需”。 */
export function operatorResources(operator = {}) {
  const cpu = Number(operator.cpu_cores) > 0 ? Number(operator.cpu_cores) : 1
  const gpu = Number(operator.gpu_count) > 0 ? Number(operator.gpu_count) : 0
  const memory = Number(operator.memory_mb) > 0 ? Number(operator.memory_mb) : 0
  return { cpu_cores: cpu, gpu_count: gpu, memory_mb: memory }
}

/** 按算子规模估算演示计划总时长；实时进度严格按这个总时长推进。 */
export function estimatePlanSeconds(operators) {
  const cpu = operators.reduce((sum, operator) => sum + operatorResources(operator).cpu_cores, 0)
  const gpu = operators.reduce((sum, operator) => sum + operatorResources(operator).gpu_count, 0)
  const seconds = 120 + 18 * cpu + 45 * gpu + 30 * operators.length
  return Math.max(MIN_PLAN_SECONDS, Math.min(MAX_PLAN_SECONDS, Math.round(seconds)))
}

function nodeWeight(node, operatorByName) {
  if (node.operator_id && operatorByName.has(node.operator_id)) {
    const { cpu_cores, gpu_count } = operatorResources(operatorByName.get(node.operator_id))
    return Math.max(1, cpu_cores) + gpu_count * 4
  }
  return 1
}

/** 按依赖关系做最早开始时间排程；生成各节点的计划区间（秒）。 */
export function buildTimeline(workflow, operatorByName, plannedSeconds) {
  const nodes = new Map(workflow.nodes.map(node => [node.id, node]))
  const incoming = new Map(workflow.nodes.map(node => [node.id, 0]))
  const outgoing = new Map(workflow.nodes.map(node => [node.id, []]))
  for (const edge of workflow.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source).push(edge.target)
  }
  const finish = new Map()
  const queue = workflow.nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id)
  for (const id of queue) finish.set(id, nodeWeight(nodes.get(id), operatorByName))
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]
    for (const target of outgoing.get(id)) {
      const weight = nodeWeight(nodes.get(target), operatorByName)
      finish.set(target, Math.max(finish.get(target) ?? 0, finish.get(id) + weight))
      incoming.set(target, incoming.get(target) - 1)
      if (incoming.get(target) === 0) queue.push(target)
    }
  }
  const rawTotal = Math.max(1, ...workflow.nodes.map(node => finish.get(node.id) ?? 1))
  const scale = plannedSeconds / rawTotal
  const timeline = new Map()
  let maxEnd = 0
  for (const node of workflow.nodes) {
    const weight = nodeWeight(node, operatorByName)
    const end = Math.max(1, Math.round((finish.get(node.id) ?? weight) * scale))
    const start = Math.max(0, Math.round((finish.get(node.id) - weight) * scale))
    timeline.set(node.id, { start: Math.min(start, end - 1), end, duration: Math.max(1, end - start) })
    maxEnd = Math.max(maxEnd, end)
  }
  // 舍入后把最晚节点对齐到计划总时长，避免进度条提前或延后走完。
  if (maxEnd !== plannedSeconds) {
    const fix = plannedSeconds / maxEnd
    for (const [id, item] of timeline) {
      const end = Math.round(item.end * fix)
      const start = Math.round(item.start * fix)
      timeline.set(id, { start: Math.min(start, end - 1), end, duration: Math.max(1, end - start) })
    }
  }
  return { timeline, totalWeight: rawTotal, plannedSeconds }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** 标记等待汇合的已完成分支，供 DAG 展示。 */
export function annotateJoins(workflow) {
  const byId = new Map(workflow.nodes.map(node => [node.id, node]))
  const parents = new Map(workflow.nodes.map(node => [node.id, []]))
  for (const edge of workflow.edges) {
    if (!parents.has(edge.target)) continue
    parents.get(edge.target).push(edge.source)
  }
  for (const node of workflow.nodes) {
    node.waiting_for = []
    node.waiting_at_join = false
  }
  for (const [target, sources] of parents) {
    if (sources.length < 2) continue
    const pending = sources.filter(id => byId.get(id)?.status !== 'success')
    if (!pending.length) continue
    const node = byId.get(target)
    if (node) node.waiting_for = [...pending]
    for (const id of sources) {
      const source = byId.get(id)
      if (source && source.status === 'success') source.waiting_at_join = true
    }
  }
}

function progressAt(slot, elapsed) {
  if (elapsed <= 0) return 0
  return clamp((elapsed - slot.start) / slot.duration * 100, 0, 100)
}

function detailOperatorNames(detail, operatorNames) {
  return [...new Set((Array.isArray(detail.selected_operator_ids) ? detail.selected_operator_ids : [])
    .map(id => operatorNames.has(id) ? id : LEGACY_OPERATOR_MAP[id])
    .filter(id => id && operatorNames.has(id)))]
}

/**
 * 为运行记录建立“当前算子”工作流：节点名称、资源与计划耗时均来自算子库。
 * 返回 true 表示记录被修改。
 */
export function applyOperatorPlan(domain, detail, operators, scenarioOperators = [], options = {}) {
  if (!detail || !Array.isArray(detail.workflow?.nodes)) return false
  const previousNodes = detail.workflow.nodes
  const previousFailed = previousNodes.findIndex(node => ['failed', 'blocked'].includes(node.status))
  const operatorByName = new Map(operators.map(operator => [operator.name, operator]))
  const operatorNames = new Set(operatorByName.keys())
  const scenarioIds = scenarioOperators.map(item => item.id).filter(id => operatorNames.has(id))
  const oldComputeCount = detail.workflow.nodes.filter(node => node.id !== 'prepare' && node.id !== 'post').length
  // 历史记录没有算子选择时，按场景推荐补齐（最多 4 个），保持工作流规模可读。
  const expectedCount = Math.max(1, Math.min(4, scenarioIds.length || oldComputeCount || 4))

  let selected = detailOperatorNames(detail, operatorNames)
  if (!selected.length) selected = scenarioIds.slice(0, expectedCount)
  selected = [...new Set(selected)]
  if (!selected.length) return false

  const chosen = selected.map(name => operatorByName.get(name)).filter(Boolean)
  const nodes = [
    { id: 'prepare', name: '输入数据准备' },
    ...chosen.map((operator, index) => ({ id: `operator-${index}`, operator_id: operator.name, name: operator.title || operator.name })),
    { id: 'post', name: '结果整理与输出' },
  ]
  const workflow = buildOperatorWorkflow(domain, nodes.map(node => ({ ...node })), 1)

  const isRealtime = options.realtime === true
  const plannedSeconds = isRealtime
    ? Math.max(MIN_PLAN_SECONDS, Math.min(MAX_PLAN_SECONDS, Number(options.plannedSeconds) || estimatePlanSeconds(chosen)))
    : Math.max(1, Number(options.plannedSeconds ?? detail.planned_seconds ?? detail.elapsed_seconds) || DEFAULT_PLAN_SECONDS)
  const { timeline } = buildTimeline(workflow, operatorByName, plannedSeconds)

  const status = detail.status || 'success'
  const progress = clamp(Number(detail.progress) || 0, 0, 100)
  const elapsed = Math.max(0, Number(detail.elapsed_seconds) || 0)
  const runElapsed = status === 'success'
    ? plannedSeconds
    : status === 'queued' || status === 'pending'
      ? 0
      : isRealtime
        ? Math.min(plannedSeconds, elapsed)
        : Math.min(plannedSeconds, plannedSeconds * progress / 100)

  let failedIndex = -1
  if (status === 'failed') {
    const oldIndex = previousFailed
    failedIndex = oldIndex > 0 ? Math.min(chosen.length - 1, oldIndex - 1) : chosen.length - 1
  }
  if (['running', 'stopped', 'failed'].includes(status) && !isRealtime) {
    detail.elapsed_seconds = Math.round(runElapsed)
  }

  const totals = { cpu: 0, gpu: 0, memory: 0, coreHours: 0 }
  for (const node of workflow.nodes) {
    const slot = timeline.get(node.id) ?? { start: 0, end: plannedSeconds, duration: plannedSeconds }
    const operator = node.operator_id ? operatorByName.get(node.operator_id) : null
    let nodeProgress
    let nodeStatus
    if (status === 'success') {
      nodeProgress = 100
      nodeStatus = 'success'
    } else if (status === 'queued' || status === 'pending') {
      nodeProgress = 0
      nodeStatus = 'pending'
    } else if (status === 'failed') {
      if (node.id === 'post') {
        nodeProgress = 0
        nodeStatus = 'blocked'
      } else if (node.operator_id) {
        const index = Number(node.id.replace('operator-', ''))
        nodeProgress = index <= failedIndex ? 100 : 0
        nodeStatus = index < failedIndex ? 'success' : index === failedIndex ? 'failed' : 'blocked'
      } else {
        nodeProgress = 100
        nodeStatus = 'success'
      }
    } else {
      nodeProgress = progressAt(slot, runElapsed)
      nodeStatus = nodeProgress >= 100 ? 'success' : nodeProgress > 0 || runElapsed >= slot.start ? 'running' : 'pending'
    }
    const nodeElapsed = Math.round(slot.duration * nodeProgress / 100)
    if (operator) {
      const resources = operatorResources(operator)
      const runtime = resolveRuntime(operator)
      const coreHours = resources.cpu_cores * nodeElapsed / 3600
      Object.assign(node, {
        status: nodeStatus,
        progress: Math.round(nodeProgress * 100) / 100,
        elapsed_seconds: nodeElapsed,
        core_hours: Math.round(coreHours * 100) / 100,
        operator_name: operator.name,
        operator_title: operator.title || operator.name,
        runtime_type: runtime.kind,
        runtime_label: runtime.label,
        runtime_deployment: runtime.deployment,
        runtime_detail: operator.runtime || operator.image || '',
        cpu_cores: resources.cpu_cores,
        gpu_count: resources.gpu_count,
        memory_mb: resources.memory_mb,
        memory_gb: Math.round(resources.memory_mb / 1024 * 10) / 10,
        resource_source: 'operator',
        planned_start_seconds: slot.start,
        planned_seconds: slot.duration,
      })
      totals.cpu += resources.cpu_cores
      totals.gpu += resources.gpu_count
      totals.memory += resources.memory_mb
      totals.coreHours += coreHours
    } else {
      Object.assign(node, {
        status: nodeStatus,
        progress: Math.round(nodeProgress * 100) / 100,
        elapsed_seconds: nodeElapsed,
        core_hours: 0,
        resource_source: 'none',
        planned_start_seconds: slot.start,
        planned_seconds: slot.duration,
      })
    }
  }

  const overall = status === 'success' ? 100
    : status === 'queued' || status === 'pending' ? 0
      : Math.min(99, Math.round(runElapsed / plannedSeconds * 100))

  const operatorNodeCount = workflow.nodes.filter(node => node.operator_id).length
  annotateJoins(workflow)
  detail.workflow = workflow
  detail.selected_operator_ids = selected
  detail.nodes = operatorNodeCount
  detail.cpu_cores = totals.cpu
  detail.gpu_count = totals.gpu
  detail.memory_gb = Math.round(totals.memory / 1024 * 10) / 10
  detail.core_hours = Math.round(totals.coreHours * 100) / 100
  detail.resource_source = 'operator'
  detail.progress = overall
  detail.planned_seconds = plannedSeconds
  detail.remaining_seconds = status === 'success' ? 0 : Math.max(0, plannedSeconds - Math.round(runElapsed))
  detail._operator_version = OPERATOR_PLAN_VERSION
  if (status === 'success') detail.elapsed_seconds = plannedSeconds
  const running = workflow.nodes.filter(node => node.status === 'running')
  if (status === 'success') detail.current_stage = 'completed'
  else if (status === 'failed') detail.current_stage = '执行失败'
  else if (status === 'stopped') {
    detail.current_stage = '已停止'
    for (const node of running) node.status = 'stopped'
  }
  else if (status === 'queued' || status === 'pending') detail.current_stage = '排队等待'
  else detail.current_stage = running.length ? running.map(node => node.name).join('、') : '等待依赖'
  return true
}

/** 判断当前记录是否仍引用旧算子或缺少算子资源，需要迁移。 */
export function needsOperatorPlan(detail, operatorNames) {
  if (!detail) return false
  if (detail._operator_version !== OPERATOR_PLAN_VERSION) return true
  const ids = Array.isArray(detail.selected_operator_ids) ? detail.selected_operator_ids : []
  if (!ids.length || ids.some(id => !operatorNames.has(id))) return true
  return (detail.workflow?.nodes ?? []).some(node => node.operator_id && !operatorNames.has(node.operator_id))
}
