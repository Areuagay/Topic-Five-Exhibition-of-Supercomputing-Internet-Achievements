import { defineStore } from 'pinia'
import type { DomainInfo } from '~/types'

/**
 * 全局应用状态（Pinia）：
 * 缓存首页索引中的域名元信息，供导航高亮 / 页面标题 / 图标映射复用。
 */
export const useAppStore = defineStore('app', {
  state: () => ({
    domains: [] as DomainInfo[],
    clusters: [] as { id: string; name: string; location: string; architecture: string }[],
  }),
  getters: {
    domainMap: (state) => {
      const map = new Map<string, DomainInfo>()
      for (const d of state.domains) map.set(d.domain, d)
      return map
    },
    clusterNameMap: (state) => {
      const map = new Map<string, string>()
      for (const c of state.clusters) map.set(c.id, c.name)
      return map
    },
    domainName: (state) => (id: string) => state.domains.find((d) => d.domain === id)?.name ?? id,
  },
  actions: {
    setIndex(domains: DomainInfo[], clusters: { id: string; name: string; location: string; architecture: string }[]) {
      this.domains = domains
      this.clusters = clusters
    },
  },
})
