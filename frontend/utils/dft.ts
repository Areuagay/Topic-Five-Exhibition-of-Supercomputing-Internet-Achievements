export function bandPoints(positions: number[], energies: (number | null | undefined)[]) {
  return positions.flatMap((x, i) => Number.isFinite(x) ? [[x, typeof energies[i] === 'number' && Number.isFinite(energies[i]) ? energies[i]! : null]] : [])
}
export function energyRange(bands: number[], dos: number[]) {
  const values = [...bands, ...dos].filter(Number.isFinite)
  if (!values.length) return undefined
  const min = Math.min(...values), max = Math.max(...values), margin = Math.max(max - min, 1) * .05
  return { min: min - margin, max: max + margin }
}
export function filterMaterials<T extends { material_id: string; formula: string; cluster_id?: string; converged?: boolean }>(rows: T[], query: string, cluster: string, status: 'all' | 'converged' | 'unconverged' | 'ranked', ranked: string[]): T[] {
  const needle = query.trim().toLowerCase(), ids = new Set(ranked)
  return rows.filter(r => `${r.material_id} ${r.formula}`.toLowerCase().includes(needle) && (!cluster || r.cluster_id === cluster) && (status === 'all' || (status === 'ranked' ? ids.has(r.material_id) : r.converged === (status === 'converged'))))
}
