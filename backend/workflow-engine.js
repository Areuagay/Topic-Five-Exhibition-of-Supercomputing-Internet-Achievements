// Demonstration orchestration rules. These describe independent invocations and
// data preparation/postprocessing, not MPI threads inside a scientific solver.
import { GEODYNAMICS_ENTITIES, GEODYNAMICS_WORKFLOW_VERSION, getGeodynamicsPolicy } from '../shared/geodynamics-workflow.js'
import { getDomainWorkflowTemplate } from './domain-workflows.js'

export const OPERATOR_DEPENDENCIES = {
  geodynamics: {
    supg: [], uzawa: [], 'citcoms-global': [], 'citcoms-regional': [],
  },
  llm: {
    'ai-data-prep': [],
    lightgbm: ['ai-data-prep'], xgboost: ['ai-data-prep'],
    'peft-lora': ['ai-data-prep'], 'transformers-trainer': ['ai-data-prep'],
    'megatron-core': ['ai-data-prep'], 'deepspeed-zero': ['ai-data-prep'],
    'pytorch-fsdp': ['ai-data-prep'], 'pytorch-ddp': ['ai-data-prep'],
  },
  automotive: {
    ipfno: [], transolver: [], 'structural-thermal-load': [],
    'isothermal-film': [], 'film-evolution': ['isothermal-film'],
    'particle-spray': [], 'oil-multiphase-transport': [],
    'oil-multiphase-interface': ['oil-multiphase-transport'],
    'wading-free-surface': [], 'wading-impact': ['wading-free-surface'],
    'auto-thermal-flow': [], 'auto-species-transport': ['auto-thermal-flow'],
    'auto-combustion': ['auto-species-transport'], 'auto-external-flow': [],
  },
  uav: {
    'block-mesh': [], 'fluent-mesh-to-foam': [],
    'check-mesh': ['block-mesh', 'fluent-mesh-to-foam'],
    'set-fields': ['check-mesh'], 'potential-foam': ['set-fields'],
    'decompose-par': ['potential-foam'],
    'solid-displacement': ['decompose-par'], 'incompressible-driftflux': ['decompose-par'],
    'compressible-multiphase-vof': ['decompose-par'], shockfluid: ['decompose-par'],
    'reconstruct-par': ['solid-displacement', 'incompressible-driftflux', 'compressible-multiphase-vof', 'shockfluid'],
    'foam-to-vtk': ['reconstruct-par'], 'postprocess-metrics': ['reconstruct-par'],
  },
  drug: {
    'molecule-generation-diffusion': [], 'molecule-format-conversion': ['molecule-generation-diffusion'],
    'ligand-preparation': ['molecule-format-conversion'], 'receptor-preparation': [],
    'receptor-grid-generation': ['receptor-preparation'],
    'molecular-docking-gpu': ['ligand-preparation', 'receptor-grid-generation'],
    'molecular-docking-cpu': ['ligand-preparation', 'receptor-grid-generation'],
    'pose-energy-extraction': ['molecular-docking-gpu', 'molecular-docking-cpu'],
    'reasonability-assessment': ['pose-energy-extraction'],
  },
  dft: {
    'crystalformer-sample': [], 'crystalformer-structure-convert': ['crystalformer-sample'],
    'symtopo-abinit-input': ['crystalformer-structure-convert'],
    'symtopo-vasp-input': ['crystalformer-structure-convert'],
    'vasp-dft': ['symtopo-vasp-input'],
    'symtopo-band': ['vasp-dft'], 'symtopo-topology': ['symtopo-band'],
    'lammps-md': ['crystalformer-structure-convert'],
    'gromacs-pdb2gmx': [], 'gromacs-insert-molecules': ['gromacs-pdb2gmx'],
    'gromacs-editconf': ['gromacs-insert-molecules'], 'gromacs-solvate': ['gromacs-editconf'],
    'gromacs-grompp': ['gromacs-solvate'], 'gromacs-mdrun': ['gromacs-grompp'],
  },
}

export function analyzeWorkflow(workflow) {
  const nodes = new Map(workflow.nodes.map(node => [node.id, node]))
  if (!nodes.size || nodes.size !== workflow.nodes.length) throw new Error('工作流节点不能为空或重复')
  const incoming = new Map([...nodes.keys()].map(id => [id, []]))
  const outgoing = new Map([...nodes.keys()].map(id => [id, []]))
  for (const edge of workflow.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target) || edge.source === edge.target) throw new Error('工作流依赖引用无效')
    if (incoming.get(edge.target).includes(edge.source)) continue
    incoming.get(edge.target).push(edge.source)
    outgoing.get(edge.source).push(edge.target)
  }
  const degrees = new Map([...incoming].map(([id, parents]) => [id, parents.length]))
  const order = [...nodes.keys()].filter(id => !degrees.get(id))
  const ranks = new Map(order.map(id => [id, 0]))
  for (const id of order) for (const target of outgoing.get(id)) {
    ranks.set(target, Math.max(ranks.get(target) ?? 0, ranks.get(id) + 1))
    degrees.set(target, degrees.get(target) - 1)
    if (!degrees.get(target)) order.push(target)
  }
  if (order.length !== nodes.size) throw new Error('工作流依赖存在循环')
  return { incoming, outgoing, order, ranks, parallel: new Set(ranks.values()).size < nodes.size }
}

function buildGeodynamicsWorkflow(nodes, ticksPerNode, policy) {
  const operators = nodes.filter(node => node.operator_id).map(node => ({
    ...node,
    node_kind: 'operator',
    selection_class: policy.fixedOperatorIds.includes(node.operator_id) ? 'fixed' : 'optional',
  }))
  const byOperator = new Map(operators.map(node => [node.operator_id, node.id]))
  const internal = GEODYNAMICS_ENTITIES.map(entity => ({
    ...entity,
    name: entity.id === 'preview' ? policy.previewName : entity.name,
    node_kind: 'internal',
    status: 'pending', progress: 0, duration_ticks: ticksPerNode,
  }))
  const edges = [
    { source: 'prepare', target: 'partition', source_port: 'model', target_port: 'model' },
    { source: 'runtime', target: 'partition', source_port: 'environment', target_port: 'environment' },
  ]
  // A Stokes velocity/pressure stage precedes stabilized transport when both
  // interfaces are selected. CitcomS invocations are separate comparison runs.
  for (const node of operators) {
    const parent = node.operator_id === 'supg' ? byOperator.get('uzawa') : null
    edges.push({ source: parent || 'partition', target: node.id })
  }
  const nonLeaves = new Set(edges.map(edge => edge.source))
  for (const node of operators.filter(node => !nonLeaves.has(node.id))) {
    edges.push({ source: node.id, target: 'iterate', source_port: 'results', target_port: 'results' })
  }
  if (!operators.length) edges.push({ source: 'partition', target: 'iterate' })
  edges.push(
    { source: 'iterate', target: 'analyze', source_port: 'results', target_port: 'results' },
    { source: 'analyze', target: 'vtk', source_port: 'snapshot', target_port: 'snapshot' },
    { source: 'vtk', target: 'preview', source_port: 'grid', target_port: 'grid' },
    { source: 'analyze', target: 'post', source_port: 'snapshot', target_port: 'snapshot' },
    { source: 'vtk', target: 'post', source_port: 'grid', target_port: 'grid' },
    { source: 'preview', target: 'post', source_port: 'image', target_port: 'image' },
  )
  const workflow = {
    nodes: [...internal.slice(0, 3), ...operators, ...internal.slice(3)],
    edges,
    template_id: 'citcomcu.geodynamics.workflow',
    template_version: GEODYNAMICS_WORKFLOW_VERSION,
  }
  analyzeWorkflow(workflow)
  return workflow
}

/** Keep only dependencies that cannot already be reached through another edge. */
function reduceDependencies(nodes, edges) {
  const outgoing = new Map(nodes.map(node => [node.id, []]))
  for (const edge of edges) outgoing.get(edge.source).push(edge.target)
  return edges.filter(edge => {
    const queue = outgoing.get(edge.source).filter(id => id !== edge.target)
    const seen = new Set()
    for (const id of queue) {
      if (id === edge.target) return false
      if (seen.has(id)) continue
      seen.add(id)
      queue.push(...outgoing.get(id).filter(next => !seen.has(next)))
    }
    return true
  })
}

function buildDomainWorkflow(nodes, ticksPerNode, rules, template) {
  const selected = new Map(nodes.filter(node => node.operator_id).map(node => [`@${node.operator_id}`, {
    ...node, node_kind: 'operator', selection_class: 'optional',
  }]))
  const nonLeaves = new Set(Object.values(rules).flat())
  const resultNames = template.result_slots ?? Object.keys(rules).filter(name => !nonLeaves.has(name))
  const expand = refs => [...new Set(refs.flatMap(ref => ref === '$results' ? resultNames.map(name => `@${name}`) : [ref]))]
  const dependencies = new Map(template.nodes.map(node => [node.id, expand(node.depends_on)]))
  for (const [name, parents] of Object.entries(rules)) {
    dependencies.set(`@${name}`, [...new Set([
      ...parents.map(parent => `@${parent}`),
      ...(template.operator_hooks?.[name] ?? template.operator_inputs),
    ])])
  }
  // Validate the complete template, including optional slots, before projection.
  analyzeWorkflow({
    nodes: [...dependencies.keys()].map(id => ({ id })),
    edges: [...dependencies].flatMap(([target, sources]) => sources.map(source => ({ source, target }))),
  })
  const kept = new Map(template.nodes.map(({ depends_on, ...entity }) => [entity.id, {
    ...entity, entity_id: entity.id, node_kind: 'internal', status: 'pending', progress: 0,
    duration_ticks: ticksPerNode * entity.duration_weight,
  }]))
  for (const [key, node] of selected) kept.set(key, node)
  const memo = new Map()
  const nearestInputs = key => {
    if (kept.has(key)) return [key]
    if (!memo.has(key)) memo.set(key, [...new Set(dependencies.get(key).flatMap(nearestInputs))])
    return memo.get(key)
  }
  const edges = [...kept].flatMap(([key, node]) =>
    [...new Set(dependencies.get(key).flatMap(nearestInputs))].map(parent => ({ source: kept.get(parent).id, target: node.id })),
  )
  const workflow = {
    nodes: [...kept.values()],
    edges: reduceDependencies([...kept.values()], edges),
    template_id: template.id,
    template_version: template.version,
    template_title: template.title,
    template_summary: template.summary,
  }
  const graph = analyzeWorkflow(workflow)
  const byId = new Map(workflow.nodes.map(node => [node.id, node]))
  workflow.nodes = graph.order.map(id => byId.get(id))
  return workflow
}

export function buildOperatorWorkflow(domain, nodes, ticksPerNode, scenarioId) {
  const rules = OPERATOR_DEPENDENCIES[domain] ?? {}
  const operators = nodes.filter(n => n.operator_id)
  const known = operators.every(n => Object.hasOwn(rules, n.operator_id))
  // Unknown integrations preserve the original selected-order serial contract.
  if (!known) return { nodes, edges: nodes.slice(1).map((n,i) => ({ source:nodes[i].id, target:n.id })) }
  const policy = getGeodynamicsPolicy(domain, scenarioId)
  if (policy) return buildGeodynamicsWorkflow(nodes, ticksPerNode, policy)
  const template = getDomainWorkflowTemplate(domain, scenarioId)
  if (template) return buildDomainWorkflow(nodes, ticksPerNode, rules, template)
  const selected = new Map(operators.map(n => [n.operator_id, n.id]))
  const ancestors = (name, visiting = new Set()) => {
    if (visiting.has(name)) throw new Error('算子依赖存在循环')
    const path = new Set([...visiting, name])
    return [...new Set((rules[name] ?? []).flatMap(parent => selected.has(parent) ? [selected.get(parent)] : ancestors(parent, path)))]
  }
  const edges = []
  for (const op of operators) {
    const parents = ancestors(op.operator_id)
    for (const source of parents.length ? parents : ['prepare']) edges.push({ source, target:op.id })
  }
  const nonLeaves = new Set(edges.map(e => e.source))
  for (const op of operators.filter(n => !nonLeaves.has(n.id))) edges.push({source:op.id,target:'post'})
  if (!operators.length) edges.push({source:'prepare',target:'post'})
  const workflow = { nodes, edges }
  const graph = analyzeWorkflow(workflow)
  if (graph.parallel) {
    // Distinct, reproducible durations within a parallel layer make fast and
    // slow branches observable. Pure chains retain their existing timing.
    const layers = new Map()
    for (const node of nodes) {
      const rank = graph.ranks.get(node.id)
      const layer = layers.get(rank) ?? []; layer.push(node); layers.set(rank,layer)
    }
    for (const layer of layers.values()) {
      layer.sort((a,b) => (a.operator_id ?? a.id).localeCompare(b.operator_id ?? b.id))
      layer.forEach((node,index) => { node.duration_ticks = ticksPerNode + index * 2 })
    }
  }
  return workflow
}

export function advanceWorkflow(workflow, ticksPerNode, secondsPerTick) {
  const { incoming, outgoing, order } = analyzeWorkflow(workflow)
  const byId = new Map(workflow.nodes.map(n => [n.id,n]))
  // Snapshot completed parents before the tick: a join cannot run during the
  // same tick in which its final prerequisite completes.
  const completed = new Set(workflow.nodes.filter(n => n.status === 'success' && n.progress >= 100).map(n => n.id))
  for (const node of workflow.nodes) {
    if (['failed','stopped','blocked'].includes(node.status) || completed.has(node.id)) continue
    if (!incoming.get(node.id).every(id => completed.has(id))) continue
    const duration = node.duration_ticks || ticksPerNode
    node._elapsed_ticks = (node._elapsed_ticks ?? (node.progress || 0) / 100 * duration) + 1
    node.progress = Math.round(Math.min(100, node._elapsed_ticks / duration * 100) * 100) / 100
    node.elapsed_seconds = Math.round(node._elapsed_ticks * secondsPerTick)
  }
  for (const id of order) {
    const node = byId.get(id)
    if (['failed','stopped','blocked'].includes(node.status)) continue
    const parents = incoming.get(id).map(parent => byId.get(parent))
    if (parents.some(p => ['failed','stopped','blocked'].includes(p.status))) node.status = 'blocked'
    else node.status = node.progress >= 100 ? 'success' : parents.every(p => p.status === 'success') ? 'running' : 'pending'
    node.waiting_for = parents.filter(p => p.status !== 'success').map(p => p.id)
    node.waiting_at_join = node.status === 'success' && outgoing.get(id).some(target => {
      const peers = incoming.get(target)
      return peers.length > 1 && peers.some(peer => byId.get(peer).status !== 'success')
    })
  }
  // Re-evaluate joins after all statuses have been updated.
  for (const node of workflow.nodes) {
    node.waiting_at_join = node.status === 'success' && outgoing.get(node.id).some(target => incoming.get(target).length > 1 && incoming.get(target).some(peer => byId.get(peer).status !== 'success'))
  }
  return workflow.nodes.every(n => n.status === 'success')
}
