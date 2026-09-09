"""geodynamics / wave-propagation simulated domain data."""
from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
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
    save_fig,
    stamp_simulated,
    write_csv,
    write_json,
)


def generate(run_id=None, output_dir=None, seed=None, force=False):
    meta = resolve_meta("wave-propagation", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n_res = 40
    iters = np.arange(1, n_res + 1)
    residual = 8e-2 * np.exp(-iters / 7.5) + 8e-7
    residual = np.maximum(residual * (1 + rng.normal(0, 0.04, n_res)), 5e-7)
    step_time = 0.82 + rng.normal(0, 0.03, n_res)
    residual_series = [
        {"iteration": int(i), "residual": float_clean(r, 10), "step_time": float_clean(t, 4)}
        for i, r, t in zip(iters, residual, step_time)
    ]

    n_seis = 160
    t = np.linspace(0, 8.0, n_seis)
    amp = np.zeros_like(t)
    for arrival, amp0, f0, tau in [(1.2, 1.0, 5.0, 0.35), (2.8, 0.55, 3.5, 0.5), (4.6, 0.28, 2.2, 0.7)]:
        tt = t - arrival
        ricker = (1 - 2 * (np.pi * f0 * tt) ** 2) * np.exp(-(np.pi * f0 * tt) ** 2)
        amp += amp0 * ricker * np.exp(-np.maximum(tt, 0) / tau)
    amp += rng.normal(0, 0.02, n_seis)
    seismogram_series = [{"time": float_clean(ti, 4), "amplitude": float_clean(a, 5)} for ti, a in zip(t, amp)]

    wavefield_frames = []
    artifacts = []
    xs = np.linspace(-1, 1, 96)
    ys = np.linspace(-1, 1, 96)
    X, Y = np.meshgrid(xs, ys)
    for k in range(10):
        sim_t = float_clean(0.15 * (k + 1), 3)
        r = np.sqrt((X - 0.05 * k) ** 2 + (Y + 0.02 * np.sin(k)) ** 2)
        field = np.sin(18 * r - 2.2 * k) * np.exp(-2.5 * r) + 0.15 * np.sin(8 * X + k)
        field += 0.05 * rng.normal(size=field.shape)
        fig, ax = plt.subplots(figsize=(4.2, 3.6))
        ax.imshow(field, cmap="seismic", origin="lower", vmin=-1, vmax=1)
        ax.set_title(f"Wavefield t={sim_t}s")
        ax.set_xticks([])
        ax.set_yticks([])
        stamp_simulated(ax)
        name = f"wavefield_{k:03d}.png"
        path = out / name
        save_fig(path, fig)
        art_id = f"{meta['artifact_prefix']}{k + 1:03d}"
        art = make_artifact(art_id, name, path.relative_to(REPO_ROOT), type_="image", format_="png")
        artifacts.append(art)
        wavefield_frames.append(
            {"step": k + 1, "simulation_time": sim_t, "preview_url": art["preview_url"], "artifact_id": art_id}
        )

    partitions = [
        {"partition_id": pid, "cells": int(2_000_000 + rng.integers(-40000, 40000)), "cores": 64}
        for pid in range(8)
    ]

    write_json(
        out / "domain_data.json",
        {
            "source_type": "simulated",
            "residual_series": residual_series,
            "seismogram_series": seismogram_series,
            "wavefield_frames": wavefield_frames,
            "domain_partitions": partitions,
        },
    )
    write_csv(out / "residual_series.csv", residual_series)
    write_csv(out / "seismogram_series.csv", seismogram_series)
    artifacts.append(
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "residual_series.csv",
            (out / "residual_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        )
    )
    artifacts.append(
        make_artifact(
            f"{meta['artifact_prefix']}CSV2",
            "seismogram_series.csv",
            (out / "seismogram_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        )
    )

    domain_data = {
        "scenario_id": scenario_id,
        "residual_series": residual_series,
        "seismogram_series": seismogram_series,
        "wavefield_frames": wavefield_frames,
        "domain_partitions": partitions,
    }
    merge_domain_into_run(domain, run_id, domain_data, artifacts)
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("wave-propagation ok")


if __name__ == "__main__":
    main()
