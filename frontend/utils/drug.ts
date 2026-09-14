export const admetProperties = [
  { key: 'absorption', label: '吸收' }, { key: 'distribution', label: '分布' },
  { key: 'metabolism', label: '代谢' }, { key: 'excretion', label: '排泄' }, { key: 'toxicity', label: '毒性' },
] as const
export type ADMETProperty = typeof admetProperties[number]['key']
export function filterCandidates<T extends { compound_id: string; passed?: boolean }>(rows: T[], query: string, status: 'all' | 'passed' | 'failed' = 'all'): T[] {
  return rows.filter(row => row.compound_id.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || row.passed === (status === 'passed')))
}
export function sortCandidates<T>(rows: T[], key: keyof T, ascending: boolean): T[] {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key]
    const validA = typeof av === 'number' && Number.isFinite(av), validB = typeof bv === 'number' && Number.isFinite(bv)
    if (!validA) return validB ? 1 : 0
    if (!validB) return -1
    return (av - bv) * (ascending ? 1 : -1)
  })
}
export function radarBounds(values: number[]) {
  const finite = values.filter(Number.isFinite)
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite)
  return { min, max: max > min ? max : min + 1 }
}
