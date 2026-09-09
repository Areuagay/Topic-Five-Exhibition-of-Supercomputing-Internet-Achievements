"""geodynamics / tectonic-evolution (alias: plate-tectonics)."""
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
)


def generate(run_id=None, output_dir=None, seed=None, force=False):
    meta = resolve_meta("tectonic-evolution", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n = 48
    times = np.linspace(0, 100.0, n)
    avg_t = np.clip(900 + 120 * np.sin(times / 18) + rng.normal(0, 8, n), 300, 1800)
    max_t = np.clip(avg_t + 350 + 40 * np.sin(times / 12), 300, 1800)
    temperature_series = [
        {
            "time": float_clean(t, 3),
            "max_temperature": float_clean(mx, 2),
            "avg_temperature": float_clean(av, 2),
        }
        for t, mx, av in zip(times, max_t, avg_t)
    ]

    max_v = np.abs(4.5e-9 * (1 + 0.2 * np.sin(times / 15)) + rng.normal(0, 1e-10, n))
    avg_v = max_v * (0.35 + 0.05 * rng.random(n))
    velocity_series = [
        {
            "time": float_clean(t, 3),
            "max_velocity": float_clean(mv, 12),
            "avg_velocity": float_clean(av, 12),
        }
        for t, mv, av in zip(times, max_v, avg_v)
    ]

    n_nl = 35
    it = np.arange(1, n_nl + 1)
    resid = 0.2 * np.exp(-it / 6.0) + 1e-5
    resid[12] *= 1.35
    resid[22] *= 1.2
    resid *= 1 + rng.normal(0, 0.03, n_nl)
    nonlinear_series = [{"iteration": int(i), "residual": float_clean(r, 10)} for i, r in zip(it, resid)]

    field_frames = []
    artifacts = []
    xs = np.linspace(0, 1, 80)
    ys = np.linspace(0, 1, 80)
    X, Y = np.meshgrid(xs, ys)
    for k in range(8):
        plume = np.exp(-((X - 0.45) ** 2 + (Y - 0.25 - 0.04 * k) ** 2) / 0.03)
        slab = np.exp(-((X - 0.75) ** 2) / 0.01) * (1 - Y)
        temp = 300 + 1200 * (1 - Y) + 450 * plume - 400 * slab
        U = 0.4 * np.sin(2 * np.pi * Y) * (1 - X)
        V = 0.35 * np.cos(2 * np.pi * X) * Y

        fig, ax = plt.subplots(figsize=(4.2, 3.6))
        im = ax.imshow(temp, origin="lower", cmap="inferno", extent=[0, 1, 0, 1], vmin=300, vmax=1800)
        ax.set_title(f"Temperature Field #{k + 1}")
        stamp_simulated(ax)
        fig.colorbar(im, ax=ax, fraction=0.046)
        tname = f"temperature_field_{k:03d}.png"
        tpath = out / tname
        save_fig(tpath, fig)
        tart = make_artifact(
            f"{meta['artifact_prefix']}T{k + 1:02d}",
            tname,
            tpath.relative_to(REPO_ROOT),
            type_="image",
            format_="png",
        )

        fig, ax = plt.subplots(figsize=(4.2, 3.6))
        step = 4
        ax.quiver(X[::step, ::step], Y[::step, ::step], U[::step, ::step], V[::step, ::step], color="#1f4e79")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.set_aspect("equal")
        ax.set_title(f"Velocity Field #{k + 1}")
        stamp_simulated(ax)
        vname = f"velocity_field_{k:03d}.png"
        vpath = out / vname
        save_fig(vpath, fig)
        vart = make_artifact(
            f"{meta['artifact_prefix']}V{k + 1:02d}",
            vname,
            vpath.relative_to(REPO_ROOT),
            type_="image",
            format_="png",
        )
        artifacts.extend([tart, vart])
        field_frames.append(
            {
                "time": float_clean(times[min(k * 6, n - 1)], 3),
                "temperature_preview": tart["preview_url"],
                "velocity_preview": vart["preview_url"],
            }
        )

    write_csv(out / "temperature_series.csv", temperature_series)
    write_csv(out / "velocity_series.csv", velocity_series)
    artifacts.append(
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "temperature_series.csv",
            (out / "temperature_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        )
    )

    domain_data = {
        "scenario_id": scenario_id,
        "scenario_alias": "plate-tectonics",
        "temperature_series": temperature_series,
        "velocity_series": velocity_series,
        "nonlinear_series": nonlinear_series,
        "field_frames": field_frames,
    }
    merge_domain_into_run(domain, run_id, domain_data, artifacts)
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("tectonic-evolution ok")


if __name__ == "__main__":
    main()
