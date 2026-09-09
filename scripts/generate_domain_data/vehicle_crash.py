"""automotive / vehicle-crash simulated domain data."""
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
    meta = resolve_meta("vehicle-crash", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n = 120
    t = np.linspace(0, 0.15, n)
    ke0 = 320.0
    kinetic = ke0 * np.exp(-t / 0.07) + 8
    internal = (ke0 - 8) * (1 - np.exp(-t / 0.07)) + 8
    hourglass = 0.5 + 9 * (1 - np.exp(-t / 0.05)) * (0.4 + 0.2 * np.sin(30 * t))
    # energy error 1-4%
    scale = 1 + 0.025
    kinetic *= 1 + rng.normal(0, 0.005, n)
    internal *= 1 + rng.normal(0, 0.005, n)
    hourglass = np.clip(hourglass + rng.normal(0, 0.1, n), 0.2, None)

    energy_series = [
        {
            "time": float_clean(ti, 5),
            "kinetic_energy": float_clean(k, 3),
            "internal_energy": float_clean(i, 3),
            "hourglass_energy": float_clean(h, 3),
            # legacy keys used by existing mock UI / series
            "kinetic": float_clean(k, 3),
            "internal": float_clean(i, 3),
            "hourglass": float_clean(h, 3),
        }
        for ti, k, i, h in zip(t, kinetic, internal, hourglass)
    ]

    n_acc = 160
    ta = np.linspace(0, 0.15, n_acc)
    peak_t = 0.045
    acc = 38 * np.exp(-((ta - peak_t) ** 2) / (2 * 0.012**2))
    acc += 8 * np.exp(-((ta - 0.08) ** 2) / (2 * 0.02**2))
    acc += rng.normal(0, 0.6, n_acc)
    acceleration_series = [{"time": float_clean(ti, 5), "acceleration_g": float_clean(a, 3)} for ti, a in zip(ta, acc)]

    intrusion = 185 / (1 + np.exp(-35 * (t - 0.055)))
    intrusion += rng.normal(0, 0.8, n)
    intrusion = np.maximum.accumulate(np.maximum(intrusion, 0))
    intrusion_series = [{"time": float_clean(ti, 5), "intrusion_mm": float_clean(v, 2)} for ti, v in zip(t, intrusion)]

    total0 = kinetic[0] + internal[0] + hourglass[0]
    total_end = kinetic[-1] + internal[-1] + hourglass[-1]
    energy_error = abs(total_end - total0) / total0 * 100
    energy_error = float(np.clip(energy_error if energy_error >= 1 else 2.4, 1.0, 4.0))

    critical_results = {
        "peak_acceleration_g": float_clean(float(np.max(acc)), 2),
        "max_intrusion_mm": float_clean(float(intrusion[-1]), 2),
        "max_stress_mpa": float_clean(420 + rng.normal(0, 12), 1),
        "energy_error_percent": float_clean(energy_error, 2),
    }

    artifacts = []
    for idx, label in enumerate(["front", "middle", "final"]):
        fig, ax = plt.subplots(figsize=(4.5, 2.8))
        body = plt.Rectangle((0.1 + 0.02 * idx, 0.35), 0.55 - 0.05 * idx, 0.3, color="#4a6fa5", alpha=0.85)
        wall = plt.Rectangle((0.75, 0.2), 0.08, 0.6, color="#333")
        ax.add_patch(body)
        ax.add_patch(wall)
        stress = np.linspace(0.2, 0.9, 40)
        ax.plot(0.75 - 0.05 * stress, 0.5 + 0.1 * np.sin(8 * stress + idx), color="#e74c3c", lw=2)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
        ax.set_title(f"Crash Stress ({label}) — SIMULATED")
        stamp_simulated(ax)
        name = f"stress_{label}.png"
        path = out / name
        save_fig(path, fig)
        artifacts.append(
            make_artifact(
                f"{meta['artifact_prefix']}{idx + 1:02d}",
                name,
                path.relative_to(REPO_ROOT),
                type_="image",
                format_="png",
            )
        )

    write_csv(out / "energy_series.csv", energy_series)
    write_csv(out / "acceleration_series.csv", acceleration_series)
    artifacts.append(
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "energy_series.csv",
            (out / "energy_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        )
    )

    domain_data = {
        "scenario_id": scenario_id,
        "energy_series": energy_series,
        "acceleration_series": acceleration_series,
        "intrusion_series": intrusion_series,
        "critical_results": critical_results,
    }
    # Enhance existing metrics.energy_series with denser compatible points
    legacy_energy = [
        {
            "time": row["time"],
            "kinetic": row["kinetic"],
            "internal": row["internal"],
            "hourglass": row["hourglass"],
        }
        for row in energy_series
    ]
    merge_domain_into_run(domain, run_id, domain_data, artifacts, metrics_patch={"energy_series": legacy_energy})
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("vehicle-crash ok")


if __name__ == "__main__":
    main()
