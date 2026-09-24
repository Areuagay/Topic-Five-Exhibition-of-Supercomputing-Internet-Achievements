type InputDataset = { dataset_id: string; uploaded?: boolean; imported?: boolean; size_bytes: number; format: string; grid?: string; source?: string }
type SubmittedRun = { run_id: string; origin?: string; selected_operator_ids?: string[] }

// Preset data has no file hash API. Compare its identity, metadata and import state.
export function preparedDataKey(datasets: InputDataset[]): string {
  return JSON.stringify(datasets.filter(item => item.uploaded).map(item => ({
    id: item.dataset_id, size: item.size_bytes, format: item.format,
    grid: item.grid ?? '', source: item.source ?? '', imported: !!item.imported,
  })).sort((a, b) => a.id.localeCompare(b.id)))
}

export function findDuplicatePlan<T extends SubmittedRun>(runs: T[], ids: string[], dataKey: string, snapshots: Record<string, string>) {
  const candidates = runs.filter(run => run.origin === 'runtime' && ids.length > 0
    && run.selected_operator_ids?.length === ids.length
    && ids.every(id => run.selected_operator_ids?.includes(id)))
  const exact = candidates.find(run => snapshots[run.run_id] === dataKey)
  if (exact) return { run: exact, dataKnown: true }
  // Historical runs without a client snapshot only prove an operator match.
  const unknown = candidates.find(run => typeof snapshots[run.run_id] !== 'string')
  return unknown ? { run: unknown, dataKnown: false } : null
}
