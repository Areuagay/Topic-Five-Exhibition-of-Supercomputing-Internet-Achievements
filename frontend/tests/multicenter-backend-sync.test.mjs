import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readJSON = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')).data

const STATUS_MAP = { normal: 'online', highLoad: 'degraded', maintenance: 'offline' }

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
