"""llm / pinn-acceleration simulated domain data."""
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
    meta = resolve_meta("pinn-acceleration", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n = 70
    epochs = np.arange(1, n + 1)
    physics = 1.8 * np.exp(-epochs / 18) + 0.05
    data_loss = 1.1 * np.exp(-epochs / 28) + 0.03
    physics *= 1 + rng.normal(0, 0.03, n)
    data_loss *= 1 + rng.normal(0, 0.03, n)
    total = 0.6 * physics + 0.4 * data_loss
    val_err = 0.45 * np.exp(-epochs / 22) + 0.02 + rng.normal(0, 0.005, n)
    pinn_training_series = [
        {
            "epoch": int(e),
            "total_loss": float_clean(t, 6),
            "physics_loss": float_clean(p, 6),
            "data_loss": float_clean(d, 6),
            "validation_error": float_clean(v, 6),
        }
        for e, t, p, d, v in zip(epochs, total, physics, data_loss, np.abs(val_err))
    ]

    prediction_error_series = [
        {
            "epoch": int(e),
            "l2_error": float_clean(0.35 * math_exp + 0.01 + rng.normal(0, 0.003), 6),
            "max_error": float_clean(0.7 * math_exp + 0.03 + rng.normal(0, 0.005), 6),
        }
        for e, math_exp in zip(epochs, np.exp(-epochs / 20))
    ]

    grid = 36
    x = np.linspace(0, 1, grid)
    y = np.linspace(0, 1, grid)
    X, Y = np.meshgrid(x, y)
    values = (
        0.2 * np.sin(3 * np.pi * X) * np.cos(2 * np.pi * Y)
        + 0.8 * np.exp(-((X - 0.3) ** 2 + (Y - 0.7) ** 2) / 0.02)
        + 0.5 * np.exp(-((X - 0.75) ** 2 + (Y - 0.35) ** 2) / 0.015)
        + 0.05 * rng.normal(size=X.shape)
    )
    residual_field = {
        "x": [float_clean(v, 4) for v in x],
        "y": [float_clean(v, 4) for v in y],
        "values": [[float_clean(v, 5) for v in row] for row in values],
    }

    sampling_statistics = {
        "physics_points": 12000,
        "boundary_points": 2400,
        "data_points": 1800,
    }

    fig, ax = plt.subplots(figsize=(4.2, 3.6))
    im = ax.imshow(values, origin="lower", cmap="magma", extent=[0, 1, 0, 1])
    ax.set_title("PDE Residual Field")
    stamp_simulated(ax)
    fig.colorbar(im, ax=ax, fraction=0.046)
    heat_path = out / "residual_heatmap.png"
    save_fig(heat_path, fig)

    write_csv(out / "pinn_training_series.csv", pinn_training_series)
    write_json(out / "residual_field.json", {"source_type": "simulated", **residual_field})
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}IMG1",
            "residual_heatmap.png",
            heat_path.relative_to(REPO_ROOT),
            type_="image",
            format_="png",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "pinn_training_series.csv",
            (out / "pinn_training_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}JSON1",
            "residual_field.json",
            (out / "residual_field.json").relative_to(REPO_ROOT),
            type_="dataset",
            format_="json",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "pinn_training_series": pinn_training_series,
        "prediction_error_series": prediction_error_series,
        "residual_field": residual_field,
        "sampling_statistics": sampling_statistics,
    }
    merge_domain_into_run(domain, run_id, domain_data, artifacts)
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("pinn-acceleration ok")


if __name__ == "__main__":
    main()
