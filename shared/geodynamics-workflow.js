// Scenario policy is shared by operator selection and backend validation.
// Internal entities belong to the workflow, never to the operator catalog.
export const GEODYNAMICS_WORKFLOW_VERSION = 1

const scenarios = {
  'wave-propagation': {
    fixedOperatorIds: ['supg'],
    reason: 'SUPG 承担本板块现有的稳定化有限元计算阶段，提交时必须保留。',
    previewName: '波场快照与剖面',
  },
  'tectonic-evolution': {
    fixedOperatorIds: ['uzawa'],
    reason: 'Uzawa 承担速度与压力约束的鞍点求解，是本板块的核心计算阶段。',
    previewName: '温度与流速剖面',
  },
}

export function getGeodynamicsPolicy(domain, scenarioId) {
  return domain === 'geodynamics' && Object.hasOwn(scenarios, scenarioId) ? scenarios[scenarioId] : null
}

export function retainFixedOperators(ids, fixedIds) {
  return [...new Set([...fixedIds, ...ids])]
}

// Entity ids correspond to geodynamics-workflow-key.json. The existing prepare
// and post ids remain stable for historical runs and result gating.
export const GEODYNAMICS_ENTITIES = [
  { id: 'prepare', entity_id: 'read', name: '数据读取', description: '读取并校验本板块已准备的模型、参数与边界条件。' },
  { id: 'runtime', entity_id: 'runtime', name: 'CitcomCU 镜像拉取', description: '准备计算环境与求解镜像，和数据读取并行进行。' },
  { id: 'partition', entity_id: 'partition', name: '求解区域划分', description: '等待数据与环境就绪，完成求解区域、网格和初始状态划分。' },
  { id: 'iterate', entity_id: 'iterate', name: '迭代计算与结果收集', description: '收集所选求解分支的结果与收敛信息，等待全部计算分支完成。' },
  { id: 'analyze', entity_id: 'analyze', name: '数据集成分析', description: '整合计算结果、残差和场数据，生成统一结果快照。' },
  { id: 'vtk', entity_id: 'vtk', name: 'CitcomCU 转 ParaView', description: '将场数据快照转换为可供 ParaView 使用的网格数据。' },
  { id: 'preview', entity_id: 'preview', name: '温度与流速剖面', description: '从转换后的网格提取本板块的场快照和剖面图像。' },
  { id: 'post', entity_id: 'package', name: '结果编号归档', description: '等待分析快照、转换网格与剖面图像全部完成，再编号归档并开放结果。' },
]
