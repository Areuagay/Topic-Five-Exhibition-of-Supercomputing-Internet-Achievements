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
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')

const HOST = process.env.BACKEND_HOST || '127.0.0.1'
const PORT = Number(process.env.BACKEND_PORT || 3001)
const MOCK_DATA_DIR = process.env.MOCK_DATA_DIR || resolve(__dirname, '..', 'mock-data')

const API_PREFIX = '/api/v1'

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

  // 读操作：GET 返回 mock-data 下的 JSON
  if (method === 'GET') {
    const parts = pathname.slice(API_PREFIX.length).split('/').filter(Boolean)
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
