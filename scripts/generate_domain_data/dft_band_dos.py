"""dft / band-dos simulated domain data."""
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
    meta = resolve_meta("band-dos", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n_scf = 20
    energies = []
    e = -108.5
    for i in range(1, n_scf + 1):
        delta = 0.2 * np.exp(-i / 3.2) * (1 + abs(rng.normal(0, 0.05)))
        e = e + (-1 if i == 1 else 1) * 0  # keep converging downward in magnitude of delta
        e_next = e - delta * (0.4 if i > 1 else 1)
        # actually decrease total energy toward convergence
        e = -108.9 + 1.2 * np.exp(-i / 3.5) + rng.normal(0, 0.002)
        energies.append(e)
    scf_series = []
    for i, te in enumerate(energies, start=1):
        prev = energies[i - 2] if i > 1 else te + 0.2
        scf_series.append(
            {
                "iteration": i,
                "total_energy": float_clean(te, 6),
                "energy_delta": float_clean(abs(te - prev), 8),
            }
        )
    # ensure energy_delta overall decreases
    for i in range(1, len(scf_series)):
        if scf_series[i]["energy_delta"] > scf_series[i - 1]["energy_delta"] * 1.2:
            scf_series[i]["energy_delta"] = float_clean(scf_series[i - 1]["energy_delta"] * 0.75, 8)

    k_labels = ["Γ", "X", "W", "K", "Γ"]
    segments = 4
    pts_per = 20
    k_positions = []
    for s in range(segments):
        for j in range(pts_per):
            if s == segments - 1 and j == pts_per - 1:
                k_positions.append(float(s + 1))
            elif j < pts_per:
                k_positions.append(float(s + j / pts_per))
    # unique sorted length
    k_positions = [float_clean(v, 4) for v in np.linspace(0, 4, 80)]
    nk = len(k_positions)
    k = np.array(k_positions)
    bands = []
    n_bands = 12
    for b in range(n_bands):
        # valence below 0, conduction above gap ~0.9 eV
        center = -4.5 + b * 0.7
        if b >= 6:
            center = 0.9 + (b - 6) * 0.65
        energies_b = (
            center
            + 0.6 * np.sin(1.7 * k + b)
            + 0.25 * np.cos(3.1 * k)
            + 0.08 * ((k - 2) ** 2)
            + rng.normal(0, 0.02, nk)
        )
        if b < 6:
            energies_b = np.minimum(energies_b, -0.15)
        else:
            energies_b = np.maximum(energies_b, 0.75)
        bands.append({"band_index": b, "energies": [float_clean(v, 4) for v in energies_b]})

    n_dos = 160
    e_axis = np.linspace(-6, 6, n_dos)
    dos = np.zeros_like(e_axis)
    for center, amp, width in [(-3.2, 1.4, 0.35), (-1.5, 1.8, 0.4), (1.4, 1.2, 0.3), (3.0, 0.9, 0.45)]:
        dos += amp * np.exp(-((e_axis - center) ** 2) / (2 * width**2))
    dos[(e_axis > -0.1) & (e_axis < 0.7)] *= 0.05
    dos = np.maximum(dos + rng.normal(0, 0.02, n_dos), 0)
    dos_series = [{"energy": float_clean(e, 4), "total_dos": float_clean(d, 5)} for e, d in zip(e_axis, dos)]

    structure = {
        "lattice": [[5.43, 0, 0], [0, 5.43, 0], [0, 0, 5.43]],
        "atoms": [
            {"element": "Si", "x": 0.0, "y": 0.0, "z": 0.0},
            {"element": "Si", "x": 0.25, "y": 0.25, "z": 0.25},
            {"element": "Si", "x": 0.5, "y": 0.5, "z": 0.0},
            {"element": "Si", "x": 0.75, "y": 0.75, "z": 0.25},
            {"element": "Si", "x": 0.5, "y": 0.0, "z": 0.5},
            {"element": "Si", "x": 0.75, "y": 0.25, "z": 0.75},
            {"element": "Si", "x": 0.0, "y": 0.5, "z": 0.5},
            {"element": "Si", "x": 0.25, "y": 0.75, "z": 0.75},
        ],
        "note": "simulated diamond-like cell for demo only",
    }

    band_structure = {
        "k_labels": k_labels,
        "k_positions": k_positions,
        "fermi_energy": 0.0,
        "bands": bands,
    }

    fig, ax = plt.subplots(figsize=(5, 4))
    for band in bands:
        ax.plot(k_positions, band["energies"], color="#2980b9" if band["band_index"] < 6 else "#c0392b", lw=1)
    ax.axhline(0, color="k", ls="--", lw=0.8)
    ax.set_ylabel("Energy (eV)")
    ax.set_title("Simulated Band Structure")
    stamp_simulated(ax)
    band_png = out / "band_structure.png"
    save_fig(band_png, fig)

    write_csv(out / "scf_series.csv", scf_series)
    write_csv(out / "dos_series.csv", dos_series)
    write_json(out / "band_structure.json", {"source_type": "simulated", **band_structure})
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}IMG1",
            "band_structure.png",
            band_png.relative_to(REPO_ROOT),
            type_="image",
            format_="png",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "scf_series.csv",
            (out / "scf_series.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}JSON1",
            "band_structure.json",
            (out / "band_structure.json").relative_to(REPO_ROOT),
            type_="dataset",
            format_="json",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "scf_series": scf_series,
        "band_structure": band_structure,
        "dos_series": dos_series,
        "structure": structure,
    }
    merge_domain_into_run(domain, run_id, domain_data, artifacts, metrics_patch={"scf_series": scf_series})
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("band-dos ok")


if __name__ == "__main__":
    main()
