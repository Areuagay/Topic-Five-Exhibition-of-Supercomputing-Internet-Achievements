"""automotive / fatigue-life simulated domain data."""
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
    meta = resolve_meta("fatigue-life", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n = 70
    cycles = np.linspace(0, 1_000_000, n).astype(int)
    # slow then accelerate, monotonic non-decreasing
    ratio = (cycles / cycles[-1]) ** 2.2
    ratio = np.maximum.accumulate(np.clip(ratio + rng.normal(0, 0.002, n), 0, 0.98))
    damage_series = [{"cycle": int(c), "damage_ratio": float_clean(r, 5)} for c, r in zip(cycles, ratio)]

    stresses = np.logspace(np.log10(120), np.log10(450), 15)
    # Basquin-like
    cycles_fail = 1e12 * stresses ** (-3.5)
    sn_curve = [
        {
            "stress_amplitude": float_clean(s, 2),
            "cycles_to_failure": float_clean(c, 1),
        }
        for s, c in zip(stresses, cycles_fail)
    ]

    locations = [
        "knuckle_fillet",
        "weld_toe_A",
        "weld_toe_B",
        "bolt_hole_rim",
        "bracket_root",
        "crossmember_notch",
        "suspension_bushing",
        "frame_rail_bend",
    ]
    critical_locations = []
    damages = np.sort(rng.uniform(0.15, 0.92, len(locations)))[::-1]
    for loc, dmg in zip(locations, damages):
        max_stress = float_clean(180 + 280 * dmg + rng.normal(0, 5), 1)
        life = float_clean(2e6 * (1.05 - dmg) ** 2.5, 0)
        critical_locations.append(
            {
                "location": loc,
                "max_stress": max_stress,
                "damage": float_clean(dmg, 4),
                "predicted_life": life,
            }
        )

    xs = np.linspace(0, 1, 100)
    ys = np.linspace(0, 1, 60)
    X, Y = np.meshgrid(xs, ys)
    outline = ((X > 0.1) & (X < 0.9) & (Y > 0.25) & (Y < 0.75)).astype(float)
    hot = (
        0.9 * np.exp(-((X - 0.3) ** 2 + (Y - 0.5) ** 2) / 0.01)
        + 0.7 * np.exp(-((X - 0.7) ** 2 + (Y - 0.45) ** 2) / 0.008)
        + 0.5 * np.exp(-((X - 0.55) ** 2 + (Y - 0.6) ** 2) / 0.006)
    )
    field = outline * hot
    fig, ax = plt.subplots(figsize=(5, 3))
    im = ax.imshow(field, origin="lower", cmap="hot", extent=[0, 1, 0, 1])
    ax.set_title("Fatigue Damage Map")
    stamp_simulated(ax)
    fig.colorbar(im, ax=ax, fraction=0.046)
    map_path = out / "damage_map.png"
    save_fig(map_path, fig)

    write_csv(out / "damage_series.csv", damage_series)
    write_csv(out / "sn_curve.csv", sn_curve)
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}IMG1",
            "damage_map.png",
            map_path.relative_to(REPO_ROOT),
            type_="image",
            format_="png",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "damage_series.csv",
            (out / "damage_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "damage_series": damage_series,
        "sn_curve": sn_curve,
        "critical_locations": critical_locations,
    }
    merge_domain_into_run(domain, run_id, domain_data, artifacts)
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("fatigue-life ok")


if __name__ == "__main__":
    main()
