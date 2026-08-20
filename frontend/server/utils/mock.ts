import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 将前端请求路径映射为 mock-data 下的 JSON 文件相对路径。
 * 与 docs/api 的 OpenAPI 路径约定保持一致的简易映射：
 *
 *  GET /api/index                       → index.json
 *  GET /api/domains/:domain/scenarios   → {domain}/scenarios.json
 *  GET /api/domains/:domain/benchmark   → {domain}/benchmark.json
 *  GET /api/domains/:domain/runs        → {domain}/runs.json
 *  GET /api/domains/:domain/runs/:id    → {domain}/run-details/{id}.json
 *  GET /api/multicenter/clusters        → multicenter/clusters.json
 *  GET /api/multicenter/invocations/:id → multicenter/details/{id}.json
 *  ...
 */
export function resolveMockFile(parts: string[]): string | null {
  const [first, second, third, fourth] = parts
  if (!first) return null

  if (first === 'index') {
    return 'index.json'
  }

  if (first === 'domains' && second) {
    if (third === 'runs') {
      // 运行详情：run-details/{runId}.json
      if (fourth) return `${second}/run-details/${fourth}.json`
      // 运行列表：runs.json
      return `${second}/runs.json`
    }
    // 场景/详情/参数/基准/算子
    if (third) return `${second}/${third}.json`
    return null
  }

  if (first === 'multicenter') {
    if (second === 'invocations' || second === 'migrations') {
      // 详情子目录
      if (third) return `multicenter/details/${third}.json`
      // 列表文件
      return `multicenter/${second}.json`
    }
    if (second) return `multicenter/${second}.json`
    return null
  }

  return null
}

/**
 * 读取 mock-data 下的 JSON 文件（支持 MOCK_DATA_DIR 环境变量覆盖，便于部署）。
 * dev 运行时 cwd 为 frontend/，mock 数据位于上级目录 ../mock-data。
 */
export function readMockData(relPath: string): unknown | null {
  const base = process.env.MOCK_DATA_DIR || resolve(process.cwd(), '..', 'mock-data')
  const candidates = [
    resolve(base, relPath),
    resolve(process.cwd(), 'mock-data', relPath),
  ]
  for (const file of candidates) {
    try {
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, 'utf-8'))
      }
    } catch {
      /* 忽略单个候选解析失败，继续尝试下一个 */
    }
  }
  return null
}
