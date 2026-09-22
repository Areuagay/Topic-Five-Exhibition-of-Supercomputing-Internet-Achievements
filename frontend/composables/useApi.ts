import type {
  ApiResponse,
  Benchmark,
  DatasetItem,
  DeploymentMatrix,
  FunctionInfo,
  ImportResult,
  IndexData,
  Invocation,
  Migration,
  MigrationDetail,
  MultiCluster,
  Operator,
  OperatorSubmitResult,
  ParamsSchemas,
  Run,
  RunAdvanceResult,
  RunDetail,
  Scenario,
  ScenarioDetail,
  Topology,
  TraceDetail,
  UploadSample,
  Workload,
} from '~/types'
import type { RunMetrics } from '~/types/domain-data'

/**
 * API 访问层。
 *
 * - 默认（apiBase 为空）：请求本地模拟后端 /api/v1/...，由 nuxt.config.ts 的
 *   routeRules.proxy 转发到 backend/server.js（默认端口 3001）；
 * - 接入真实后端：在 nuxt.config.ts 中配置 runtimeConfig.public.apiBase 指向真实 API
 *   网关（如 https://api.example.com/api/v1），前端代码零改动。
 */
function baseURL(): string {
  const config = useRuntimeConfig()
  return config.public.apiBase || '/api/v1'
}

async function request<T>(path: string): Promise<T> {
  const res = await $fetch<ApiResponse<T>>(`${baseURL()}${path}`)
  if (res.code !== 200) {
    throw new Error(res.message || `请求失败（code=${res.code}）`)
  }
  return res.data
}

/** 写请求（POST/PUT/PATCH/DELETE），统一解包 ApiResponse */
async function mutate<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const res = await $fetch<ApiResponse<T>>(`${baseURL()}${path}`, {
    method,
    body: (body ?? undefined) as Record<string, unknown> | undefined,
  })
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
    getScenarios: (domain: string) => request<Scenario[]>(`/${domain}/scenarios`),
    getScenarioDetails: (domain: string) =>
      request<ScenarioDetail[]>(`/${domain}/scenario-details`),
    getParamsSchemas: (domain: string) =>
      request<ParamsSchemas>(`/${domain}/params-schema`),
    getBenchmarks: (domain: string) => request<Benchmark>(`/${domain}/benchmark`),
    getDatasets: (domain: string) => request<DatasetItem[]>(`/${domain}/datasets`),
    getOperators: (domain: string) => request<Operator[]>(`/${domain}/operators`),
    getRuns: (domain: string) => request<Run[]>(`/${domain}/runs`),
    getRunDetail: (domain: string, runId: string) =>
      request<Omit<RunDetail, 'workflow' | 'metrics' | 'logs' | 'artifacts'>>(`/${domain}/runs/${runId}`),
    getRunWorkflow: (domain: string, runId: string) =>
      request<RunDetail['workflow']>(`/${domain}/runs/${runId}/workflow`),
    getRunMetrics: (domain: string, runId: string) =>
      request<RunMetrics>(`/${domain}/runs/${runId}/metrics`),
    getRunLogs: (domain: string, runId: string) =>
      request<RunDetail['logs']>(`/${domain}/runs/${runId}/logs`),
    getRunArtifacts: (domain: string, runId: string) =>
      request<RunDetail['artifacts']>(`/${domain}/runs/${runId}/artifacts`),

    // 一键体验 · 数据准备与流程写接口
    getUploadSamples: (domain: string) => request<UploadSample[]>(`/${domain}/upload-samples`),
    uploadDataset: (domain: string, datasetId: string) =>
      mutate<DatasetItem>(`/${domain}/datasets/${datasetId}/upload`, 'POST'),
    resetDataset: (domain: string, datasetId: string) =>
      mutate<DatasetItem>(`/${domain}/datasets/${datasetId}`, 'DELETE'),
    importDatasets: (domain: string, scenarioId: string) =>
      mutate<ImportResult>(`/${domain}/scenarios/${scenarioId}/import`, 'POST'),
    submitOperators: (domain: string, scenarioId: string, operatorIds: string[]) =>
      mutate<OperatorSubmitResult>(`/${domain}/scenarios/${scenarioId}/operators/submit`, 'POST', {
        operator_ids: operatorIds,
      }),
    advanceRun: (domain: string, runId: string) =>
      mutate<RunAdvanceResult>(`/${domain}/runs/${runId}/advance`, 'POST'),

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
