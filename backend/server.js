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
 * 将去掉 /api/v1 前缀后的路径段映射为 mock-data 下的相对文件路径。
 *
 * 约定（与 docs/api OpenAPI 契约一致）：
 *   index                          -> index.json
 *   {domain}/scenarios             -> {domain}/scenarios.json
 *   {domain}/scenario-details      -> {domain}/scenario-details.json
 *   {domain}/params-schema         -> {domain}/params-schema.json
 *   {domain}/benchmark             -> {domain}/benchmark.json
 *   {domain}/operators             -> {domain}/operators.json
 *   {domain}/runs                  -> {domain}/runs.json
 *   {domain}/runs/{runId}          -> {domain}/run-details/{runId}.json
 *   multicenter/{resource}         -> multicenter/{resource}.json
 *   multicenter/invocations/{id}   -> multicenter/details/{id}.json
 *   multicenter/migrations/{id}    -> multicenter/details/{id}.json
 */
function resolveMockFile(parts) {
  const [first, second, third] = parts
  if (!first) return null

  // 首页总览
  if (first === 'index') return 'index.json'

  // 函数多中心联调
  if (first === 'multicenter') {
    if (!second) return null
    if ((second === 'invocations' || second === 'migrations') && third) {
      return `multicenter/details/${third}.json`
    }
    return `multicenter/${second}.json`
  }

  // 学科域资源（geodynamics / llm / automotive / uav / drug / dft）
  if (!second) return null
  if (second === 'runs') {
    return third ? `${first}/run-details/${third}.json` : `${first}/runs.json`
  }
  return `${first}/${second}.json`
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
    const rel = resolveMockFile(parts)
    if (!rel) {
      sendJSON(res, 404, {
        code: 404,
        message: `API path not supported: ${pathname}`,
        data: null,
        timestamp: new Date().toISOString(),
      })
      return
    }

    const payload = readJson(rel)
    if (!payload) {
      sendJSON(res, 404, {
        code: 404,
        message: `Mock data not found: ${rel}（数据目录：${MOCK_DATA_DIR}）`,
        data: null,
        timestamp: new Date().toISOString(),
      })
      return
    }

    sendJSON(res, 200, payload)
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
