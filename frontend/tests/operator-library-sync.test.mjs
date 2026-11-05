import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DOMAINS = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']
const DOMAIN_COUNTS = { geodynamics: 4, llm: 9, automotive: 14, uav: 13, drug: 9, dft: 14 }
const SCENARIO_COUNTS = {
  'wave-propagation': 1,
  'tectonic-evolution': 3,
  'llm-pretraining': 5,
  'pinn-acceleration': 4,
  'vehicle-crash': 11,
  'fatigue-life': 3,
  'swarm-coordination': 5,
  'path-planning': 8,
  'virtual-screening': 6,
  'admet-prediction': 3,
  'band-dos': 5,
  'high-throughput-screening': 9,
}
const EXCLUDED_TAGS = new Set(['生物信息场景', '通用计算场景'])
const LEGACY_OPERATOR_IDS = [
  'fd-wave-solver', 'fem-pde-solver', 'fft-operator', 'sparse-matrix', 'nonlinear-solver',
  'crash-solver', 'structural-mechanics', 'fatigue-analysis',
  'ai-train-megatron', 'ai-train-pinn', 'ai-eval-perplexity', 'ai-eval-pinn',
  'consensus-control', 'collision-detection',
  'molecular-docking', 'score-merge', 'admet-predict', 'property-report',
  'band-dos-post', 'scf-solver', 'high-throughput-runner',
]

async function readJson(...parts) {
  const text = await readFile(resolve(ROOT, ...parts), 'utf8')
  return JSON.parse(text.replace(/^\uFEFF/, ''))
}

function scenarioList(document) {
  return Array.isArray(document.data) ? document.data : Object.values(document.data)
}

test('operator snapshot, assignments and generated domains stay one-to-one', async () => {
  const snapshot = await readJson('mock-data', 'operator-library', 'backend-operators.json')
  const assignments = await readJson('scripts', 'operator-library-assignments.json')

  assert.equal(snapshot.count, 87)
  assert.equal(snapshot.records.length, 87)
  assert.equal(assignments.assignments.length, 63)

  const excluded = snapshot.records.filter(record => EXCLUDED_TAGS.has(record.tags))
  const included = snapshot.records.filter(record => !EXCLUDED_TAGS.has(record.tags))
  assert.equal(excluded.length, 24)
  assert.equal(included.length, 63)
  assert.deepEqual(
    [...assignments.assignments.map(item => item.backend_id)].sort(),
    [...included.map(record => record.id)].sort(),
  )
  assert.equal(new Set(assignments.assignments.map(item => item.title)).size, 63)
  assert.equal(new Set(assignments.assignments.map(item => item.slug)).size, 63)

  const counts = Object.fromEntries(DOMAINS.map(domain => [
    domain,
    assignments.assignments.filter(item => item.domain === domain).length,
  ]))
  assert.deepEqual(counts, DOMAIN_COUNTS)

  const snapshotById = new Map(snapshot.records.map(record => [record.id, record]))
  for (const assignment of assignments.assignments) {
    const record = snapshotById.get(assignment.backend_id)
    assert.ok(DOMAINS.includes(assignment.domain), assignment.domain)
    assert.equal(record?.title, assignment.title)
    assert.ok(!EXCLUDED_TAGS.has(record?.tags), `${assignment.title} 属于排除标签`)
  }
})

test('every generated operator card comes from the backend title and keeps resource detail', async () => {
  const snapshot = await readJson('mock-data', 'operator-library', 'backend-operators.json')
  const titles = new Set(snapshot.records.map(record => record.title))
  let total = 0

  for (const domain of DOMAINS) {
    const operators = (await readJson('mock-data', domain, 'operators.json')).data
    total += operators.length
    assert.equal(operators.length, DOMAIN_COUNTS[domain], domain)
    assert.equal(new Set(operators.map(item => item.name)).size, operators.length, domain)

    for (const operator of operators) {
      assert.ok(!EXCLUDED_TAGS.has(operator.backend_tags), `${domain}/${operator.name} 不应包含排除标签`)
      assert.ok(operator.title, `${domain}/${operator.name} title`)
      assert.ok(titles.has(operator.title), `${domain}/${operator.name} title from backend`)
      assert.ok(operator.description, `${domain}/${operator.name} description`)
      assert.ok(operator.description_full, `${domain}/${operator.name} full description`)
      assert.ok(operator.runtime_type, `${domain}/${operator.name} runtime_type`)
      assert.ok(operator.handler, `${domain}/${operator.name} handler`)
      assert.equal(operator.status, 'registered')
      assert.ok(operator.backend_id)
      assert.ok(Number.isInteger(operator.cpu_cores))
      assert.ok(Number.isInteger(operator.gpu_count))
      assert.ok(Number.isInteger(operator.memory_mb))
      assert.ok(operator.resource_requirement)
    }
  }

  assert.equal(total, 63)
})

test('scenario recommendations are subsets of each domain operator list and cover every operator', async () => {
  for (const domain of DOMAINS) {
    const operators = (await readJson('mock-data', domain, 'operators.json')).data
    const byName = new Map(operators.map(item => [item.name, item]))
    const details = scenarioList(await readJson('mock-data', domain, 'scenario-details.json'))
    const recommended = new Set()

    for (const scenario of details) {
      assert.ok(Array.isArray(scenario.operators) && scenario.operators.length > 0, `${domain}/${scenario.id}`)
      for (const reference of scenario.operators) {
        const operator = byName.get(reference.id)
        assert.ok(operator, `${domain}/${scenario.id} references ${reference.id}`)
        assert.equal(reference.name, operator.title)
        recommended.add(reference.id)
      }
    }

    assert.equal(recommended.size, operators.length, `${domain} 的全部算子都应至少属于一个方向`)
  }
})

test('drug keeps only the nine docking operators and splits them across screening and ADMET', async () => {
  const details = scenarioList(await readJson('mock-data', 'drug', 'scenario-details.json'))
  const scenarios = new Map(details.map(item => [item.id, item]))
  const admet = scenarios.get('admet-prediction')
  const screening = scenarios.get('virtual-screening')

  assert.deepEqual(
    admet.operators.map(item => item.id).sort(),
    ['molecule-format-conversion', 'pose-energy-extraction', 'reasonability-assessment'],
  )
  assert.deepEqual(
    screening.operators.map(item => item.id).sort(),
    ['ligand-preparation', 'molecular-docking-cpu', 'molecular-docking-gpu', 'molecule-generation-diffusion', 'receptor-grid-generation', 'receptor-preparation'],
  )
  for (const id of ['bwa-mem', 'samtools-sort', 'fastqc', 'bamtools-split']) {
    assert.ok(!screening.operators.some(item => item.id === id), `${id} 不应出现在药物领域`)
  }
})

test('every scenario keeps the exact recommendation count from the domain mapping', async () => {
  const actual = {}
  for (const domain of DOMAINS) {
    const details = scenarioList(await readJson('mock-data', domain, 'scenario-details.json'))
    for (const scenario of details) actual[scenario.id] = scenario.operators.length
  }
  assert.deepEqual(actual, SCENARIO_COUNTS)
})

test('legacy mock operator ids are fully replaced in domain operator data', async () => {
  const legacy = new Set(LEGACY_OPERATOR_IDS)
  for (const domain of DOMAINS) {
    const operators = (await readJson('mock-data', domain, 'operators.json')).data
    const scenarios = scenarioList(await readJson('mock-data', domain, 'scenario-details.json'))
    for (const operator of operators) {
      assert.ok(!legacy.has(operator.name), `${domain}/operators.json still has ${operator.name}`)
    }
    for (const scenario of scenarios) {
      for (const reference of scenario.operators ?? []) {
        assert.ok(!legacy.has(reference.id), `${domain}/${scenario.id} still has ${reference.id}`)
      }
    }
  }
})

test('operator selection card renders backend title, image and resource requirement', async () => {
  const component = await readFile(resolve(ROOT, 'frontend/components/experience/ExperienceOperatorStep.vue'), 'utf8')

  assert.match(component, /if \(operator\.title\) return operator\.title/)
  assert.match(component, /operator\.image \|\| operator\.runtime/)
  assert.match(component, /operator\.resource_requirement/)
  assert.match(component, /operator\.backend_categories/)
  assert.match(component, /operator\.backend_tags/)
  assert.match(component, /runtimeTypeText/)
  assert.match(component, /cpuText\(operator\)/)
  assert.match(component, /gpuText\(operator\)/)
  assert.match(component, /memoryText\(operator\)/)

  const workflow = await readFile(resolve(ROOT, 'frontend/components/experience/ExperienceWorkflowStep.vue'), 'utf8')
  assert.match(workflow, /operator\.title \|\|/)
})

test('sync script is reproducible offline and keeps live session out of the repository', async () => {
  const script = await readFile(resolve(ROOT, 'scripts/sync-operator-library.mjs'), 'utf8')
  const docs = await readFile(resolve(ROOT, 'README.md'), 'utf8')

  assert.match(script, /SCNET_SESSION_ID/)
  assert.match(script, /--offline/)
  assert.match(script, /TAG_FALLBACK/)
  assert.match(script, /EXCLUDED_TAGS/)
  assert.match(script, /生物信息场景/)
  assert.match(script, /通用计算场景/)
  assert.match(script, /writeJson\(SNAPSHOT_FILE/)
  assert.match(script, /extra_scenarios/)
  assert.match(docs, /sync-operator-library/)
  assert.doesNotMatch(script, /sessionId=[0-9a-f]{8}-[0-9a-f]{4}/i)
})
