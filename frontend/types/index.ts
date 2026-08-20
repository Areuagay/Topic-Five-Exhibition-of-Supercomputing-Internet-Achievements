/**
 * 全局类型定义 —— 与 docs/api 的 OpenAPI 契约及 mock-data 数据结构对齐。
 * 接入真实后端时保持这些字段契约不变，前端代码无需改动。
 */

/** 统一响应结构 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  timestamp: string
}

/* ==================== 首页 / 索引 ==================== */

export interface IndexCluster {
  id: string
  name: string
  location: string
  architecture: string
}

export interface DomainInfo {
  domain: string
  prefix: string
  name: string
  short_name: string
  category: string
  icon: string
  description: string
  scenario_count: number
  run_count: number
  status: string
  scenarios: string[]
  cluster_hint: string[]
}

export interface IndexData {
  title: string
  generated_at: string
  total_records: number
  domains: DomainInfo[]
  clusters: IndexCluster[]
}

/* ==================== 学科域场景 ==================== */

export interface Scenario {
  id: string
  name: string
  category: string
  description: string
  status: string
}

export interface MetricKV {
  label: string
  value: number | string
  unit?: string
}

export interface ArchItem {
  name: string
  description?: string
}

export interface OperatorRef {
  id: string
  name: string
}

export interface ScenarioDetail {
  id: string
  name: string
  category: string
  description: string
  summary_metrics: MetricKV[]
  supported_clusters: string[]
  tech_stack: string[]
  background: string
  method: string
  architecture: ArchItem[]
  operators: OperatorRef[]
  highlights: MetricKV[]
}

export interface ParamField {
  name: string
  label: string
  type: string
  unit?: string
  required?: boolean
  default_value?: unknown
  description?: string
}

/** data 结构：{ [scenarioId]: { fields: ParamField[] } } */
export interface ParamsSchemas {
  [scenarioId: string]: { fields: ParamField[] }
}

export interface BenchmarkDimension {
  key: string
  name: string
  unit: string
}

export interface BenchmarkSeries {
  name: string
  [key: string]: number | string
}

/** data 结构：{ [scenarioId]: { dimensions, series } } */
export interface Benchmark {
  [scenarioId: string]: {
    dimensions: BenchmarkDimension[]
    series: BenchmarkSeries[]
  }
}

export interface Operator {
  name: string
  version: string
  runtime_type: string
  runtime: string
  handler: string
  cpu_cores: number
  gpu_count: number
  memory_mb: number
  status: string
  description: string
}

/* ==================== 运行任务 ==================== */

export interface MetricItem {
  name: string
  label: string
  value: number
  total?: number
  unit?: string
}

export interface Run {
  run_id: string
  domain: string
  scenario_id: string
  scenario_name: string
  status: string
  progress: number
  execution_mode: string
  cluster_id: string
  cluster_name: string
  job_id: string
  current_stage: string
  start_time: string
  end_time: string
  elapsed_seconds: number
  nodes: number
  cpu_cores: number
  gpu_count: number
  memory_gb: number
  core_hours: number
  source_type: string
  has_detail: boolean
  metrics_snapshot: MetricItem[]
}

export interface WorkflowNode {
  id: string
  name: string
  status: string
  progress?: number
  cluster_id?: string
}

export interface WorkflowEdge {
  source: string
  target: string
}

export interface LogLine {
  seq?: number
  timestamp: string
  level: string
  cluster_id?: string
  message: string
}

export interface Artifact {
  id: string
  name: string
  type: string
  format?: string
  /** 字节数 */
  size?: number
  storage_path?: string
  preview_url?: string
  download_url?: string
  created_at?: string
}

/** 运行详情 metrics：通用 metrics + 各域附加指标（scf_series / gpu_metrics / ...） */
export interface RunDetailMetrics {
  progress: number
  metrics: MetricItem[]
  [key: string]: unknown
}

export interface RunDetail {
  run_id: string
  scenario_id: string
  scenario_name?: string
  status: string
  progress: number
  execution_mode: string
  cluster_id: string
  cluster_name?: string
  job_id?: string
  current_stage?: string
  start_time?: string
  end_time?: string
  elapsed_seconds?: number
  nodes?: number
  cpu_cores?: number
  gpu_count?: number
  memory_gb?: number
  core_hours?: number
  source_type?: string
  workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
  metrics: RunDetailMetrics
  logs: { next_offset: number; has_more: boolean; lines: LogLine[] }
  artifacts: Artifact[]
}

/* ==================== 函数多中心联调 ==================== */

export interface MultiCluster {
  id: string
  name: string
  location: string
  architecture: string
  scheduler: string
  status: string
  source_type: string
  total_nodes: number
  total_cores: number
  cpu_utilization: number
  memory_utilization: number
  gpu_count: number
  active_jobs: number
  queue_length: number
  updated_at: string
}

export interface TopoNode {
  id: string
  name: string
  status: string
  source_type?: string
}

export interface TopoLink {
  source: string
  target: string
  status: string
  latency_ms: number
  bandwidth_mbps: number
  packet_loss_percent?: number
  source_type?: string
}

export interface Topology {
  nodes: TopoNode[]
  links: TopoLink[]
}

export interface FunctionInfo {
  id: string
  name: string
  description: string
  version: string
  runtime: string
  image: string
  status: string
  source_type: string
}

export interface Deployment {
  cluster_id: string
  replicas: number
  status: string
  source_type?: string
}

export interface DeploymentMatrixFunction {
  function_id: string
  function_name: string
  deployments: Deployment[]
}

export interface DeploymentMatrix {
  clusters: { id: string; name: string }[]
  functions: DeploymentMatrixFunction[]
}

export interface WorkloadInstance {
  cluster_id: string
  desired_replicas: number
  ready_replicas: number
  cpu_utilization: number
  memory_utilization: number
}

export interface Workload {
  workload_id: string
  function_id: string
  name: string
  status: string
  source_type: string
  instances: WorkloadInstance[]
}

export interface Invocation {
  invocation_id: string
  function_id: string
  function_name: string
  cluster_id: string
  status: string
  source_type: string
  instance_id: string
  start_time: string
  end_time: string
  total_latency_ms: number
  args?: Record<string, unknown>
}

export interface MigrationEvent {
  seq?: number
  event?: string
  name?: string
  status: string
  timestamp: string
  message?: string
  detail?: string
}

export interface Migration {
  migration_id: string
  workload_id: string
  from_cluster: string
  to_cluster: string
  status: string
  source_type: string
  start_time?: string
  end_time?: string
  progress?: number
  events: MigrationEvent[]
}

export interface TraceSpan {
  seq: number
  component: string
  name: string
  cluster_id?: string
  status: string
  latency_ms: number
  start_time: string
}

export interface TraceDetail {
  invocation_id: string
  trace_id: string
  total_latency_ms: number
  source_type: string
  spans: TraceSpan[]
}

export interface MigrationDetail extends Migration {
  reason?: string
  transferred_replicas?: number
  total_size_mb?: number
}
