/**
 * 课题五 · 超算互联网应用成果展 —— 本地模拟后端服务
 *
 * 零第三方依赖（Node.js 原生 http 模块），提供 REST API `/api/v1/*`：
 * - GET  ：返回 mock-data/ 下的 JSON 数据（统一响应结构 { code, message, data, timestamp }）；
 * - POST / PUT / PATCH / DELETE：模拟写操作，回显请求体并返回成功响应，便于前后端接口联通联调。
 *
 * 启动：
 *   node server.js
 * 或：
 *   npm start
 *
 * 环境变量：
 *   BACKEND_HOST  (默认 127.0.0.1)     监听地址
 *   BACKEND_PORT  (默认 3001)          监听端口
 *   MOCK_DATA_DIR (默认 ../mock-data)  模拟数据目录
 *
 * 接口前缀统一为 /api/v1，例如：
 *   GET  /api/v1/index                        -> index.json
 *   GET  /api/v1/llm/scenarios                -> llm/scenarios.json
 *   GET  /api/v1/llm/runs                     -> llm/runs.json
 *   GET  /api/v1/llm/runs/LLM-20260811-0001   -> llm/run-details/LLM-20260811-0001.json
 *   GET  /api/v1/multicenter/clusters         -> multicenter/clusters.json
 *   POST /api/v1/llm/runs                     -> 模拟成功响应（回显 body）
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')

const HOST = process.env.BACKEND_HOST || '127.0.0.1'
const PORT = Number(process.env.BACKEND_PORT || 3001)
const MOCK_DATA_DIR = process.env.MOCK_DATA_DIR || resolve(__dirname, '..', 'mock-data')
const UPLOADS_DIR = resolve(MOCK_DATA_DIR, 'uploads')
const REPO_ROOT = resolve(__dirname, '..')
const ARTIFACTS_ROOT = resolve(REPO_ROOT, 'artifacts')
const ARTIFACT_INDEX = resolve(ARTIFACTS_ROOT, 'simulated', 'artifact_index.json')

const API_PREFIX = '/api/v1'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.dat': 'application/octet-stream',
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/** 发送 JSON 响应 */
function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  })
  res.end(body)
}

/** 读取请求体（JSON 优先，解析失败保留原始字符串） */
function readRequestBody(req) {
  return new Promise((resolvePromise) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) return resolvePromise(null)
      try {
        resolvePromise(JSON.parse(raw))
      } catch {
        resolvePromise(String(raw))
      }
    })
    req.on('error', () => resolvePromise(null))
  })
}

/** 读取 mock-data 下相对路径的 JSON 文件；不存在或解析失败返回 null */
function readJson(relPath) {
  const file = resolve(MOCK_DATA_DIR, relPath)
  try {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf-8'))
    }
  } catch {
    /* 忽略单个文件解析失败，按 404 处理 */
  }
  return null
}

/** 解析 artifact_id -> 仓库内相对路径（仅允许 artifacts/ 下文件） */
function resolveArtifactPath(artifactId) {
  if (!artifactId || artifactId.includes('..') || artifactId.includes('/') || artifactId.includes('\\')) {
    return null
  }
  try {
    if (existsSync(ARTIFACT_INDEX)) {
      const index = JSON.parse(readFileSync(ARTIFACT_INDEX, 'utf-8'))
      const entry = index?.artifacts?.[artifactId]
      if (entry?.path) {
        const rel = String(entry.path).replace(/\\/g, '/')
        if (rel.includes('..') || !rel.startsWith('artifacts/')) return null
        const abs = resolve(REPO_ROOT, rel)
        if (!abs.startsWith(ARTIFACTS_ROOT + sep) && abs !== ARTIFACTS_ROOT) return null
        if (existsSync(abs) && statSync(abs).isFile()) return abs
      }
    }
  } catch {
    /* fall through */
  }
  return null
}

function sendFile(res, absPath, { download = false } = {}) {
  const buf = readFileSync(absPath)
  const ext = extname(absPath).toLowerCase()
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  }
  if (download) {
    headers['Content-Disposition'] = `attachment; filename="${basename(absPath)}"`
  }
  res.writeHead(200, headers)
  res.end(buf)
}

/**
 * 将去掉 /api/v1 前缀后的路径段解析为 mock-data 数据路由。
 *
 * 约定（与 docs/api OpenAPI 契约一致）：
 *   index                                     -> index.json
 *   {domain}/scenarios                        -> {domain}/scenarios.json
 *   {domain}/scenarios/{scenarioId}           -> scenario-details.json 中 id 匹配的场景对象
 *   {domain}/scenarios/{scenarioId}/params-schema -> params-schema.json 中该场景的子对象
 *   {domain}/scenarios/{scenarioId}/benchmark -> benchmark.json 中该场景的子对象
 *   {domain}/params-schema                    -> {domain}/params-schema.json
 *   {domain}/benchmark                        -> {domain}/benchmark.json
 *   {domain}/operators                        -> {domain}/operators.json
 *   {domain}/runs                             -> {domain}/runs.json
 *   {domain}/runs/{runId}                     -> {domain}/run-details/{runId}.json
 *   {domain}/runs/{runId}/workflow            -> run-details 中 data.workflow
 *   {domain}/runs/{runId}/metrics             -> run-details 中 data.metrics
 *   {domain}/runs/{runId}/logs                -> run-details 中 data.logs
 *   {domain}/runs/{runId}/artifacts           -> run-details 中 data.artifacts
 *   multicenter/{resource}                    -> multicenter/{resource}.json
 *   multicenter/invocations/{id}              -> multicenter/details/{id}.json
 *   multicenter/migrations/{id}               -> multicenter/details/{id}.json
 *
 * 返回 { file, lookup? }：file 为 mock-data 下的相对文件路径，
 * lookup 为可选的 data 提取指令（见 applyLookup）。
 */
function resolveMockFile(parts) {
  const [first, second, third, fourth] = parts
  if (!first) return null

  // 首页总览
  if (first === 'index') return { file: 'index.json' }

  // 函数多中心联调
  if (first === 'multicenter') {
    if (!second) return null
    if ((second === 'invocations' || second === 'migrations') && third) {
      return { file: `multicenter/details/${third}.json` }
    }
    // multicenter/functions/deployment-matrix：部署矩阵独立文件
    if (second === 'functions' && third === 'deployment-matrix') {
      return { file: 'multicenter/deployment-matrix.json' }
    }
    return { file: `multicenter/${second}.json` }
  }

  // 学科域资源（geodynamics / llm / automotive / uav / drug / dft）
  if (!second) return null

  if (second === 'scenarios') {
    if (!third) return { file: `${first}/scenarios.json` }
    // scenarios/{scenario_id}/params-schema | benchmark：按场景 id 提取子对象
    if (fourth === 'params-schema' || fourth === 'benchmark') {
      return { file: `${first}/${fourth}.json`, lookup: { type: 'object-key', key: third } }
    }
    // scenarios/{scenario_id}：从场景详情数组中按 id 提取单个场景
    return { file: `${first}/scenario-details.json`, lookup: { type: 'array-item', field: 'id', key: third } }
  }

  if (second === 'runs') {
    if (!third) return { file: `${first}/runs.json` }
    // runs/{run_id}/workflow | metrics | logs | artifacts：从任务详情中提取子资源
    if (fourth === 'workflow' || fourth === 'metrics' || fourth === 'logs' || fourth === 'artifacts') {
      return { file: `${first}/run-details/${third}.json`, lookup: { type: 'run-sub', sub: fourth } }
    }
    // runs/{run_id}：任务详情
    return { file: `${first}/run-details/${third}.json` }
  }

  return { file: `${first}/${second}.json` }
}

/**
 * 按 lookup 指令从业务数据 data 中提取嵌套子资源。
 * 返回 { value }；找不到时返回 { missing: 描述 }。
 */
function applyLookup(lookup, data) {
  if (lookup.type === 'array-item') {
    // 场景详情既可能是数组（geodynamics/llm/automotive/uav），
    // 也可能是按场景 id 键控的对象（dft/drug），两种形态都需支持
    let item
    if (Array.isArray(data)) {
      item = data.find((it) => it && it[lookup.field] === lookup.key)
    } else if (data && typeof data === 'object' && lookup.key in data) {
      item = data[lookup.key]
    }
    return item != null ? { value: item } : { missing: `${lookup.key} (${lookup.field})` }
  }
  if (lookup.type === 'object-key') {
    const val = data && typeof data === 'object' && lookup.key in data ? data[lookup.key] : undefined
    return val !== undefined ? { value: val } : { missing: lookup.key }
  }
  if (lookup.type === 'run-sub') {
    const val = data && typeof data === 'object' && lookup.sub in data ? data[lookup.sub] : undefined
    return val !== undefined ? { value: val } : { missing: lookup.sub }
  }
  return { value: data }
}

/* -------------------------------------------------------------------------- */
/* 地球动力学体验流程：写接口（直接改动 mock-data 下的 JSON，无数据库）          */
/* -------------------------------------------------------------------------- */

const GEO_DOMAIN = 'geodynamics'
const ADVANCE_STEP = 20
const ADVANCE_SECONDS = 120

/** 当前时间 ISO 字符串（带本地时区偏移，风格与 mock 数据一致） */
function nowIso() {
  const now = new Date()
  const pad = (n) => String(Math.abs(n)).padStart(2, '0')
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const oh = pad(Math.floor(Math.abs(offset) / 60))
  const om = pad(Math.abs(offset) % 60)
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${oh}:${om}`
}

/** 将对象写回 mock-data 下相对路径的 JSON 文件 */
function writeJson(relPath, payload) {
  const file = resolve(MOCK_DATA_DIR, relPath)
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

/** 在 uploads/{domain} 下查找以 {datasetId}. 开头的上传样例文件 */
function findSampleFile(domain, datasetId) {
  const dir = resolve(UPLOADS_DIR, domain)
  if (!existsSync(dir) || !datasetId) return null
  try {
    const matched = readdirSync(dir).find((f) => f.startsWith(`${datasetId}.`))
    if (!matched) return null
    const abs = resolve(dir, matched)
    if (!existsSync(abs) || !statSync(abs).isFile()) return null
    return {
      file_name: matched,
      format: extname(matched).replace(/^\./, '').toUpperCase(),
      size_bytes: statSync(abs).size,
    }
  } catch {
    return null
  }
}

/** 列出 uploads/{domain} 下的上传样例文件清单 */
function listUploadSamples(domain) {
  const dir = resolve(UPLOADS_DIR, domain)
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((f) => {
        const abs = resolve(dir, f)
        return existsSync(abs) && statSync(abs).isFile()
      })
      .map((f) => {
        const abs = resolve(dir, f)
        return {
          file_name: f,
          dataset_id: f.split('.')[0],
          format: extname(f).replace(/^\./, '').toUpperCase(),
          size_bytes: statSync(abs).size,
        }
      })
  } catch {
    return []
  }
}

/** 上传数据集：标记 uploaded、按样例文件补齐 size，并写回 datasets.json */
function uploadGeodynamicsDataset(datasetId) {
  const envelope = readJson(`${GEO_DOMAIN}/datasets.json`)
  if (!envelope || !Array.isArray(envelope.data)) return { error: 'datasets.json not found' }
  const item = envelope.data.find((d) => d.dataset_id === datasetId)
  if (!item) return { error: `dataset not found: ${datasetId}` }

  const sample = findSampleFile(GEO_DOMAIN, datasetId)
  const now = nowIso()
  // 首次上传前记录原始字段快照，便于「恢复未上传」时还原为原始数据
  if (!item._pristine) {
    item._pristine = {
      size_bytes: item.size_bytes,
      source: item.source,
      status: item.status,
      updated_at: item.updated_at,
    }
  }
  item.uploaded = true
  item.imported = false
  item.status = 'ready'
  if (sample) {
    item.size_bytes = sample.size_bytes
    if (!item.format || item.format === '-') item.format = sample.format
  }
  // 数据来源沿用该数据集在 mock 数据中模拟的原始来源，不写成通用文案
  item.updated_at = now
  envelope.timestamp = now
  writeJson(`${GEO_DOMAIN}/datasets.json`, envelope)
  return { dataset: item }
}

/** 恢复数据集为未上传状态：保留该行，重置 uploaded/imported 并还原原始字段 */
function resetGeodynamicsDataset(datasetId) {
  const envelope = readJson(`${GEO_DOMAIN}/datasets.json`)
  if (!envelope || !Array.isArray(envelope.data)) return { error: 'datasets.json not found' }
  const item = envelope.data.find((d) => d.dataset_id === datasetId)
  if (!item) return { error: `dataset not found: ${datasetId}` }
  // HDF5 数据集为内置数据，不支持撤销上传
  if (item.format === 'HDF5') return { error: `HDF5 数据集不支持恢复未上传：${datasetId}`, code: 400 }
  // 上传前保存过原始快照则还原为原始数据，否则当前字段即为原始数据
  if (item._pristine) {
    item.size_bytes = item._pristine.size_bytes
    item.source = item._pristine.source
    item.status = item._pristine.status
    item.updated_at = item._pristine.updated_at
    delete item._pristine
  }
  item.uploaded = false
  item.imported = false
  envelope.timestamp = nowIso()
  writeJson(`${GEO_DOMAIN}/datasets.json`, envelope)
  return { dataset: item }
}

/** 依据累计导入数更新各算力中心的 CPU / 内存利用率（仅在导入新数据时变化） */
function updateClusterUtilization(importedTotal) {
  const envelope = readJson('multicenter/clusters.json')
  if (!envelope || !Array.isArray(envelope.data)) return []
  const now = nowIso()
  envelope.data.forEach((c) => {
    if (typeof c.base_cpu_utilization !== 'number') c.base_cpu_utilization = c.cpu_utilization
    if (typeof c.base_memory_utilization !== 'number') c.base_memory_utilization = c.memory_utilization
    c.cpu_utilization = Math.max(0, Math.min(99, Math.round(c.base_cpu_utilization + importedTotal * 3)))
    c.memory_utilization = Math.max(0, Math.min(99, Math.round(c.base_memory_utilization + importedTotal * 2)))
    c.updated_at = now
  })
  envelope.timestamp = now
  writeJson('multicenter/clusters.json', envelope)
  return envelope.data
}

/** 一键导入：将已上传且未导入的数据集标记为 imported，并更新算力利用率 */
function importGeodynamicsDatasets(scenarioId) {
  const envelope = readJson(`${GEO_DOMAIN}/datasets.json`)
  if (!envelope || !Array.isArray(envelope.data)) return { error: 'datasets.json not found' }

  const scope = envelope.data.filter((d) => !scenarioId || d.scenario_id === scenarioId)
  const uploaded = scope.filter((d) => d.uploaded)
  const newly = uploaded.filter((d) => !d.imported)

  if (!newly.length) {
    const totalImported = envelope.data.filter((d) => d.imported).length
    return {
      status: 'already_all',
      message: '已全部导入',
      newly_count: 0,
      total_imported: totalImported,
      total_uploaded: uploaded.length,
    }
  }

  newly.forEach((d) => {
    d.imported = true
  })
  const totalImported = envelope.data.filter((d) => d.imported).length
  envelope.timestamp = nowIso()
  writeJson(`${GEO_DOMAIN}/datasets.json`, envelope)

  const clusters = updateClusterUtilization(totalImported)
  return {
    status: 'imported',
    message: `已导入 ${totalImported} 个，本次新导入 ${newly.length} 个`,
    newly_count: newly.length,
    total_imported: totalImported,
    total_uploaded: uploaded.length,
    cluster_ids: clusters.map((c) => c.id),
  }
}

/** 找到某场景下可作为运行模板的运行（优先“成功且有详情”，保证结果页图表/成果文件可复用） */
function findTemplateRun(scenarioId, runs) {
  const candidates = runs.filter((r) => !scenarioId || r.scenario_id === scenarioId)
  return (
    candidates.find((r) => r.has_detail && r.status === 'success') ||
    candidates.find((r) => r.has_detail) ||
    candidates[0] ||
    null
  )
}

/** 在已有运行基础上分配全局唯一的新运行 ID（如 GEO-20260811-0015） */
function allocateRunId(runs) {
  const parsed = runs
    .map((r) => /^(GEO-\d{8})-(\d+)$/.exec(r.run_id || ''))
    .filter(Boolean)
    .map((m) => ({ prefix: m[1], seq: Number(m[2]) }))
  const base = parsed.length
    ? parsed.reduce((a, b) => (b.seq > a.seq ? b : a))
    : { prefix: `GEO-${nowIso().slice(0, 10).replace(/-/g, '')}`, seq: 0 }
  const seq = base.seq + 1
  return { seq, runId: `${base.prefix}-${String(seq).padStart(4, '0')}` }
}

/** 模板运行缺失时兜底生成默认工作流 */
function defaultGeodynamicsWorkflow(clusterId) {
  const nodes = [
    { id: 'prepare', name: '数据预处理' },
    { id: 'partition', name: '网格划分与域分解' },
    { id: 'solver', name: '并行求解' },
    { id: 'post', name: '结果后处理' },
  ].map((n) => ({ ...n, status: 'pending', progress: 0, cluster_id: clusterId }))
  const edges = nodes.slice(1).map((n, i) => ({ source: nodes[i].id, target: n.id }))
  return { nodes, edges }
}

/** 读取 geodynamics 算子元数据（含 cpu_cores），用于推导运行时间画像 */
function readGeodynamicsOperators() {
  const envelope = readJson(`${GEO_DOMAIN}/operators.json`)
  return Array.isArray(envelope?.data) ? envelope.data : []
}

/**
 * 依据本次所选算子推导该运行的推进画像：
 * - per_node_ticks：每个工作流节点需要的推进轮数（负载越高轮数越多，流程编排更慢）
 * - tick_seconds：每轮推进折算的模拟耗时（秒），负载越高单步越久
 * 以算子 cpu_cores 为负载依据，并叠加基于运行序号的轻微抖动，
 * 保证不同算子组合（甚至相同组合的不同记录）的耗时与核时都不会完全相同。
 */
function geodynamicsTimingPlan(operatorIds, seq) {
  const byName = new Map(readGeodynamicsOperators().map((op) => [op.name, op]))
  const chosen = (operatorIds || []).map((id) => byName.get(id)).filter(Boolean)
  const cpuSum = chosen.reduce((sum, op) => sum + (op.cpu_cores || 0), 0)
  const opCount = chosen.length
  // 负载指数：以 fd-wave-solver(64 核) 作为 1.0 基准；未匹配到算子元数据时取中性值
  const loadIndex = opCount ? cpuSum / 64 : 0.5
  // 每节点推进轮数随负载上升（3~7 轮）；求解节点按 2 倍计，体现其权重最高
  const perNodeBase = Math.max(3, Math.min(7, Math.round(3 + loadIndex)))
  // 单步模拟时长：负载与算子数量共同放大
  const baseTick = Math.round(90 + loadIndex * 90 + opCount * 15)
  const jitter = ((seq * 37) % 11) - 5 // -5 ~ +5 (%)，让相同算子组合也略有差异
  const tickSeconds = Math.max(30, Math.round(baseTick * (1 + jitter / 100)))
  return {
    per_node_ticks: {
      prepare: perNodeBase,
      partition: perNodeBase,
      solver: perNodeBase * 2,
      post: perNodeBase,
    },
    tick_seconds: tickSeconds,
    load_index: Number(loadIndex.toFixed(3)),
    operator_cpu_sum: cpuSum,
    operator_count: opCount,
  }
}

/** 将运行详情中的关键字段同步回 runs.json 列表项 */
function syncRunSummary(runId, detail) {
  const envelope = readJson(`${GEO_DOMAIN}/runs.json`)
  if (!envelope || !Array.isArray(envelope.data)) return
  const item = envelope.data.find((r) => r.run_id === runId)
  if (!item) return
  const now = nowIso()
  item.status = detail.status
  item.progress = detail.progress
  item.current_stage = detail.current_stage
  item.elapsed_seconds = detail.elapsed_seconds
  item.start_time = detail.start_time
  item.end_time = detail.end_time
  if (Array.isArray(detail.metrics?.metrics)) {
    item.metrics_snapshot = detail.metrics.metrics.map((m) => ({ ...m }))
  }
  item.core_hours = Number((((detail.cpu_cores || 0) * (detail.elapsed_seconds || 0)) / 3600).toFixed(1))
  envelope.timestamp = now
  writeJson(`${GEO_DOMAIN}/runs.json`, envelope)
}

/**
 * 算子提交：为选定场景新增一条运行记录（running），并生成对应的运行详情与工作流。
 * 与旧逻辑（重置已有主运行）不同，这里每次提交都会追加一条全新记录，
 * 使「流程编排 / 执行监控 / 结果展示」都能看到并推进这条新记录。
 */
function createGeodynamicsRun(scenarioId, payload) {
  const envelope = readJson(`${GEO_DOMAIN}/runs.json`)
  if (!envelope || !Array.isArray(envelope.data)) return { error: 'runs.json not found' }

  const template = findTemplateRun(scenarioId, envelope.data)
  if (!template) return { error: `run not found for scenario: ${scenarioId}` }

  const { seq, runId } = allocateRunId(envelope.data)
  const now = nowIso()
  const operatorIds = Array.isArray(payload?.operator_ids) ? payload.operator_ids : []
  const timing = geodynamicsTimingPlan(operatorIds, seq)

  // 优先克隆同场景已有详情作为模板（含 domain_data / artifacts），保证结果可查看
  const templateDetail = readJson(`${GEO_DOMAIN}/run-details/${template.run_id}.json`)
  const detail = templateDetail?.data ? JSON.parse(JSON.stringify(templateDetail.data)) : {}
  const workflow = detail.workflow?.nodes?.length ? detail.workflow : defaultGeodynamicsWorkflow(template.cluster_id)

  detail.run_id = runId
  detail.scenario_id = scenarioId
  detail.scenario_name = template.scenario_name
  detail.status = 'running'
  detail.progress = 0
  detail.execution_mode = template.execution_mode || 'simulated'
  detail.cluster_id = template.cluster_id
  detail.cluster_name = template.cluster_name
  detail.job_id = String(200000 + seq)
  detail.current_stage = workflow.nodes[0]?.id || 'prepare'
  detail.start_time = now
  detail.end_time = ''
  detail.elapsed_seconds = 0
  detail.nodes = template.nodes
  detail.cpu_cores = template.cpu_cores
  detail.gpu_count = template.gpu_count
  detail.memory_gb = template.memory_gb
  detail.source_type = 'simulated'
  detail.selected_operator_ids = operatorIds
  detail.timing = timing
  detail.workflow = workflow
  workflow.nodes.forEach((n) => {
    n.status = 'pending'
    n.progress = 0
    n.tick = 0
  })
  if (detail.metrics) {
    detail.metrics.progress = 0
    if (Array.isArray(detail.metrics.metrics)) {
      detail.metrics.metrics.forEach((m) => {
        if (m.name === 'time_step') m.value = 0
        if (m.name === 'cpu_utilization') m.value = 0
      })
    }
  }

  writeJson(`${GEO_DOMAIN}/run-details/${runId}.json`, {
    code: 200,
    message: 'success',
    data: detail,
    timestamp: now,
  })

  const summary = {
    run_id: runId,
    domain: GEO_DOMAIN,
    scenario_id: scenarioId,
    scenario_name: template.scenario_name,
    status: 'running',
    progress: 0,
    execution_mode: template.execution_mode || 'simulated',
    cluster_id: template.cluster_id,
    cluster_name: template.cluster_name,
    job_id: detail.job_id,
    current_stage: detail.current_stage,
    start_time: now,
    end_time: '',
    elapsed_seconds: 0,
    nodes: template.nodes,
    cpu_cores: template.cpu_cores,
    gpu_count: template.gpu_count,
    memory_gb: template.memory_gb,
    core_hours: 0,
    source_type: 'simulated',
    has_detail: true,
    metrics_snapshot: Array.isArray(detail.metrics?.metrics) ? detail.metrics.metrics.map((m) => ({ ...m })) : [],
  }
  envelope.data.unshift(summary)
  envelope.timestamp = now
  writeJson(`${GEO_DOMAIN}/runs.json`, envelope)

  return {
    run_id: runId,
    workflow: detail.workflow,
    progress: 0,
    selected_operator_ids: operatorIds,
  }
}

/** 推进主运行：将首个未完成的工作流节点推进一段进度，换算总进度并回写 */
function advanceGeodynamicsRun(runId) {
  const relPath = `${GEO_DOMAIN}/run-details/${runId}.json`
  const detailEnvelope = readJson(relPath)
  if (!detailEnvelope || !detailEnvelope.data) return { error: `run detail not found: ${runId}` }
  const detail = detailEnvelope.data
  const nodes = detail.workflow?.nodes
  if (!Array.isArray(nodes) || !nodes.length) return { error: `workflow not found: ${runId}` }

  // 推进节拍与单步时长来自提交时按算子推导的画像：不同算子组合得到不同的耗时/核时与推进速度
  const timing = detail.timing && typeof detail.timing === 'object' ? detail.timing : null
  const tickSeconds = Number(timing?.tick_seconds) > 0 ? Number(timing.tick_seconds) : ADVANCE_SECONDS
  const perNodeTicks = timing?.per_node_ticks || null

  const target = nodes.find((n) => (n.progress || 0) < 100)
  if (target) {
    if (perNodeTicks) {
      const total = Number(perNodeTicks[target.id]) > 0 ? Number(perNodeTicks[target.id]) : 1
      target.tick = (target.tick || 0) + 1
      target.progress = Math.min(100, Math.round((target.tick / total) * 100))
    } else {
      target.progress = Math.min(100, (target.progress || 0) + ADVANCE_STEP)
    }
  }

  // 顺序依赖：已完成节点 success；首个未完成节点 running；其余 pending
  let blocked = false
  nodes.forEach((n) => {
    if ((n.progress || 0) >= 100) {
      n.status = 'success'
    } else if (!blocked) {
      n.status = 'running'
      blocked = true
    } else {
      n.status = 'pending'
    }
  })

  const overall = Math.round(nodes.reduce((sum, n) => sum + (n.progress || 0), 0) / nodes.length)
  const now = nowIso()
  const allDone = nodes.every((n) => (n.progress || 0) >= 100)
  detail.progress = overall
  if (allDone) {
    detail.status = 'success'
    detail.current_stage = 'completed'
    detail.end_time = now
  } else {
    detail.status = 'running'
    detail.current_stage = nodes.find((n) => n.status === 'running')?.id || detail.current_stage
  }
  detail.elapsed_seconds = (detail.elapsed_seconds || 0) + tickSeconds

  if (detail.metrics) {
    detail.metrics.progress = overall
    if (Array.isArray(detail.metrics.metrics)) {
      detail.metrics.metrics.forEach((m) => {
        if (m.name === 'time_step' && m.total) m.value = Math.round((m.total * overall) / 100)
        if (m.name === 'cpu_utilization') m.value = 70 + Math.round(overall / 5)
      })
    }
  }

  detailEnvelope.timestamp = now
  writeJson(relPath, detailEnvelope)
  syncRunSummary(runId, detail)

  return {
    run_id: runId,
    workflow: detail.workflow,
    progress: detail.progress,
    elapsed_seconds: detail.elapsed_seconds,
    status: detail.status,
    current_stage: detail.current_stage,
    metrics: detail.metrics?.metrics || [],
  }
}

/**
 * 处理 geodynamics 体验流程写操作。
 * 返回 { code, message, data }；未命中返回 null（交由通用写回显处理）。
 */
function handleGeodynamicsWrite(method, parts, body) {
  if (parts[0] !== GEO_DOMAIN) return null
  const [, resource, arg1, arg2, arg3] = parts

  // POST /geodynamics/datasets/{id}/upload
  if (resource === 'datasets' && method === 'POST' && arg1 && arg2 === 'upload') {
    const result = uploadGeodynamicsDataset(arg1)
    if (result.error) return { code: 404, message: result.error, data: null }
    return { code: 200, message: '上传成功', data: result.dataset }
  }

  // DELETE /geodynamics/datasets/{id} —— 不删除整行，仅恢复为未上传状态
  if (resource === 'datasets' && method === 'DELETE' && arg1) {
    const result = resetGeodynamicsDataset(arg1)
    if (result.error) return { code: result.code || 404, message: result.error, data: null }
    return { code: 200, message: '已恢复未上传状态', data: result.dataset }
  }

  // POST /geodynamics/scenarios/{scenarioId}/import
  if (resource === 'scenarios' && method === 'POST' && arg1 && arg2 === 'import') {
    const result = importGeodynamicsDatasets(arg1)
    if (result.error) return { code: 404, message: result.error, data: null }
    return { code: 200, message: result.message, data: result }
  }

  // POST /geodynamics/scenarios/{scenarioId}/operators/submit —— 每次提交新增一条运行记录
  if (resource === 'scenarios' && method === 'POST' && arg1 && arg2 === 'operators' && arg3 === 'submit') {
    const result = createGeodynamicsRun(arg1, body)
    if (result.error) return { code: 404, message: result.error, data: null }
    return { code: 200, message: '算子已提交，已新增运行记录', data: result }
  }

  // POST /geodynamics/runs/{runId}/advance
  if (resource === 'runs' && method === 'POST' && arg1 && arg2 === 'advance') {
    const result = advanceGeodynamicsRun(arg1)
    if (result.error) return { code: 404, message: result.error, data: null }
    return { code: 200, message: 'success', data: result }
  }

  return null
}

const server = createServer(async (req, res) => {
  const method = (req.method || 'GET').toUpperCase()
  const url = req.url || '/'

  // CORS 预检
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  const pathname = new URL(url, `http://${req.headers.host || 'localhost'}`).pathname

  // 仅处理 /api/v1 前缀
  if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) {
    sendJSON(res, 404, {
      code: 404,
      message: `API path not found: ${pathname}（本服务仅提供 ${API_PREFIX}/* 接口）`,
      data: null,
      timestamp: new Date().toISOString(),
    })
    return
  }

  // 读操作：GET 返回 mock-data 下的 JSON；文件预览/下载单独处理
  if (method === 'GET') {
    const parts = pathname.slice(API_PREFIX.length).split('/').filter(Boolean)

    // GET /api/v1/files/{artifact_id}/preview|download
    if (parts[0] === 'files' && parts[1] && (parts[2] === 'preview' || parts[2] === 'download')) {
      const abs = resolveArtifactPath(parts[1])
      if (!abs) {
        sendJSON(res, 404, {
          code: 404,
          message: `Artifact file not found: ${parts[1]}（仅提供 artifacts/ 下已登记的模拟文件）`,
          data: null,
          timestamp: new Date().toISOString(),
        })
        return
      }
      try {
        sendFile(res, abs, { download: parts[2] === 'download' })
      } catch {
        sendJSON(res, 500, {
          code: 500,
          message: `Failed to read artifact: ${parts[1]}`,
          data: null,
          timestamp: new Date().toISOString(),
        })
      }
      return
    }

    // GET /api/v1/geodynamics/upload-samples → 上传样例文件清单
    if (parts[0] === GEO_DOMAIN && parts[1] === 'upload-samples') {
      sendJSON(res, 200, {
        code: 200,
        message: 'success',
        data: listUploadSamples(GEO_DOMAIN),
        timestamp: new Date().toISOString(),
      })
      return
    }

    const route = resolveMockFile(parts)
    if (!route) {
      sendJSON(res, 404, {
        code: 404,
        message: `API path not supported: ${pathname}`,
        data: null,
        timestamp: new Date().toISOString(),
      })
      return
    }

    const payload = readJson(route.file)
    if (!payload) {
      sendJSON(res, 404, {
        code: 404,
        message: `Mock data not found: ${route.file}（数据目录：${MOCK_DATA_DIR}）`,
        data: null,
        timestamp: new Date().toISOString(),
      })
      return
    }

    // 按路径段提取嵌套资源（场景详情 / 参数 / 性能对比 / 工作流 / 指标 / 日志 / 结果文件）
    let data = payload.data
    if (route.lookup) {
      const extracted = applyLookup(route.lookup, data)
      if (extracted.missing) {
        sendJSON(res, 404, {
          code: 404,
          message: `Resource not found: ${extracted.missing}`,
          data: null,
          timestamp: new Date().toISOString(),
        })
        return
      }
      data = extracted.value
    }

    sendJSON(res, 200, {
      code: 200,
      message: 'success',
      data,
      timestamp: payload.timestamp || new Date().toISOString(),
    })
    return
  }

  // 写操作（POST / PUT / PATCH / DELETE）：模拟成功响应，回显请求体，保证前后端接口联通
  let body = null
  try {
    body = await readRequestBody(req)
  } catch {
    body = null
  }

  // geodynamics 体验流程写接口：直接改动 mock JSON 数据
  const writeParts = pathname.slice(API_PREFIX.length).split('/').filter(Boolean)
  const geodynamicsResult = handleGeodynamicsWrite(method, writeParts, body)
  if (geodynamicsResult) {
    sendJSON(res, geodynamicsResult.code || 200, {
      code: geodynamicsResult.code || 200,
      message: geodynamicsResult.message || 'success',
      data: geodynamicsResult.data,
      timestamp: new Date().toISOString(),
    })
    return
  }

  const echo =
    body && typeof body === 'object'
      ? body
      : body != null
        ? { raw: String(body).slice(0, 500) }
        : null

  sendJSON(res, 200, {
    code: 200,
    message: 'success',
    data: {
      method,
      path: pathname,
      mock: true,
      ...(echo ? { body: echo } : {}),
    },
    timestamp: new Date().toISOString(),
  })
})

server.listen(PORT, HOST, () => {
  console.log(`[mock-backend] listening on http://${HOST}:${PORT}${API_PREFIX}`)
  console.log(`[mock-backend] mock data dir: ${MOCK_DATA_DIR}`)
  console.log(`[mock-backend] try: http://${HOST}:${PORT}${API_PREFIX}/llm/scenarios`)
})
