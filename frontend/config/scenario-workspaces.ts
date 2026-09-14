export const scenarioWorkspaces = {
  'wave-propagation': { domain: 'geodynamics', title: '地震波传播', available: true },
  'tectonic-evolution': { domain: 'geodynamics', title: '板块构造', available: true },
  'llm-pretraining': { domain: 'llm', title: '大语言模型预训练', available: true },
  'pinn-acceleration': { domain: 'llm', title: 'PINN 科学计算', available: true },
  'vehicle-crash': { domain: 'automotive', title: '整车碰撞', available: true },
  'fatigue-life': { domain: 'automotive', title: '疲劳寿命', available: true },
  'swarm-coordination': { domain: 'uav', title: '无人机集群协同', available: true },
  'path-planning': { domain: 'uav', title: '航迹规划', available: true },
  'virtual-screening': { domain: 'drug', title: '化合物虚拟筛选', available: true },
  'admet-prediction': { domain: 'drug', title: 'ADMET 性质预测', available: true },
  'band-dos': { domain: 'dft', title: '能带与态密度', available: true },
  'high-throughput-screening': { domain: 'dft', title: '高通量材料筛选', available: true },
} as const

export type ScenarioId = keyof typeof scenarioWorkspaces
export function getScenarioWorkspace(id: string) {
  return Object.hasOwn(scenarioWorkspaces, id) ? scenarioWorkspaces[id as ScenarioId] : undefined
}
