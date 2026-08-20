import { createError, defineEventHandler, getRouterParam } from 'h3'
import { readMockData, resolveMockFile } from '../utils/mock'

/**
 * 统一 mock API 端点：GET /api/[...path]
 * 读取 ../mock-data 下的 JSON 文件并原样返回（文件本身即统一响应结构
 * { code, message, data, timestamp }）。
 *
 * 接入真实后端时无需改动前端代码：仅需在 nuxt.config.ts 中配置
 * runtimeConfig.public.apiBase 指向真实 API 网关。
 */
export default defineEventHandler((event) => {
  // catch-all 参数名与文件名 [...path] 保持一致
  const raw = getRouterParam(event, 'path') ?? ''
  const parts = raw.split('/').filter(Boolean)

  const rel = resolveMockFile(parts)
  if (!rel) {
    throw createError({ statusCode: 404, statusMessage: `API path not supported: /api/${raw}` })
  }

  const payload = readMockData(rel)
  if (payload === null) {
    throw createError({ statusCode: 404, statusMessage: `Mock data not found: ${rel}` })
  }

  return payload
})
