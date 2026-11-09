/**
 * 从超算平台「算子库」同步算子，并按标题分配到应用示范的六个领域 / 十二个方向。
 *
 * 数据来源：
 *   - 平台页面：http://192.168.95.138:8890/operator
 *   - 列表接口：GET /api/v1/operator-libraries
 *   - 详情接口：GET /api/v1/operator-libraries/{id}
 *
 * 平台接口需要登录态。首次同步时通过环境变量传入浏览器中的 sessionId（或完整 Cookie）：
 *   $env:SCNET_SESSION_ID = '<登录后的 sessionId>'
 *   node scripts/sync-operator-library.mjs
 *
 * 不传登录态时直接使用仓库内快照（mock-data/operator-library/backend-operators.json），
 * 仍然会按 scripts/operator-library-assignments.json 重新生成各领域数据。
 *
 * 产出：
 *   - mock-data/operator-library/backend-operators.json  平台算子原始快照
 *   - mock-data/{domain}/operators.json                  领域算子列表（卡片内容）
 *   - mock-data/{domain}/scenario-details.json          各方向的「场景推荐」算子
 *   - mock-data/{domain}/params-schema.json             算子选择默认值
 *   - mock-data/{domain}/run-details/*.json             已失效的 selected_operator_ids 迁移到新算子
 *
 * 分配原则见 scripts/operator-library-assignments.json：平台标题（tags）决定归属领域，
 * 同一领域内再依据算子内容分到两个场景方向；平台新增但尚未人工分配时，按下文
 * TAG_FALLBACK 落到该领域的默认方向，保证「所有算子都能出现在应用示范中」。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MOCK_DIR = resolve(ROOT, 'mock-data')
const LIBRARY_DIR = resolve(MOCK_DIR, 'operator-library')
const SNAPSHOT_FILE = resolve(LIBRARY_DIR, 'backend-operators.json')
const ASSIGNMENT_FILE = resolve(ROOT, 'scripts/operator-library-assignments.json')

const BACKEND_URL = (process.env.SCNET_BACKEND_URL || 'http://192.168.95.138:8890').replace(/\/+$/, '')
const SESSION_ID = process.env.SCNET_SESSION_ID || ''
const COOKIE = process.env.SCNET_COOKIE || (SESSION_ID ? `sessionId=${SESSION_ID}` : '')
const OFFLINE = process.argv.includes('--offline') || (!SESSION_ID && !COOKIE)

const DOMAINS = ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']
const TIME_ZONE = 'Asia/Shanghai'

/** 参数面板里「算子选择」的默认值：优先用该方向最有代表性的算子。 */
const PREFERRED_DEFAULT = {
  'wave-propagation': 'supg',
  'tectonic-evolution': 'citcoms-global',
  'vehicle-crash': 'auto-external-flow',
  'fatigue-life': 'structural-thermal-load',
  'llm-pretraining': 'megatron-core',
  'pinn-acceleration': 'lightgbm',
  'swarm-coordination': 'incompressible-driftflux',
  'path-planning': 'check-mesh',
  'virtual-screening': 'molecular-docking-gpu',
  'admet-prediction': 'reasonability-assessment',
  'band-dos': 'symtopo-band',
  'high-throughput-screening': 'crystalformer-sample',
}

/** 领域对应的平台主标签：卡片列表优先展示领域主标签算子，通用算子排在其后。 */
const DOMAIN_TAG = {
  geodynamics: '地球动力学场景',
  llm: 'AI模型训练场景',
  automotive: '汽车设计场景',
  uav: '仿真计算场景',
  drug: '药物设计场景',
  dft: '材料计算场景',
}

/** 这些平台标签不属于应用示范的六个领域，不同步进领域算子列表。 */
const EXCLUDED_TAGS = new Set(['生物信息场景', '通用计算场景'])

/** 平台场景标签 → 应用示范领域；领域内未人工分配的新算子落到默认方向。 */
const TAG_FALLBACK = {
  地球动力学场景: { domain: 'geodynamics', scenario: 'wave-propagation' },
  AI模型训练场景: { domain: 'llm', scenario: 'llm-pretraining' },
  汽车设计场景: { domain: 'automotive', scenario: 'vehicle-crash' },
  仿真计算场景: { domain: 'uav', scenario: 'swarm-coordination' },
  药物设计场景: { domain: 'drug', scenario: 'virtual-screening' },
  材料计算场景: { domain: 'dft', scenario: 'band-dos' },
}

function iso(ts = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date(ts))
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`
}

function readJson(file) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  return JSON.parse(text)
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

/** 平台函数注册示例是一段 curl，字段直接以 JSON 形式出现，逐项提取即可。 */
function parseRegistry(record) {
  const content = record?.funtion_registry_example?.content || ''
  const text = (key) => {
    const match = content.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
    return match?.[1]?.trim() ?? ''
  }
  const number = (key) => {
    const match = content.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`))
    return match ? Number(match[1]) : 0
  }
  const mpiCommand = text('mpiCommand')
  const handler = text('handler')
  const np = (mpiCommand || handler).match(/(?:^|\s)-np\s+(\d+)/)
  return {
    name: text('name'),
    version: text('version'),
    runtimeType: text('runtimeType'),
    runtime: text('runtime'),
    runtimeArgs: text('runtimeArgs'),
    handler,
    mpiEnabled: /"mpiEnabled"\s*:\s*true/.test(content),
    mpiCommand,
    cpuCores: number('cpuCores') || (np ? Number(np[1]) : 0),
    gpuCount: number('gpuCount'),
    memoryMB: number('memoryMB'),
    timeoutSec: number('timeoutSec'),
  }
}

/** 调用示例里的 cpuCores / gpuCount / memoryMB 是算子实际申请资源，用于补全注册示例缺省值。 */
function parseCalledResources(record) {
  const content = record?.funtion_called_example?.content || ''
  const number = (key) => {
    const match = content.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`))
    return match ? Number(match[1]) : 0
  }
  return {
    cpuCores: number('cpuCores'),
    gpuCount: number('gpuCount'),
    memoryMB: number('memoryMB'),
  }
}

/** 真实运行环境以 runtime 镜像为准；runtimeType=instance 只是平台部署方式。 */
function resolveRuntime(registry, image) {
  const rawType = String(registry.runtimeType || '').toLowerCase()
  const runtime = registry.runtime || (/^参考/.test(image) ? '' : image)
  const isSif = /\.sif(?:\s|$)/i.test(runtime) || /\.sif(?:\s|$)/i.test(image)
  const looksDocker = /^(?:hub\.|local\/|docker:)/i.test(runtime)
    || /:[\w][\w.-]*$/.test(runtime)
    || rawType === 'docker'
    || rawType === 'docker-run'
  const kind = isSif || rawType === 'singularity'
    ? 'singularity'
    : looksDocker
      ? 'docker'
      : rawType === 'instance'
        ? 'instance'
        : 'container'
  return {
    runtime,
    kind,
    label: kind === 'singularity' ? 'Singularity' : kind === 'docker' ? 'Docker' : kind === 'instance' ? '平台实例' : '容器',
    deployment: rawType === 'instance' ? '平台实例' : rawType === 'docker-run' ? 'Docker 运行' : '',
    deploymentType: rawType || kind,
  }
}

function shortDescription(full) {
  const first = cleanText(full).split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim()
  if (!first) return ''
  const sentence = first.match(/^.*?[。！？]/)?.[0] ?? first
  if (sentence.length <= 74) return sentence
  return `${sentence.slice(0, 72).replace(/[，、；：\s]+$/, '')}…`
}

function normalize(record, assignment) {
  const registry = parseRegistry(record)
  const called = parseCalledResources(record)
  const image = cleanText(record.image_address)
    .replace(/^Docker镜像[：:]\s*/i, '')
    .replace(/^镜像[：:]\s*/i, '')
  const runtimeInfo = resolveRuntime(registry, image)
  const runtime = runtimeInfo.runtime || '未提供'
  const requirement = cleanText(record.compute_resource_requirement).replace(/[。；;]+$/, '')
  const cpuCores = registry.cpuCores || called.cpuCores || 1
  const gpuHint = /(?:GPU|DCU)(?:加速卡|节点|卡)?/i.test(cleanText(record.compute_resource_requirement)) ? 1 : 0
  const gpuCount = registry.gpuCount || called.gpuCount || (/--gpus(?:\s+all)?/i.test(registry.runtimeArgs || '') ? 1 : gpuHint)
  const memoryMB = registry.memoryMB || called.memoryMB || 0
  return {
    name: assignment.slug,
    title: cleanText(record.title),
    version: registry.version || 'v1',
    runtime_type: runtimeInfo.kind,
    runtime_label: runtimeInfo.label,
    deployment_type: runtimeInfo.deploymentType,
    deployment_label: runtimeInfo.deployment,
    runtime: runtime || '未提供',
    handler: registry.handler || '',
    image: image || runtime || '',
    cpu_cores: cpuCores,
    gpu_count: gpuCount,
    memory_mb: memoryMB,
    resource_requirement: requirement && requirement !== '无' ? requirement : '未限定',
    status: 'registered',
    description: shortDescription(record.description),
    description_full: cleanText(record.description),
    in_out_explain: cleanText(record.in_out_explain),
    backend_id: record.id,
    backend_tags: cleanText(record.tags),
    backend_categories: cleanText(record.categories),
    backend_registry_name: registry.name,
    updated_at: cleanText(record.updated_at) || iso(),
  }
}

async function fetchJson(path) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: BACKEND_URL,
      Referer: `${BACKEND_URL}/operator`,
      ...(SESSION_ID ? { sessionId: SESSION_ID } : {}),
      ...(COOKIE ? { Cookie: COOKIE } : {}),
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`)
  const payload = await res.json()
  if (payload?.result) return payload.result
  if (payload?.data) return payload.data
  return payload
}

async function fetchLiveSnapshot() {
  const list = await fetchJson('/api/v1/operator-libraries?page=1&size=500')
  const records = list.records ?? list.list ?? []
  if (!records.length) throw new Error('平台算子列表为空')
  const details = []
  for (const [index, item] of records.entries()) {
    const detail = await fetchJson(`/api/v1/operator-libraries/${item.id}`)
    if (!detail?.id) throw new Error(`算子详情为空：${item.id}`)
    details.push(detail)
    if ((index + 1) % 10 === 0 || index === records.length - 1) {
      console.log(`[sync] 读取算子详情 ${index + 1}/${records.length}`)
    }
  }
  return {
    source: `${BACKEND_URL}/operator`,
    operator_page: `${BACKEND_URL}/operator`,
    api: `${BACKEND_URL}/api/v1/operator-libraries`,
    fetched_at: iso(),
    count: details.length,
    records: details,
  }
}

function scenarioRecord(document, scenarioId) {
  const data = document?.data
  if (!data) return null
  if (Array.isArray(data)) return data.find(item => item.id === scenarioId) ?? null
  return data[scenarioId] ?? Object.values(data).find(item => item?.id === scenarioId) ?? null
}

function migrateRunDetails(domain, operatorNames, refsByScenario) {
  const dir = resolve(MOCK_DIR, domain, 'run-details')
  if (!existsSync(dir)) return 0
  let changed = 0
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const path = resolve(dir, file)
    const document = readJson(path)
    const detail = document?.data
    const ids = detail?.selected_operator_ids
    if (!Array.isArray(ids) || !ids.length) continue
    if (ids.every(id => operatorNames.has(id))) continue
    const refs = refsByScenario.get(detail.scenario_id) ?? []
    if (!refs.length) continue
    detail.selected_operator_ids = refs.slice(0, 3).map(ref => ref.id)
    writeJson(path, document)
    changed += 1
  }
  return changed
}

async function main() {
  const assignmentConfig = readJson(ASSIGNMENT_FILE)
  const assignments = (assignmentConfig.assignments ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
  for (const key of ['backend_id', 'title', 'slug']) {
    const values = assignments.map(item => item[key])
    if (new Set(values).size !== values.length) throw new Error(`分配表中的 ${key} 不唯一`)
  }

  let snapshot
  if (!OFFLINE) {
    try {
      snapshot = await fetchLiveSnapshot()
      console.log(`[sync] 已从 ${snapshot.source} 读取 ${snapshot.count} 个算子`)
    } catch (error) {
      console.warn(`[sync] 平台读取失败（${error.message}），改用本地快照`)
    }
  }
  if (!snapshot) {
    if (!existsSync(SNAPSHOT_FILE)) throw new Error(`缺少本地快照：${SNAPSHOT_FILE}`)
    snapshot = readJson(SNAPSHOT_FILE)
    console.log(`[sync] 使用本地快照 ${SNAPSHOT_FILE}（${snapshot.count} 个算子）`)
  }
  if (snapshot.count !== snapshot.records?.length) snapshot.count = snapshot.records.length
  writeJson(SNAPSHOT_FILE, snapshot)

  const byId = new Map(snapshot.records.map(record => [record.id, record]))
  const byTitle = new Map(snapshot.records.map(record => [cleanText(record.title), record]))
  const normalized = new Map()
  const usedRecords = new Set()

  for (const assignment of assignments) {
    const record = byId.get(assignment.backend_id) ?? byTitle.get(cleanText(assignment.title))
    if (!record) {
      console.warn(`[sync] 跳过未在平台找到的算子：${assignment.title}`)
      continue
    }
    if (usedRecords.has(record.id)) throw new Error(`算子被重复分配：${record.title}`)
    usedRecords.add(record.id)
    normalized.set(assignment.slug, { ...normalize(record, assignment), assignment })
  }

  // 生物信息 / 通用计算不属于应用示范的六个领域，单独统计并从领域数据中排除。
  const excluded = []
  // 平台新增、尚未人工分配的算子按 tags 落到默认领域/方向，避免同步后丢失。
  let appended = 0
  for (const [order, record] of snapshot.records.entries()) {
    if (usedRecords.has(record.id)) continue
    const tag = cleanText(record.tags)
    if (EXCLUDED_TAGS.has(tag)) {
      excluded.push(record)
      continue
    }
    const fallback = TAG_FALLBACK[tag]
    if (!fallback) {
      console.warn(`[sync] 未分配且无默认标签映射，跳过：${record.title}（${record.tags}）`)
      continue
    }
    const base = cleanText(record.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const slug = `${fallback.domain}-${appended + 1}-${base || 'operator'}`
    const assignment = { order: assignments.length + order + 1, backend_id: record.id, title: record.title, slug, ...fallback }
    normalized.set(slug, { ...normalize(record, assignment), assignment })
    usedRecords.add(record.id)
    appended += 1
  }

  const slugs = [...normalized.keys()]
  if (new Set(slugs).size !== slugs.length) throw new Error('算子 slug 重复')

  const refsByScenario = new Map()
  for (const domain of DOMAINS) {
    const domainEntries = [...normalized.values()]
      .filter(entry => entry.assignment.domain === domain)
      .sort((a, b) => {
        const primary = DOMAIN_TAG[domain]
        const rank = entry => entry.backend_tags === primary ? 0 : 1
        return rank(a) - rank(b) || a.assignment.order - b.assignment.order
      })
    if (!domainEntries.length) throw new Error(`领域没有分配到算子：${domain}`)

    writeJson(resolve(MOCK_DIR, domain, 'operators.json'), {
      code: 200,
      message: 'success',
      data: domainEntries.map(({ assignment, ...operator }) => operator),
      timestamp: snapshot.fetched_at,
    })

    const scenariosFile = resolve(MOCK_DIR, domain, 'scenario-details.json')
    const scenarios = readJson(scenariosFile)
    const domainScenarios = [...new Set(domainEntries.flatMap(entry => [
      entry.assignment.scenario,
      ...(entry.assignment.extra_scenarios ?? []),
    ]))]
    for (const scenarioId of domainScenarios) {
      const refs = [...new Map(domainEntries
        .filter(entry => entry.assignment.scenario === scenarioId
          || (entry.assignment.extra_scenarios ?? []).includes(scenarioId))
        .map(entry => [entry.name, { id: entry.name, name: entry.title }])).values()]
      if (!refs.length) throw new Error(`方向没有推荐算子：${domain}/${scenarioId}`)
      refsByScenario.set(scenarioId, refs)
      const scenario = scenarioRecord(scenarios, scenarioId)
      if (!scenario) throw new Error(`场景详情中缺少方向：${domain}/${scenarioId}`)
      scenario.operators = refs
    }
    writeJson(scenariosFile, scenarios)

    const schemaFile = resolve(MOCK_DIR, domain, 'params-schema.json')
    if (existsSync(schemaFile)) {
      const schemas = readJson(schemaFile)
      let changed = false
      for (const [scenarioId, schema] of Object.entries(schemas.data ?? {})) {
        const refs = refsByScenario.get(scenarioId)
        if (!refs) continue
        for (const field of schema?.fields ?? []) {
          if (field?.name !== 'operator') continue
          const preferred = PREFERRED_DEFAULT[scenarioId]
          const target = refs.some(ref => ref.id === preferred) ? preferred : refs[0].id
          if (field.default_value !== target) {
            field.default_value = target
            changed = true
          }
        }
      }
      if (changed) writeJson(schemaFile, schemas)
    }

    const migrated = migrateRunDetails(domain, new Set(domainEntries.map(entry => entry.name)), refsByScenario)
    console.log(`[sync] ${domain}: ${domainEntries.length} 个算子${migrated ? `，迁移 ${migrated} 条运行记录` : ''}`)
    for (const scenarioId of domainScenarios) {
      console.log(`  - ${scenarioId}: ${refsByScenario.get(scenarioId).length} 个场景推荐`)
    }
  }

  const unassigned = snapshot.records.filter(record => !usedRecords.has(record.id) && !EXCLUDED_TAGS.has(cleanText(record.tags)))
  console.log(`[sync] 合计 ${normalized.size} 个领域算子，排除生物信息 / 通用计算 ${excluded.length} 个${appended ? `，自动补充分配 ${appended} 个` : ''}`)
  for (const record of unassigned) console.warn(`[sync] 未分配：${record.title}（${record.tags}）`)
}

await main()
