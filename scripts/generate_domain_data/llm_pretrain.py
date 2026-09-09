"""llm / llm-pretraining simulated domain data."""
from __future__ import annotations

import argparse
import math
from datetime import datetime, timedelta, timezone
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
    meta = resolve_meta("llm-pretraining", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n = 80
    steps = np.arange(1, n + 1) * 50
    loss = 3.8 * np.exp(-steps / 900) + 1.35 + rng.normal(0, 0.02, n)
    warmup = 800
    max_lr = 3e-4
    lr = []
    for s in steps:
        if s < warmup:
            lr.append(max_lr * s / warmup)
        else:
            progress = (s - warmup) / (steps[-1] - warmup)
            lr.append(max_lr * 0.5 * (1 + math.cos(math.pi * progress)))
    tokens = 185000 * (1 + rng.normal(0, 0.05, n))
    gpu_util = np.clip(88 + rng.normal(0, 4, n), 75, 96)
    comm = np.clip(12 + rng.normal(0, 2.5, n), 8, 20)
    training_series = [
        {
            "step": int(s),
            "loss": float_clean(lo, 5),
            "learning_rate": float_clean(l, 8),
            "tokens_per_second": float_clean(tk, 1),
            "gpu_utilization": float_clean(g, 2),
            "communication_overhead": float_clean(c, 2),
        }
        for s, lo, l, tk, g, c in zip(steps, loss, lr, tokens, gpu_util, comm)
    ]

    n_gpu = 12
    gpu_metrics = [
        {
            "gpu_id": i,
            "utilization": float_clean(float(np.clip(90 + rng.normal(0, 3), 75, 96)), 2),
            "memory_utilization": float_clean(float(np.clip(86 + rng.normal(0, 4), 70, 98)), 2),
            "temperature": float_clean(float(np.clip(68 + rng.normal(0, 3), 55, 82)), 1),
        }
        for i in range(n_gpu)
    ]

    parallel_config = {
        "data_parallel": 4,
        "tensor_parallel": 2,
        "pipeline_parallel": 2,
        "world_size": 16,
    }

    base_ts = datetime(2026, 8, 11, 9, 20, tzinfo=timezone(timedelta(hours=8)))
    checkpoint_events = []
    for i, step in enumerate([1000, 2000, 3000, 4000, 4200]):
        checkpoint_events.append(
            {
                "step": step,
                "timestamp": (base_ts + timedelta(minutes=25 * i)).isoformat(),
                "size_gb": float_clean(38.5 + rng.normal(0, 0.4), 2),
                "path": f"simulated://checkpoints/{run_id}/ckpt-{step}",
            }
        )

    write_csv(out / "training_series.csv", training_series)
    write_json(out / "gpu_metrics.json", {"source_type": "simulated", "gpu_metrics": gpu_metrics})
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "training_series.csv",
            (out / "training_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}JSON1",
            "gpu_metrics.json",
            (out / "gpu_metrics.json").relative_to(REPO_ROOT),
            type_="dataset",
            format_="json",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "training_series": training_series,
        "gpu_metrics": gpu_metrics,
        "parallel_config": parallel_config,
        "checkpoint_events": checkpoint_events,
    }
    # Keep existing frontend gpu_metrics shape-compatible by also patching metrics.gpu_metrics
    # with string gpu_id variants for older UI while domain_data uses int gpu_id as specified.
    legacy_gpu = [
        {
            "gpu_id": f"gpu-{g['gpu_id']}",
            "utilization": g["utilization"],
            "memory_utilization": g["memory_utilization"],
            "temperature": g["temperature"],
        }
        for g in gpu_metrics[:8]
    ]
    merge_domain_into_run(domain, run_id, domain_data, artifacts, metrics_patch={"gpu_metrics": legacy_gpu})
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("llm-pretraining ok")


if __name__ == "__main__":
    main()
