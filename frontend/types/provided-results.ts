import type { Artifact } from './index'

export interface ProvidedFact { label: string; value: number | string; unit: string }
export interface ProvidedOperator {
  id: string
  title: string
  logs: string[]
  facts: ProvidedFact[]
  series: { epoch: number; loss: number; accuracy?: number; eval_loss?: number; trial?: number }[]
  trials: { trial: number; baseline_seconds: number; parallel_seconds: number; time_reduction_percent: number; baseline_util_percent: number; parallel_util_percent: number; relative_util_gain_percent: number }[]
  output_paths: string[]
  splits?: { split: string; images: number; samples: number; path: string }[]
}
export interface ProvidedResult {
  id: string
  kind: 'geodynamics' | 'training'
  domain: string
  scenario_id: string
  title: string
  source_name: string
  source_type: 'provided'
  summary: ProvidedFact[]
  artifacts: Artifact[]
  snapshot?: {
    step: number; simulation_time: number; grid_shape: number[]; point_count: number; rank_count: number; snapshot_count: number; unit_note: string
    statistics: Record<'temperature' | 'velocity', { min: number; max: number; mean: number }>
    slice: { longitude_degrees: number; latitudes: number[]; radii: number[]; temperature: number[][]; velocity: number[][] }
  }
  training?: { run_id: string; operators: ProvidedOperator[] }
}
