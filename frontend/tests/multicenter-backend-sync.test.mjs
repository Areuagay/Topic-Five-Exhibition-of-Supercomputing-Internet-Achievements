import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { buildClusters, buildMigrations } from '../../scripts/sync-multicenter-backend.mjs'

const readJSON = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')).data

const STATUS_MAP = { normal: 'online', highLoad: 'degraded', maintenance: 'offline' }
const EXPECTED_CENTERS = {
  changsha: { name: '天河新一代', location: '长沙', architecture: '飞腾CPU + 迈创DSP' },
  guangzhou: { name: '银河 III', location: '广州', architecture: 'Intel Xeon + Xeon Phi' },
  kunshan: { name: '曙光星云', location: '昆山', architecture: '国产CPU + 寒武纪MLU' },
  jinan: { name: '神威·太湖之光', location: '济南', architecture: '神威26010 众核处理器' },
}

test('四个超算的城市与硬件对应正确，首页索引使用同一份信息', async () => {
  const clusters = await readJSON('../../mock-data/multicenter/clusters.json')
  const index = await readJSON('../../mock-data/index.json')
  assert.equal(clusters.length, 4)
  assert.equal(index.clusters.length, 4)
  for (const [id, expected] of Object.entries(EXPECTED_CENTERS)) {
    const cluster = clusters.find((item) => item.id === id)
    const summary = index.clusters.find((item) => item.id === id)
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(cluster?.[key], value, `${id}.${key}`)
      assert.equal(summary?.[key], value, `首页 ${id}.${key}`)
    }
    assert.equal(cluster.scheduler, 'SLURM')
  }
})

test('平台卡片重排或旧硬件信息错误时，仍按超算名称匹配中心', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../mock-data/multicenter/backend-snapshot.json', import.meta.url), 'utf8'))
  const previous = await readJSON('../../mock-data/multicenter/clusters.json')
  for (const cluster of previous) cluster.architecture = '旧架构'
  const cards = [snapshot.items[3], snapshot.items[1], snapshot.items[0], snapshot.items[2]]
  const clusters = buildClusters(cards, previous, snapshot)
  assert.deepEqual(clusters.map((cluster) => cluster.name), cards.map((card) => card.name))
  for (const cluster of clusters) {
    const expected = EXPECTED_CENTERS[cluster.id]
    assert.equal(cluster.name, expected.name)
    assert.equal(cluster.location, expected.location)
    assert.equal(cluster.architecture, expected.architecture)
    const card = cards.find((item) => item.name === cluster.name)
    assert.equal(cluster.cpu_utilization, card.cpu)
    assert.equal(cluster.resource_status, card.status)
  }
  assert.throws(() => buildClusters(cards.slice(1), previous, snapshot), /四个超算/)
  assert.throws(() => buildClusters([cards[0], cards[0], cards[2], cards[3]], previous, snapshot), /未知或重复/)
  assert.throws(() => buildClusters([{ ...cards[0], name: '未知超算' }, ...cards.slice(1)], previous, snapshot), /未知或重复/)
})

test('六大领域的运行记录和运行详情中的超算名称与中心一致', async () => {
  for (const domain of ['geodynamics', 'llm', 'automotive', 'uav', 'drug', 'dft']) {
    const runs = await readJSON(`../../mock-data/${domain}/runs.json`)
    for (const run of runs) assert.equal(run.cluster_name, EXPECTED_CENTERS[run.cluster_id]?.name, run.run_id)
    const directory = new URL(`../../mock-data/${domain}/run-details/`, import.meta.url)
    for (const file of await readdir(directory)) {
      if (!file.endsWith('.json')) continue
      const { data } = JSON.parse(await readFile(new URL(file, directory), 'utf8'))
      assert.equal(data.cluster_name, EXPECTED_CENTERS[data.cluster_id]?.name, data.run_id)
    }
  }
})

test('迁移源根据当前排队资源选择，排除维护中的超算', async () => {
  const clusters = await readJSON('../../mock-data/multicenter/clusters.json')
  const migrations = buildMigrations(clusters, '2026-11-05T18:10:01+08:00')
  assert.equal(migrations[0].from_cluster, 'jinan')
  assert.match(migrations[0].reason, /^济南中心排队等待 82 项/)
  for (const migration of migrations) {
    assert.notEqual(migration.from_cluster, 'guangzhou')
    assert.notEqual(migration.to_cluster, 'guangzhou')
  }
  const changed = clusters.map((cluster) => ({
    ...cluster,
    status: cluster.id === 'jinan' ? 'offline' : 'online',
    queue_length: cluster.id === 'guangzhou' ? 100 : cluster.queue_length,
  }))
  const updated = buildMigrations(changed, '2026-11-05T18:10:01+08:00')
  assert.equal(updated[0].from_cluster, 'guangzhou')
  assert.match(updated[0].reason, /^广州中心排队等待 100 项/)
  assert.ok(updated.every((item) => item.from_cluster !== 'jinan' && item.to_cluster !== 'jinan'))
})

test('四中心资源状态与超算平台全局资源视图快照一致', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../mock-data/multicenter/backend-snapshot.json', import.meta.url), 'utf8'))
  const clusters = await readJSON('../../mock-data/multicenter/clusters.json')

  assert.equal(clusters.length, 4)
  assert.equal(snapshot.items.length, 4)
  assert.match(snapshot.source, /^https?:\/\//)

  clusters.forEach((cluster, index) => {
    const card = snapshot.items[index]
    assert.equal(cluster.name, card.name)
    assert.equal(cluster.cpu_utilization, card.cpu)
    assert.equal(cluster.gpu_utilization, card.gpu)
    assert.equal(cluster.active_jobs, card.running)
    assert.equal(cluster.queue_length, card.queued)
    assert.equal(cluster.resource_status, card.status)
    assert.equal(cluster.status, STATUS_MAP[card.status])
  })
})

test('拓扑、部署、调用与迁移数据由四中心状态推导且互相自洽', async () => {
  const clusters = await readJSON('../../mock-data/multicenter/clusters.json')
  const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]))

  const topology = await readJSON('../../mock-data/multicenter/topology.json')
  for (const node of topology.nodes) {
    const cluster = byId.get(node.id)
    assert.ok(cluster, `未知中心 ${node.id}`)
    assert.equal(node.name, cluster.name)
    assert.equal(node.status, cluster.status)
  }
  for (const link of topology.links) {
    const offline = byId.get(link.source)?.status === 'offline' || byId.get(link.target)?.status === 'offline'
    assert.equal(link.status, offline ? 'offline' : 'online')
  }

  const matrix = await readJSON('../../mock-data/multicenter/deployment-matrix.json')
  for (const cluster of matrix.clusters) assert.equal(cluster.name, byId.get(cluster.id)?.name)

  const replicasByFunction = new Map()
  const replicasByCenter = new Map()
  for (const row of matrix.functions) {
    const perCenter = new Map()
    for (const deployment of row.deployments) {
      perCenter.set(deployment.cluster_id, deployment.replicas)
      replicasByCenter.set(deployment.cluster_id, (replicasByCenter.get(deployment.cluster_id) ?? 0) + deployment.replicas)
      if (byId.get(deployment.cluster_id)?.status === 'offline') {
        assert.equal(deployment.replicas, 0, '维护中的中心不承载实例')
        assert.equal(deployment.status, 'offline')
      }
    }
    replicasByFunction.set(row.function_id, perCenter)
  }

  for (const cluster of clusters) {
    const expected = cluster.status !== 'offline' && cluster.active_jobs > 0
      ? Math.max(1, Math.ceil(cluster.active_jobs / 4))
      : 0
    assert.equal(replicasByCenter.get(cluster.id) ?? 0, expected, `${cluster.id} 实例数应与运行任务推导一致`)
  }

  const workloads = await readJSON('../../mock-data/multicenter/workloads.json')
  const workloadIds = new Set(workloads.map((workload) => workload.workload_id))
  for (const workload of workloads) {
    for (const instance of workload.instances) {
      assert.equal(instance.desired_replicas, instance.ready_replicas)
      assert.equal(instance.desired_replicas, replicasByFunction.get(workload.function_id)?.get(instance.cluster_id))
    }
  }

  const invocations = await readJSON('../../mock-data/multicenter/invocations.json')
  for (const cluster of clusters) {
    const running = invocations.filter((item) => item.cluster_id === cluster.id && item.status === 'running').length
    assert.equal(running, cluster.status === 'offline' ? 0 : cluster.active_jobs)
  }
  for (const invocation of invocations) {
    await readFile(new URL(`../../mock-data/multicenter/details/${invocation.invocation_id}.json`, import.meta.url))
  }

  const migrations = await readJSON('../../mock-data/multicenter/migrations.json')
  for (const migration of migrations) {
    assert.ok(workloadIds.has(migration.workload_id), `迁移引用了未知工作负载 ${migration.workload_id}`)
    assert.notEqual(byId.get(migration.from_cluster)?.status, 'offline')
    assert.notEqual(byId.get(migration.to_cluster)?.status, 'offline')
    await readFile(new URL(`../../mock-data/multicenter/details/${migration.migration_id}.json`, import.meta.url))
  }
})
