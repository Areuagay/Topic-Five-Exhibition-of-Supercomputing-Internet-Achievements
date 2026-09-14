import type { Artifact } from '../types/index'

export function workspaceMedia(artifacts: Artifact[] = []): Artifact[] {
  return artifacts.filter(item => item.preview_url && item.preview_supported !== false
    && (!item.storage_path?.startsWith('gfs://') || item.preview_supported === true)
    && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'].includes((item.format || '').toLowerCase()))
}

export function unitText(unit: unknown): string {
  return typeof unit === 'string' ? unit.trim() : ''
}

export function metricUnit(data: { units?: Record<string, string | undefined>; metrics?: { name: string; unit?: string }[] } | null | undefined, name: string): string {
  return unitText(data?.units?.[name]) || unitText(data?.metrics?.find(metric => metric.name === name)?.unit)
}

export function quantityLabel(label: string, unit?: string): string {
  const value = unitText(unit)
  return value ? `${label}（${value}）` : label
}

/** Resolve file-service paths through the same gateway as JSON API requests. */
export function resolveArtifactUrl(url: string | undefined, apiBase = ''): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return ''
  if (apiBase && url.startsWith('/api/v1/')) {
    return `${apiBase.replace(/\/$/, '')}/${url.slice('/api/v1/'.length)}`
  }
  return url
}

/** Missing values remain gaps; a missing scientific measurement is not zero. */
export function waveSeries(rows: Record<string, unknown>[] | undefined, x: string, y: string): [number, number | null][] {
  return (rows ?? []).filter(row => typeof row[x] === 'number' && Number.isFinite(row[x]))
    .map(row => [row[x] as number, typeof row[y] === 'number' && Number.isFinite(row[y]) ? row[y] as number : null])
}

export function residualCells(field: { x: number[]; y: number[]; values: (number | null)[][] } | undefined): [number, number, number][] {
  if (!field) return []
  return field.y.flatMap((_, y) => field.x.flatMap((_, x) => {
    const value = field.values[y]?.[x]
    return typeof value === 'number' && Number.isFinite(value) ? [[x, y, value] as [number, number, number]] : []
  }))
}
