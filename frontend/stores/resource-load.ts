import { defineStore } from 'pinia'

/**
 * 跨领域共享的上传负载。
 *
 * 四个算力中心是同一批物理资源，任一领域上传数据都会提高适配中心的负载；
 * 记录按中心累计，所有领域的资源调度读取同一份计数，保证展示数据同步。
 * 每份数据最多让对应中心增长 0.4%（单次不超过 0.5 个百分点）。
 */
export const useResourceLoadStore = defineStore('resource-load', {
  state: () => ({
    /** dataset_id -> 该数据上传时适配的中心，用于移除上传时精确回退 */
    datasets: {} as Record<string, string[]>,
    /** cluster_id -> 已累计的上传份数 */
    counts: {} as Record<string, number>,
  }),
  actions: {
    registerUpload(datasetId: string, clusterIds: string[]) {
      if (!datasetId || this.datasets[datasetId]) return
      const ids = [...new Set(clusterIds)]
      this.datasets[datasetId] = ids
      for (const id of ids) this.counts[id] = (this.counts[id] ?? 0) + 1
    },
    unregisterUpload(datasetId: string) {
      const ids = this.datasets[datasetId]
      if (!ids) return
      delete this.datasets[datasetId]
      for (const id of ids) this.counts[id] = Math.max(0, (this.counts[id] ?? 0) - 1)
    },
  },
})
