/**
 * 从超算平台首页「全局资源视图」同步四个算力中心的资源状态，
 * 并以这四个中心为基准重算应用示范「函数多中心联调」的演示数据。
 *
 * 用法：
 *   node scripts/sync-multicenter-backend.mjs
 *   MULTICENTER_BACKEND_URL=http://192.168.95.138:8890/ node scripts/sync-multicenter-backend.mjs
 *
 * 数据来源：平台首页（/home）「全局资源视图」四张卡片的
 *   超算名称 / CPU / GPU / 运行任务 / 排队等待 / 资源状态。
 * 平台暂未提供函数部署、调用追踪、负载迁移接口，这三块由四中心数据推导，
 * 保证四个页面的数字互相自洽；推导规则见 derive* 函数注释。
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MOCK_DIR = resolve(ROOT, 'mock-data')
const MC_DIR = resolve(MOCK_DIR, 'multicenter')
const DETAIL_DIR = resolve(MC_DIR, 'details')
const INDEX_FILE = resolve(MOCK_DIR, 'index.json')
const SNAPSHOT_FILE = resolve(MC_DIR, 'backend-snapshot.json')
const RUNTIME_STATE_DIR = resolve(ROOT, '.runtime-data')

/** 六大应用领域的运行记录也引用中心名称，需要一起同步。 */
const RUN_DOMAINS = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']

const BACKEND_URL = process.env.MULTICENTER_BACKEND_URL || 'http://192.168.95.138:8890/'
const TIME_ZONE = 'Asia/Shanghai'

/** 应用示范中的四个中心，顺序与平台首页四张卡片一一对应。 */
const CENTERS = [
  { id: 'changsha', city: '长沙' },
  { id: 'guangzhou', city: '广州' },
  { id: 'kunshan', city: '昆山' },
  { id: 'jinan', city: '济南' },
]

/** 平台首页的枚举 → 应用示范沿用的 status / 中文文案。 */
const STATUS_MAP = { normal: 'online', highLoad: 'degraded', maintenance: 'offline' }
const RESOURCE_LABEL = { normal: '正常运行', highLoad: '高负载', maintenance: '维护中' }

const FUNCTIONS = [
  { id: 'fn-matrix-multiply', name: '矩阵乘法函数', short: 'matrix', workload: 'WL-FN-MATRIX' },
  { id: 'fn-fft', name: 'FFT函数', short: 'fft', workload: 'WL-FN-FFT' },
  { id: 'fn-file-convert', name: '文件格式转换函数', short: 'convert', workload: 'WL-FN-CONVERT' },
]

/** 中心间链路的基础时延 / 带宽，沿用应用示范既有联调基线。 */
const LINK_BASE = [
  ['changsha', 'guangzhou', 18.6, 8200, 0.02],
  ['changsha', 'kunshan', 23.4, 7600, 0.03],
  ['changsha', 'jinan', 31.8, 4200, 0.12],
  ['guangzhou', 'kunshan', 27.5, 7100, 0.04],
  ['guangzhou', 'jinan', 29.2, 6800, 0.05],
  ['kunshan', 'jinan', 32.4, 6300, 0.06],
]

/** 各中心调用基线时延（毫秒）。 */
const LATENCY_BASE = { changsha: 34.5, guangzhou: 38.2, kunshan: 46.8, jinan: 57.4 }

const pad = (value, size = 2) => String(value).padStart(size, '0')

/** 输出带 +08:00 偏移的本地时间，和既有 mock 数据格式保持一致。 */
function iso(ts = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date(ts))
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

/**
 * 在首页 bundle 中定位「全局资源视图」的四中心数组（`s2=[{id:1,...}]`），
 * 按括号配对截取后逐个解析，避免依赖整包格式。
 */
function extractCards(bundle) {
  const marker = bundle.indexOf('s2=[')
  if (marker < 0) throw new Error('未在首页 bundle 中找到全局资源视图数据（s2=[...]）')
  const start = bundle.indexOf('[', marker)
  let depth = 0
  let end = -1
  for (let i = start; i < bundle.length; i += 1) {
    if (bundle[i] === '[') depth += 1
    else if (bundle[i] === ']') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error('全局资源视图数组未闭合')

  const literal = bundle.slice(start, end + 1)
  const cardPattern = /\{id:(\d+),name:"([^"]*)",architecture:"([^"]*)",status:"([^"]*)",cpu:([\d.]+),gpu:([\d.]+),running:(\d+),queued:(\d+)\}/g
  const cards = []
  for (const match of literal.matchAll(cardPattern)) {
    cards.push({
      order: Number(match[1]),
      name: match[2],
      architecture: match[3],
      status: match[4],
      cpu: Number(match[5]),
      gpu: Number(match[6]),
      running: Number(match[7]),
      queued: Number(match[8]),
    })
  }
  if (cards.length !== CENTERS.length) {
    throw new Error(`期望 4 个算力中心，实际解析到 ${cards.length} 个`)
  }
  return cards.sort((a, b) => a.order - b.order)
}

/** 抓取平台首页并定位「全局资源视图」所在的懒加载分片，返回四中心快照。 */
async function fetchBackendSnapshot() {
  const home = await fetchText(BACKEND_URL)
  const asset = home.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/)
  if (!asset) throw new Error(`首页未找到入口脚本：${BACKEND_URL}`)
  const entryUrl = new URL(asset[1], BACKEND_URL).toString()
  const entry = await fetchText(entryUrl)

  // 首页数据可能内联在入口脚本，也可能在按需加载的同名分片中
  if (entry.includes('s2=[')) {
    return { source: new URL('home', BACKEND_URL).toString(), bundle: entryUrl, fetched_at: iso(), items: extractCards(entry) }
  }

  const chunkPaths = [...new Set(entry.match(/assets\/[A-Za-z0-9_.-]+\.js/g) ?? [])]
  for (const chunkPath of chunkPaths) {
    const chunkUrl = new URL(chunkPath, BACKEND_URL).toString()
    let chunk
    try {
      chunk = await fetchText(chunkUrl)
    } catch {
      continue
    }
    if (!chunk.includes('全局资源视图') && !chunk.includes('s2=[')) continue
    if (!chunk.includes('s2=[')) continue
    return {
      source: new URL('home', BACKEND_URL).toString(),
      bundle: chunkUrl,
      fetched_at: iso(),
      items: extractCards(chunk),
    }
  }

  throw new Error('未在平台首页脚本中找到全局资源视图数据（s2=[...]）')
}

/** 读取或写入 JSON（保持仓库统一的 2 空格缩进）。 */
function writeJSON(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

/** 把平台四中心映射为应用示范的算力中心记录。 */
function buildClusters(cards, previous, snapshot) {
  const specs = new Map(previous.map((cluster) => [cluster.id, cluster]))
  return CENTERS.map((center, index) => {
    const card = cards[index]
    const spec = specs.get(center.id) ?? {}
    return {
      id: center.id,
      name: card.name,
      location: center.city,
      architecture: spec.architecture ?? card.architecture,
      scheduler: spec.scheduler ?? 'SLURM',
      status: STATUS_MAP[card.status] ?? 'online',
      resource_status: card.status,
      source_type: 'backend',
      total_nodes: spec.total_nodes ?? 0,
      total_cores: spec.total_cores ?? 0,
      gpu_count: spec.gpu_count ?? 0,
      cpu_utilization: card.cpu,
      gpu_utilization: card.gpu,
      active_jobs: card.running,
      queue_length: card.queued,
      updated_at: snapshot.fetched_at,
    }
  })
}

/**
 * 拓扑：节点名称 / 资源状态跟随平台；与维护中中心相连的链路标记为离线，
 * 其余链路沿用应用示范既有联调基线。
 */
function buildTopology(clusters) {
  const offline = new Set(clusters.filter((c) => c.status === 'offline').map((c) => c.id))
  return {
    nodes: clusters.map((cluster) => ({
      id: cluster.id,
      name: cluster.name,
      status: cluster.status,
      resource_status: cluster.resource_status,
      source_type: 'backend',
    })),
    links: LINK_BASE.map(([source, target, latency, bandwidth, loss]) => ({
      source,
      target,
      status: offline.has(source) || offline.has(target) ? 'offline' : 'online',
      latency_ms: latency,
      bandwidth_mbps: bandwidth,
      packet_loss_percent: loss,
      source_type: 'backend',
    })),
  }
}

/**
 * 部署矩阵：每个中心每 4 个运行任务折算 1 个就绪副本（至少 1 个），
 * 再在 3 个函数间轮转分配；维护中的中心不承载实例。
 */
function buildDeploymentMatrix(clusters) {
  const rows = FUNCTIONS.map((fn) => ({
    function_id: fn.id,
    function_name: fn.name,
    deployments: [],
  }))

  clusters.forEach((cluster, centerIndex) => {
    const instances = cluster.status === 'offline'
      ? 0
      : cluster.active_jobs > 0
        ? Math.max(1, Math.ceil(cluster.active_jobs / 4))
        : 0
    for (let index = 0; index < instances; index += 1) {
      const row = rows[(index + centerIndex) % rows.length]
      const deployment = row.deployments.find((item) => item.cluster_id === cluster.id)
      if (deployment) deployment.replicas += 1
      else row.deployments.push({ cluster_id: cluster.id, replicas: 1, status: 'ready' })
    }
  })

  for (const row of rows) {
    const byCluster = new Map(row.deployments.map((item) => [item.cluster_id, item.replicas]))
    row.deployments = clusters.map((cluster) => {
      const replicas = byCluster.get(cluster.id) ?? 0
      return {
        cluster_id: cluster.id,
        replicas,
        status: replicas > 0 ? 'ready' : cluster.status === 'offline' ? 'offline' : 'undeployed',
      }
    })
  }

  return {
    clusters: clusters.map((cluster) => ({ id: cluster.id, name: cluster.name })),
    functions: rows,
  }
}

/** 工作负载：副本数与部署矩阵一致，利用率取自对应中心的平台资源状态。 */
function buildWorkloads(clusters, matrix) {
  return FUNCTIONS.map((fn) => {
    const row = matrix.functions.find((item) => item.function_id === fn.id)
    return {
      workload_id: fn.workload,
      function_id: fn.id,
      name: `${fn.name}工作负载`,
      status: 'running',
      source_type: 'backend',
      instances: clusters.map((cluster) => {
        const deployment = row?.deployments.find((item) => item.cluster_id === cluster.id)
        const replicas = deployment?.replicas ?? 0
        return {
          cluster_id: cluster.id,
          desired_replicas: replicas,
          ready_replicas: replicas,
          cpu_utilization: replicas > 0 ? cluster.cpu_utilization : 0,
          gpu_utilization: replicas > 0 ? cluster.gpu_utilization : 0,
        }
      }),
    }
  })
}

/**
 * 调用追踪：每个中心按平台「运行任务」数量生成运行中的调用，
 * 另补 1 条成功、1 条失败的历史调用作为链路追踪样例；维护中的中心不产生调用。
 */
function buildInvocations(clusters, timestamp) {
  const stamp = timestamp.slice(0, 10).replaceAll('-', '')
  const now = Date.now()
  const records = []

  const push = (invocation) => records.push(invocation)

  clusters.forEach((cluster, centerIndex) => {
    if (cluster.status === 'offline' || cluster.active_jobs === 0) return
    for (let index = 0; index < cluster.active_jobs; index += 1) {
      const fn = FUNCTIONS[index % FUNCTIONS.length]
      const start = now - (index * 5 + centerIndex * 2 + 1) * 60_000
      push({
        function_id: fn.id,
        function_name: fn.name,
        cluster_id: cluster.id,
        status: 'running',
        source_type: 'backend',
        instance_id: `fn-${fn.short}-${cluster.id}-${pad(index + 1)}`,
        start_time: iso(start),
        end_time: '',
        total_latency_ms: Number((LATENCY_BASE[cluster.id] + (index % 6) * 1.7 + (fn.short === 'matrix' ? 2.4 : 0)).toFixed(1)),
        args: { queue_position: index + 1, center_queue: cluster.queue_length },
      })
    }
  })

  for (const cluster of clusters) {
    if (cluster.status === 'offline') continue
    const fn = FUNCTIONS[cluster.active_jobs % FUNCTIONS.length]
    for (const outcome of ['success', 'failed']) {
      const start = now - (outcome === 'success' ? 95 : 140) * 60_000
      const latency = Number((LATENCY_BASE[cluster.id] + (outcome === 'success' ? 4.2 : 9.6)).toFixed(1))
      push({
        function_id: fn.id,
        function_name: fn.name,
        cluster_id: cluster.id,
        status: outcome,
        source_type: 'backend',
        instance_id: `fn-${fn.short}-${cluster.id}-09`,
        start_time: iso(start),
        end_time: iso(start + latency * 1000),
        total_latency_ms: latency,
        args: { queue_position: 0, center_queue: cluster.queue_length },
      })
    }
  }

  // 按开始时间倒序排列，让不同中心的最新调用交错展示，再统一编号
  return records
    .sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))
    .map((record, index) => ({ ...record, invocation_id: `INV-${stamp}-${pad(index + 1, 4)}` }))
}

/** 生成与调用记录匹配的链路追踪明细。 */
function buildTrace(invocation) {
  const total = invocation.total_latency_ms
  const shares = [0.12, 0.2, 0.56, 0.12]
  const latencies = shares.map((share) => Number((total * share).toFixed(1)))
  const stages = [
    { component: 'scnet-gateway', name: '跨域网关接入', status: 'success' },
    { component: 'fn-scheduler', name: '跨中心调度编排', status: 'success' },
    {
      component: 'k8s-runtime',
      name: '函数实例执行',
      status: invocation.status === 'running' ? 'running' : invocation.status,
    },
    {
      component: 'result-collector',
      name: '结果汇聚回传',
      status: invocation.status === 'running' ? 'waiting' : invocation.status,
    },
  ]
  let cursor = Date.parse(invocation.start_time)
  const spans = stages.map((stage, index) => {
    const span = {
      seq: index + 1,
      component: stage.component,
      name: stage.name,
      cluster_id: invocation.cluster_id,
      status: stage.status,
      latency_ms: latencies[index],
      start_time: iso(cursor),
    }
    cursor += Math.round(latencies[index])
    return span
  })
  return {
    invocation_id: invocation.invocation_id,
    trace_id: `TRACE-${invocation.invocation_id.slice(4)}`,
    total_latency_ms: total,
    source_type: 'backend',
    spans,
  }
}

/**
 * 负载迁移：广州（排队 82）向昆山、长沙转移负载；另补成功 / 失败各一条历史记录。
 * 维护中的中心不参与迁移。
 */
function buildMigrations(clusters, timestamp) {
  const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]))
  const guangzhou = byId.get('guangzhou')
  const kunshan = byId.get('kunshan')
  const changsha = byId.get('changsha')
  const now = Date.now()
  const stamp = timestamp.slice(0, 10).replaceAll('-', '')

  const records = [
    {
      workload_id: 'WL-FN-MATRIX',
      function_id: 'fn-matrix-multiply',
      status: 'migrating',
      progress: 65,
      from_cluster: 'guangzhou',
      to_cluster: 'kunshan',
      start_time: iso(now - 12 * 60_000),
      end_time: '',
      reason: `广州中心排队等待 ${guangzhou?.queue_length ?? 0} 项，向昆山中心转移矩阵乘法实例`,
      transferred_replicas: 1,
      total_size_mb: 1024,
      events: [
        ['high_load_detected', '源中心高负载', 'success', now - 12 * 60_000],
        ['migration_started', '迁移启动', 'success', now - 11 * 60_000],
        ['state_transfer', '状态数据迁移', 'running', now - 8 * 60_000],
      ],
    },
    {
      workload_id: 'WL-FN-FFT',
      function_id: 'fn-fft',
      status: 'pending',
      progress: 0,
      from_cluster: 'guangzhou',
      to_cluster: 'changsha',
      start_time: '',
      end_time: '',
      reason: `广州中心排队等待 ${guangzhou?.queue_length ?? 0} 项，FFT 实例等待调度至长沙中心`,
      transferred_replicas: 1,
      total_size_mb: 512,
      events: [
        ['migration_planned', '迁移计划生成', 'success', now - 6 * 60_000],
      ],
    },
    {
      workload_id: 'WL-FN-CONVERT',
      function_id: 'fn-file-convert',
      status: 'success',
      progress: 100,
      from_cluster: 'changsha',
      to_cluster: 'kunshan',
      start_time: iso(now - 95 * 60_000),
      end_time: iso(now - 93 * 60_000),
      reason: `昆山中心空闲资源充足（排队 ${kunshan?.queue_length ?? 0} 项），承接转换函数实例`,
      transferred_replicas: 1,
      total_size_mb: 256,
      events: [
        ['load_balancing', '负载均衡调度', 'success', now - 95 * 60_000],
        ['migration_started', '迁移启动', 'success', now - 94 * 60_000],
        ['state_transfer', '状态数据迁移', 'success', now - 93.5 * 60_000],
        ['migration_completed', '迁移完成', 'success', now - 93 * 60_000],
      ],
    },
    {
      workload_id: 'WL-FN-MATRIX',
      function_id: 'fn-matrix-multiply',
      status: 'failed',
      progress: 42,
      from_cluster: 'kunshan',
      to_cluster: 'changsha',
      start_time: iso(now - 180 * 60_000),
      end_time: iso(now - 179.7 * 60_000),
      reason: '目标中心资源校验未通过，迁移中止',
      transferred_replicas: 1,
      total_size_mb: 768,
      events: [
        ['migration_started', '迁移启动', 'success', now - 180 * 60_000],
        ['state_transfer', '状态数据迁移', 'running', now - 179.9 * 60_000],
        ['resource_check_failed', '目标中心资源校验失败', 'failed', now - 179.7 * 60_000],
      ],
    },
  ]

  return records.map((record, index) => ({
    migration_id: `MIG-${stamp}-${pad(index + 1, 4)}`,
    workload_id: record.workload_id,
    function_id: record.function_id,
    status: record.status,
    progress: record.progress,
    from_cluster: record.from_cluster,
    to_cluster: record.to_cluster,
    source_type: 'backend',
    start_time: record.start_time,
    end_time: record.end_time,
    events: record.events.map(([event, name, status, ts], seq) => ({
      seq: seq + 1,
      event,
      name,
      status,
      timestamp: iso(ts),
    })),
    reason: record.reason,
    transferred_replicas: record.transferred_replicas,
    total_size_mb: record.total_size_mb,
  }))
}

/**
 * 各领域的运行记录、运行详情与本地运行态里保存了中心名称，
 * 同步时统一改成平台最新名称，避免运行列表与资源调度显示不一致。
 */
function syncRunClusterNames(clusters) {
  const names = new Map(clusters.map((cluster) => [cluster.id, cluster.name]))
  const apply = (record) => {
    if (!record?.cluster_id) return false
    const name = names.get(record.cluster_id)
    if (!name || record.cluster_name === name) return false
    record.cluster_name = name
    return true
  }

  for (const domain of RUN_DOMAINS) {
    const runsFile = resolve(MOCK_DIR, domain, 'runs.json')
    const runs = readJSON(runsFile, null)
    if (runs?.data) {
      let dirty = false
      for (const run of runs.data) dirty = apply(run) || dirty
      if (dirty) writeJSON(runsFile, runs)
    }

    const detailDir = resolve(MOCK_DIR, domain, 'run-details')
    for (const file of readdirSync(detailDir)) {
      if (!file.endsWith('.json')) continue
      const filePath = resolve(detailDir, file)
      const detail = readJSON(filePath, null)
      if (detail?.data && apply(detail.data)) writeJSON(filePath, detail)
    }

    const stateFile = resolve(RUNTIME_STATE_DIR, `${domain}.json`)
    const state = readJSON(stateFile, null)
    if (state) {
      let dirty = false
      for (const run of state.runs ?? []) dirty = apply(run) || dirty
      for (const detail of Object.values(state.details ?? {})) dirty = apply(detail) || dirty
      for (const template of Object.values(state.templates ?? {})) dirty = apply(template) || dirty
      if (dirty) writeJSON(stateFile, state)
    }
  }
}

async function main() {
  const clustersFile = resolve(MC_DIR, 'clusters.json')
  const previous = readJSON(clustersFile, { data: [] }).data ?? []
  const previousIndex = readJSON(INDEX_FILE, null)

  let snapshot
  try {
    snapshot = await fetchBackendSnapshot()
    console.log(`[sync] 已从 ${snapshot.source} 读取四个算力中心`)
  } catch (error) {
    const cached = readJSON(SNAPSHOT_FILE, null)
    if (!cached?.items?.length) throw error
    snapshot = cached
    console.warn(`[sync] 平台不可达（${error.message}），改用本地快照 ${SNAPSHOT_FILE}`)
  }

  const timestamp = snapshot.fetched_at
  const clusters = buildClusters(snapshot.items, previous, snapshot)
  syncRunClusterNames(clusters)
  const topology = buildTopology(clusters)
  const matrix = buildDeploymentMatrix(clusters)
  const workloads = buildWorkloads(clusters, matrix)
  const invocations = buildInvocations(clusters, timestamp)
  const migrations = buildMigrations(clusters, timestamp)

  writeJSON(SNAPSHOT_FILE, snapshot)
  writeJSON(clustersFile, { code: 200, message: 'success', data: clusters, timestamp })
  writeJSON(resolve(MC_DIR, 'topology.json'), { code: 200, message: 'success', data: topology, timestamp })
  writeJSON(resolve(MC_DIR, 'deployment-matrix.json'), { code: 200, message: 'success', data: matrix, timestamp })
  writeJSON(resolve(MC_DIR, 'workloads.json'), { code: 200, message: 'success', data: workloads, timestamp })
  writeJSON(resolve(MC_DIR, 'invocations.json'), { code: 200, message: 'success', data: invocations, timestamp })
  writeJSON(resolve(MC_DIR, 'migrations.json'), {
    code: 200,
    message: 'success',
    data: migrations.map(({ reason, transferred_replicas, total_size_mb, ...rest }) => rest),
    timestamp,
  })

  // 清理旧明细，再写入与新调用 / 迁移一一对应的追踪数据
  const wanted = new Set()
  for (const invocation of invocations) {
    const trace = buildTrace(invocation)
    wanted.add(`${invocation.invocation_id}.json`)
    writeJSON(resolve(DETAIL_DIR, `${invocation.invocation_id}.json`), {
      code: 200,
      message: 'success',
      data: trace,
      timestamp,
    })
  }
  for (const migration of migrations) {
    wanted.add(`${migration.migration_id}.json`)
    writeJSON(resolve(DETAIL_DIR, `${migration.migration_id}.json`), {
      code: 200,
      message: 'success',
      data: migration,
      timestamp,
    })
  }
  for (const file of readdirSync(DETAIL_DIR)) {
    if (file.endsWith('.json') && !wanted.has(file)) unlinkSync(resolve(DETAIL_DIR, file))
  }

  // 首页索引里的中心名称与多中心联调运行记录数跟随平台推导结果。
  // 采用文本替换而不是整体重写，避免把紧凑数组重新排版。
  if (previousIndex?.data?.clusters) {
    const names = new Map(clusters.map((cluster) => [cluster.id, cluster.name]))
    const previousNames = new Map(previousIndex.data.clusters.map((cluster) => [cluster.id, cluster.name]))
    let raw = readFileSync(INDEX_FILE, 'utf8')
    for (const [id, name] of names) {
      const previous = previousNames.get(id)
      if (previous && previous !== name) {
        raw = raw.split(`"name": "${previous}"`).join(`"name": "${name}"`)
      }
    }
    raw = raw.replace(
      /("domain": "multicenter"[\s\S]*?"run_count":\s*)\d+/,
      `$1${invocations.length}`,
    )
    writeFileSync(INDEX_FILE, raw, 'utf8')
  }

  const running = clusters.reduce((sum, cluster) => sum + cluster.active_jobs, 0)
  const queued = clusters.reduce((sum, cluster) => sum + cluster.queue_length, 0)
  console.log('[sync] 四中心资源状态：')
  for (const cluster of clusters) {
    console.log(
      `  ${cluster.location} · ${cluster.name} | CPU ${cluster.cpu_utilization}% | GPU ${cluster.gpu_utilization}% | `
      + `运行 ${cluster.active_jobs} | 排队 ${cluster.queue_length} | ${RESOURCE_LABEL[cluster.resource_status] ?? cluster.resource_status}`,
    )
  }
  console.log(`[sync] 合计运行 ${running} / 排队 ${queued}，生成调用 ${invocations.length} 条，迁移 ${migrations.length} 条`)
}

await main()
