import type {
  ApiResponse,
  Benchmark,
  DeploymentMatrix,
  FunctionInfo,
  IndexData,
  Invocation,
  Migration,
  MigrationDetail,
  MultiCluster,
  Operator,
  ParamsSchemas,
  Run,
  RunDetail,
  Scenario,
  ScenarioDetail,
  Topology,
  TraceDetail,
  Workload,
} from '~/types'

/**
 * API 访问层。
 *
 * - 默认（apiBase 为空）：请求本服务 Nitro mock 端点 /api/...，由 server/api/[...path].ts
 *   读取 ../mock-data 返回模拟数据；
 * - 接入真实后端：在 nuxt.config.ts 中配置 runtimeConfig.public.apiBase 指向真实 API
 *   网关（如 https://api.example.com/api/v1），前端代码零改动。
 */
function baseURL(): string {
  const config = useRuntimeConfig()
  return config.public.apiBase || '/api'
}

async function request<T>(path: string): Promise<T> {
  const res = await $fetch<ApiResponse<T>>(`${baseURL()}${path}`)
  if (res.code !== 200) {
    throw new Error(res.message || `请求失败（code=${res.code}）`)
  }
  return res.data
}

export function useApi() {
  return {
    // 首页
    getIndex: () => request<IndexData>('/index'),

    // 学科域
    getScenarios: (domain: string) => request<Scenario[]>(`/domains/${domain}/scenarios`),
    getScenarioDetails: (domain: string) =>
      request<ScenarioDetail[]>(`/domains/${domain}/scenario-details`),
    getParamsSchemas: (domain: string) =>
      request<ParamsSchemas>(`/domains/${domain}/params-schema`),
    getBenchmarks: (domain: string) => request<Benchmark>(`/domains/${domain}/benchmark`),
    getOperators: (domain: string) => request<Operator[]>(`/domains/${domain}/operators`),
    getRuns: (domain: string) => request<Run[]>(`/domains/${domain}/runs`),
    getRunDetail: (domain: string, runId: string) =>
      request<RunDetail>(`/domains/${domain}/runs/${runId}`),

    // 函数多中心联调
    getClusters: () => request<MultiCluster[]>('/multicenter/clusters'),
    getTopology: () => request<Topology>('/multicenter/topology'),
    getFunctions: () => request<FunctionInfo[]>('/multicenter/functions'),
    getDeploymentMatrix: () => request<DeploymentMatrix>('/multicenter/deployment-matrix'),
    getWorkloads: () => request<Workload[]>('/multicenter/workloads'),
    getInvocations: () => request<Invocation[]>('/multicenter/invocations'),
    getMigrations: () => request<Migration[]>('/multicenter/migrations'),
    getInvocationDetail: (id: string) =>
      request<TraceDetail>(`/multicenter/invocations/${id}`),
    getMigrationDetail: (id: string) =>
      request<MigrationDetail>(`/multicenter/migrations/${id}`),
  }
}
