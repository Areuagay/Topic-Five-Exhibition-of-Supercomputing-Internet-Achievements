/**
 * 一键体验流程配置。
 *
 * 六步流程：数据准备 → 资源调度 → 算子选择 → 流程编排 → 执行监控 → 结果展示。
 * 六个学科域（地球动力学、AI 大模型、汽车结构仿真、无人机协同、药物筛选、材料计算）
 * 的全部场景均启用体验容器，用于预置页面样式；「一键体验」自动引导功能将基于此配置
 * 驱动步骤流转（当前仅做展示，不实现自动跳转）。
 *
 * 各步骤中与学科强相关的固定标签（数据集类型、工作流阶段中文名）按领域维护，
 * 由 getDatasetTypeLabels / getStageLabels 按域读取，组件内不内嵌学科文案。
 */

/**
 * 步骤承载方式：
 * - 'live'：子前端内直接渲染（数据来自后端接口）；
 * - 'external'：预留跳转主前端对应页面（当前以模拟页面占位展示）。
 */
export type ExperienceStepMode = 'live' | 'external'

export interface ExperienceStep {
  /** 稳定标识，用于状态与测试断言 */
  key: string
  /** 步骤序号，从 1 开始 */
  index: number
  /** 中文步骤名 */
  title: string
  /** 英文步骤名 */
  english: string
  /** 一句话说明该步骤的目标 */
  summary: string
  /** 承载方式 */
  mode: ExperienceStepMode
}

export const experienceSteps: ExperienceStep[] = [
  {
    key: 'data',
    index: 1,
    title: '数据准备',
    english: 'Data Preparation',
    summary: '准备速度模型、震源参数与边界条件等仿真输入数据',
    mode: 'live',
  },
  {
    key: 'resource',
    index: 2,
    title: '资源调度',
    english: 'Resource Scheduling',
    summary: '选择算力中心与资源池并提交调度策略',
    mode: 'external',
  },
  {
    key: 'operator',
    index: 3,
    title: '算子选择',
    english: 'Operator Selection',
    summary: '选择本次仿真所需的科学计算算子',
    mode: 'external',
  },
  {
    key: 'workflow',
    index: 4,
    title: '流程编排',
    english: 'Workflow Orchestration',
    summary: '查看工作流 DAG 节点与执行依赖关系',
    mode: 'live',
  },
  {
    key: 'monitor',
    index: 5,
    title: '执行监控',
    english: 'Execution Monitoring',
    summary: '跟踪任务运行状态、进度与资源指标',
    mode: 'live',
  },
  {
    key: 'result',
    index: 6,
    title: '结果展示',
    english: 'Result Display',
    summary: '内联展示流程编排所选运行记录的完整详情',
    mode: 'live',
  },
]

/**
 * 各学科域数据集类型标签（「数据准备」步骤「类型」列）。
 * 键为 domain，值为 数据集 type → 中文标签 的映射。
 */
export const experienceDatasetTypeLabels: Record<string, Record<string, string>> = {
  geodynamics: {
    velocity_model: '速度模型',
    source_model: '震源模型',
    boundary_condition: '边界条件',
    station_geometry: '观测系统',
    travel_time: '走时数据',
    lithosphere_geometry: '岩石圈模型',
    rheology_params: '物性参数',
    plate_motion: '板块运动',
    mantle_temperature: '温度场',
  },
  llm: {
    training_corpus: '训练语料',
    tokenizer: '分词器',
    model_checkpoint: '模型检查点',
    parallel_config: '并行配置',
    physics_config: '物理约束配置',
    sample_grid: '采样网格',
    boundary_condition: '边界条件',
  },
  automotive: {
    cad_model: '整车CAD模型',
    mesh_model: '网格模型',
    material_params: '材料参数',
    boundary_condition: '边界条件',
    contact_definition: '接触定义',
    test_standard: '法规工况',
    load_spectrum: '载荷谱',
    sn_curve: 'S-N曲线',
  },
  uav: {
    environment_map: '环境地图',
    swarm_config: '集群配置',
    comm_topology: '通信拓扑',
    formation_shape: '编队构型',
    obstacle_data: '障碍物数据',
    mission_plan: '任务规划',
  },
  drug: {
    compound_library: '化合物库',
    target_protein: '靶点蛋白',
    docking_params: '对接参数',
    molecular_descriptors: '分子描述符',
    admet_model: 'ADMET模型',
    reference_ligand: '参考配体',
    reference_dataset: '参考数据集',
  },
  dft: {
    crystal_structure: '晶体结构',
    pseudopotential: '赝势文件',
    kpoints: 'K点网格',
    calculation_params: '计算参数',
    structure_set: '结构集',
    material_database: '材料数据库',
  },
}

/**
 * 跨学科通用的工作流阶段标签，作为各领域映射的兜底（如「准备环境/网格划分/结果后处理」等）。
 * 领域专属阶段在 experienceStageLabels 中覆盖同名键。
 */
export const experienceCommonStageLabels: Record<string, string> = {
  prepare: '准备环境',
  preprocessing: '数据预处理',
  partition: '网格划分',
  postprocess: '结果后处理',
  postprocessing: '结果后处理',
}

/**
 * 各学科域工作流阶段标签（「流程编排」步骤「当前阶段」）。
 * 键为 domain，值为 运行 current_stage → 中文标签 的映射。
 */
export const experienceStageLabels: Record<string, Record<string, string>> = {
  geodynamics: {
    prepare: '准备环境',
    partition: '网格划分',
    solver: '并行求解',
    'time-stepping': '时间步进求解',
    'coupled-solving': '热-力学耦合求解',
    postprocess: '结果后处理',
    completed: '计算完成',
    pending: '待启动',
    stopped: '已停止',
  },
  llm: {
    train: '分布式训练',
    completed: '训练完成',
    pending: '待启动',
    stopped: '已停止',
  },
  automotive: {
    solver: '并行显式求解',
    partition: '区域分解',
    'fatigue-analysis': '疲劳寿命分析',
    completed: '计算完成',
    pending: '待启动',
    stopped: '已停止',
  },
  uav: {
    planning: '航迹规划',
    simulation: '集群动力学仿真',
    completed: '计算完成',
    pending: '待启动',
    stopped: '已停止',
  },
  drug: {
    'molecule-featurization': '分子特征化',
    shard: '化合物库分片',
    'multi-center-docking': '多中心分子对接',
    property: '性质预测',
    completed: '计算完成',
    pending: '待启动',
    stopped: '已停止',
  },
  dft: {
    scf: '自洽场迭代',
    band: '能带结构计算',
    'batch-scf': '批量自洽场计算',
    'batch-relax': '批量结构弛豫',
    completed: '计算完成',
    pending: '待启动',
    stopped: '已停止',
  },
}

export interface ScenarioExperience {
  title: string
  description: string
}

const DEFAULT_EXPERIENCE_DESCRIPTION = '数据准备 → 资源调度 → 算子选择 → 流程编排 → 执行监控 → 结果展示'

/** 已开放（预置样式）一键体验的场景：六个学科域全部场景 */
export const scenarioExperiences: Record<string, ScenarioExperience> = {
  // 地球动力学模拟
  'wave-propagation': { title: '地震波传播模拟', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  'tectonic-evolution': { title: '板块构造数值模拟', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  // AI 大模型训练
  'llm-pretraining': { title: '大语言模型分布式预训练', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  'pinn-acceleration': { title: '科学计算AI加速（PINN）', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  // 汽车结构仿真
  'vehicle-crash': { title: '整车碰撞仿真', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  'fatigue-life': { title: '结构疲劳寿命预测', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  // 大规模无人机协同仿真
  'swarm-coordination': { title: '千架无人机集群协同控制', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  'path-planning': { title: '航迹规划与避障', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  // 跨中心虚拟药物筛选
  'virtual-screening': { title: '百万级化合物库虚拟筛选', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  'admet-prediction': { title: '药物分子ADMET性质预测', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  // 第一性原理材料计算
  'band-dos': { title: '材料能带结构与态密度计算', description: DEFAULT_EXPERIENCE_DESCRIPTION },
  'high-throughput-screening': { title: '高通量材料筛选', description: DEFAULT_EXPERIENCE_DESCRIPTION },
}

export function getScenarioExperience(id: string): ScenarioExperience | undefined {
  return Object.hasOwn(scenarioExperiences, id) ? scenarioExperiences[id] : undefined
}

/** 读取指定学科域数据集类型标签；未知领域返回空映射，组件回退展示原始 type。 */
export function getDatasetTypeLabels(domain: string): Record<string, string> {
  return experienceDatasetTypeLabels[domain] ?? {}
}

/** 读取指定学科域工作流阶段标签（含通用兜底）；未知领域仅返回通用映射，组件回退展示原始 stage。 */
export function getStageLabels(domain: string): Record<string, string> {
  return { ...experienceCommonStageLabels, ...(experienceStageLabels[domain] ?? {}) }
}
