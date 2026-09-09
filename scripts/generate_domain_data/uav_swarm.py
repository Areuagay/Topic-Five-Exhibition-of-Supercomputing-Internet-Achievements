"""uav / swarm-coordination simulated domain data."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from .common import (
    REPO_ROOT,
    add_common_cli,
    artifact_dir,
    float_clean,
    make_artifact,
    make_rng,
    merge_domain_into_run,
    resolve_meta,
    write_csv,
    write_json,
)


def generate(run_id=None, output_dir=None, seed=None, force=False):
    meta = resolve_meta("swarm-coordination", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n_uav = 40
    n_pts = 70
    total_uavs = 1000  # logical total; samples are representative
    trajectory_samples = []
    for i in range(n_uav):
        t = np.linspace(0, 120, n_pts)
        ox = (i % 8) * 12.0
        oy = (i // 8) * 10.0
        oz = 80 + (i % 5) * 3
        x = 20 + ox + 1.8 * t + rng.normal(0, 0.4, n_pts)
        y = 30 + oy + 0.35 * np.sin(t / 8) + rng.normal(0, 0.3, n_pts)
        z = oz + 0.2 * np.sin(t / 5 + i) + rng.normal(0, 0.15, n_pts)
        trajectory_samples.append(
            {
                "uav_id": f"UAV-{i + 1:03d}",
                "points": [
                    {
                        "t": float_clean(ti, 3),
                        "x": float_clean(xi, 3),
                        "y": float_clean(yi, 3),
                        "z": float_clean(zi, 3),
                    }
                    for ti, xi, yi, zi in zip(t, x, y, z)
                ],
            }
        )

    n_form = 60
    steps = np.arange(1, n_form + 1)
    formation_error = 2.5 * np.exp(-steps / 18) + 0.25 + rng.normal(0, 0.03, n_form)
    formation_error = np.maximum(formation_error, 0.2)
    completed = np.minimum(total_uavs, (steps / n_form * 635).astype(int))
    completed = np.maximum.accumulate(completed)
    active = np.minimum(total_uavs, total_uavs - completed + rng.integers(20, 80, n_form))
    active = np.minimum(active, total_uavs)
    formation_series = [
        {
            "step": int(s),
            "formation_error": float_clean(fe, 4),
            "active_uavs": int(a),
            "completed_uavs": int(c),
        }
        for s, fe, a, c in zip(steps, formation_error, active, completed)
    ]

    collision_events = [
        {
            "step": 22,
            "uav_ids": ["UAV-007", "UAV-018"],
            "x": float_clean(95.2, 2),
            "y": float_clean(48.1, 2),
            "z": float_clean(86.4, 2),
        }
    ]

    mission_targets = [
        {"target_id": "T1", "x": 250.0, "y": 80.0, "z": 90.0},
        {"target_id": "T2", "x": 260.0, "y": 120.0, "z": 95.0},
        {"target_id": "T3", "x": 280.0, "y": 60.0, "z": 85.0},
    ]

    write_json(out / "trajectory_samples.json", {"source_type": "simulated", "trajectory_samples": trajectory_samples})
    write_csv(out / "formation_series.csv", formation_series)
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}JSON1",
            "trajectory_samples.json",
            (out / "trajectory_samples.json").relative_to(REPO_ROOT),
            type_="dataset",
            format_="json",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "formation_series.csv",
            (out / "formation_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "total_uavs": total_uavs,
        "sample_uav_count": n_uav,
        "trajectory_samples": trajectory_samples,
        "formation_series": formation_series,
        "collision_events": collision_events,
        "mission_targets": mission_targets,
    }
    merge_domain_into_run(
        domain,
        run_id,
        domain_data,
        artifacts,
        metrics_patch={
            "cluster_summary": {
                "active_uavs": int(active[-1]),
                "completed_uavs": int(completed[-1]),
                "collision_count": len(collision_events),
                "average_formation_error": float_clean(float(formation_error[-1]), 2),
            }
        },
    )
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("swarm-coordination ok")


if __name__ == "__main__":
    main()
