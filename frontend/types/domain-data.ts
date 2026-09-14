/** Canonical /metrics response.data.domain_data. Based on the 12 supplied scenario payloads.
 * Optional top-level fields allow independently missing outputs. No page imports fixture JSON. */
import type { MetricItem } from './index'

export interface VehicleCrashData {
  units?: Record<string, string>
  scenario_id: 'vehicle-crash'
  source_type?: string
  execution_mode?: string
  energy_series?: {
    "time": number
    "kinetic_energy": number
    "internal_energy": number
    "hourglass_energy": number
    "kinetic": number
    "internal": number
    "hourglass": number
  }[]
  acceleration_series?: {
    "time": number
    "acceleration_g": number
  }[]
  intrusion_series?: {
    "time": number
    "intrusion_mm": number
  }[]
  critical_results?: {
    "peak_acceleration_g": number
    "max_intrusion_mm": number
    "max_stress_mpa": number
    "energy_error_percent": number
  }
}

export interface FatigueLifeData {
  units?: Record<string, string>
  scenario_id: 'fatigue-life'
  source_type?: string
  execution_mode?: string
  damage_series?: {
    "cycle": number
    "damage_ratio": number
  }[]
  sn_curve?: {
    "stress_amplitude": number
    "cycles_to_failure": number
  }[]
  critical_locations?: {
    "location": string
    "max_stress": number
    "damage": number
    "predicted_life": number
  }[]
}

export interface BandDOSData {
  units?: Record<string, string>
  scenario_id: 'band-dos'
  source_type?: string
  execution_mode?: string
  scf_series?: {
    "iteration": number
    "total_energy": number
    "energy_delta": number
  }[]
  band_structure?: {
    "k_labels": string[]
    "k_positions": number[]
    "fermi_energy": number
    "bands": {
      "band_index": number
      "energies": number[]
    }[]
  }
  dos_series?: {
    "energy": number
    "total_dos": number
  }[]
  structure?: {
    "lattice": number[][]
    "atoms": {
      "element": string
      "x": number
      "y": number
      "z": number
    }[]
    "note": string
  }
}

export interface HighThroughputData {
  units?: Record<string, string>
  scenario_id: 'high-throughput-screening'
  source_type?: string
  execution_mode?: string
  batch_summary?: {
    "total": number
    "completed": number
    "converged": number
    "failed": number
    "qualified": number
  }
  materials?: {
    "material_id": string
    "formula": string
    "formation_energy": number
    "band_gap": number
    "stability_score": number
    "converged": boolean
    "cluster_id": string
  }[]
  candidate_ranking?: {
    "rank": number
    "material_id": string
    "score": number
    "reason": string
  }[]
  cluster_distribution?: {
    "cluster_id": string
    "cluster_name": string
    "assigned": number
  }[]
  filter_rule?: {
    "converged": boolean
    "formation_energy_lt": number
    "band_gap_range": number[]
    "stability_score_gt": number
  }
}

export interface VirtualScreeningData {
  units?: Record<string, string>
  cluster_progress?: { cluster_id: string; cluster_name?: string; progress?: number; completed?: number; total?: number }[]
  scenario_id: 'virtual-screening'
  source_type?: string
  execution_mode?: string
  screening_funnel?: {
    "input": number
    "preprocessed": number
    "docked": number
    "property_passed": number
    "top_n": number
  }
  score_distribution?: {
    "min": number
    "max": number
    "count": number
  }[]
  top_candidates?: {
    "rank": number
    "compound_id": string
    "docking_score": number
    "molecular_weight": number
    "logp": number
    "preview_url"?: string
  }[]
}

export interface ADMETData {
  units?: Record<string, string>
  scenario_id: 'admet-prediction'
  source_type?: string
  execution_mode?: string
  filter_rule?: {
    "toxicity_lt": number
    "absorption_gt": number
    "distribution_gt": number
  }
  admet_summary?: {
    "total": number
    "passed": number
    "failed": number
  }
  candidate_properties?: {
    "compound_id": string
    "absorption": number
    "distribution": number
    "metabolism": number
    "excretion": number
    "toxicity": number
    "passed": boolean
  }[]
  risk_distribution?: {
    "risk_level": string
    "count": number
  }[]
  property_distribution?: {
    "absorption": {
      "mean": number
      "std": number
      "bins": {
        "min": number
        "max": number
        "count": number
      }[]
    }
    "distribution": {
      "mean": number
      "std": number
      "bins": {
        "min": number
        "max": number
        "count": number
      }[]
    }
    "metabolism": {
      "mean": number
      "std": number
      "bins": {
        "min": number
        "max": number
        "count": number
      }[]
    }
    "excretion": {
      "mean": number
      "std": number
      "bins": {
        "min": number
        "max": number
        "count": number
      }[]
    }
    "toxicity": {
      "mean": number
      "std": number
      "bins": {
        "min": number
        "max": number
        "count": number
      }[]
    }
  }
}

export interface WavePropagationData {
  units?: { time?: string; simulation_time?: string; residual?: string; amplitude?: string }
  scenario_id: 'wave-propagation'
  source_type?: string
  execution_mode?: string
  residual_series?: {
    "iteration": number
    "residual": number
    "step_time": number
  }[]
  seismogram_series?: {
    "time": number
    "amplitude": number
  }[]
  wavefield_frames?: {
    "step": number
    "simulation_time": number
    "preview_url": string
    "artifact_id": string
  }[]
  domain_partitions?: {
    "partition_id": number
    "cells": number
    "cores": number
  }[]
}

export interface TectonicEvolutionData {
  scenario_id: 'tectonic-evolution'
  /** Optional series metadata; absent units are not inferred from values. */
  units?: { time?: string; temperature?: string; velocity?: string; residual?: string }
  source_type?: string
  execution_mode?: string
  scenario_alias?: string
  temperature_series?: {
    "time": number
    "max_temperature": number
    "avg_temperature": number
  }[]
  velocity_series?: {
    "time": number
    "max_velocity": number
    "avg_velocity": number
  }[]
  nonlinear_series?: {
    "iteration": number
    "residual": number
  }[]
  field_frames?: {
    "time": number
    "temperature_preview": string
    "velocity_preview": string
  }[]
}

export interface LLMPretrainingData {
  units?: Record<string, string>
  scenario_id: 'llm-pretraining'
  source_type?: string
  execution_mode?: string
  training_series?: {
    "step": number
    "loss": number
    "learning_rate": number
    "tokens_per_second": number
    "gpu_utilization": number
    "communication_overhead": number
  }[]
  gpu_metrics?: {
    "gpu_id": number
    "utilization": number
    "memory_utilization": number
    "temperature": number
  }[]
  parallel_config?: {
    "data_parallel": number
    "tensor_parallel": number
    "pipeline_parallel": number
    "world_size": number
  }
  checkpoint_events?: {
    "step": number
    "timestamp": string
    "size_gb": number
    "path": string
  }[]
}

export interface PINNData {
  units?: Record<string, string>
  scenario_id: 'pinn-acceleration'
  source_type?: string
  execution_mode?: string
  pinn_training_series?: {
    "epoch": number
    "total_loss": number
    "physics_loss": number
    "data_loss": number
    "validation_error": number
  }[]
  prediction_error_series?: {
    "epoch": number
    "l2_error": number
    "max_error": number
  }[]
  residual_field?: {
    "x": number[]
    "y": number[]
    "values": number[][]
  }
  sampling_statistics?: {
    "physics_points": number
    "boundary_points": number
    "data_points": number
  }
}

export interface SwarmCoordinationData {
  units?: Record<string, string>
  scenario_id: 'swarm-coordination'
  source_type?: string
  execution_mode?: string
  total_uavs?: number
  sample_uav_count?: number
  trajectory_samples?: {
    "uav_id": string
    "points": {
      "t": number
      "x": number
      "y": number
      "z": number
    }[]
  }[]
  formation_series?: {
    "step": number
    "formation_error": number
    "active_uavs": number
    "completed_uavs": number
  }[]
  collision_events?: {
    "step": number
    "uav_ids": string[]
    "x": number
    "y": number
    "z": number
  }[]
  mission_targets?: {
    "target_id": string
    "x": number
    "y": number
    "z": number
  }[]
}

export interface PathPlanningData {
  units?: Record<string, string>
  scenario_id: 'path-planning'
  source_type?: string
  execution_mode?: string
  environment?: {
    "width": number
    "height": number
    "start": number[]
    "goal": number[]
    "obstacles"?: ({ type: 'rectangle'; x: number; y: number; w: number; h: number } | { type: 'circle'; cx: number; cy: number; r: number })[]
  }
  best_path?: {
    "x": number
    "y": number
  }[]
  cost_series?: {
    "iteration": number
    "best_cost": number
    "average_cost": number
  }[]
  path_preview?: string
}

export type DomainData = WavePropagationData | TectonicEvolutionData | LLMPretrainingData | PINNData | VehicleCrashData | FatigueLifeData | SwarmCoordinationData | PathPlanningData | VirtualScreeningData | ADMETData | BandDOSData | HighThroughputData

export interface RunMetrics {
  units?: Record<string, string>
  run_id?: string
  scenario_id?: string
  progress?: number
  metrics: MetricItem[]
  domain_data?: DomainData
  source_type?: string
  [key: string]: unknown
}
