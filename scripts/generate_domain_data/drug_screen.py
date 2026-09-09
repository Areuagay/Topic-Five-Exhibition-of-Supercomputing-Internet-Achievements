"""drug / virtual-screening simulated domain data."""
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
    meta = resolve_meta("virtual-screening", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    screening_funnel = {
        "input": 1_000_000,
        "preprocessed": 820_000,
        "docked": 210_000,
        "property_passed": 18_500,
        "top_n": 50,
    }

    # truncated normal around -7.5 with elite tail
    samples = rng.normal(-7.5, 1.2, 5000)
    elite = rng.normal(-11.0, 0.5, 200)
    samples = np.concatenate([samples, elite])
    samples = np.clip(samples, -12.5, -3.0)
    bins = np.linspace(-12.5, -3.0, 21)
    hist, edges = np.histogram(samples, bins=bins)
    score_distribution = [
        {"min": float_clean(edges[i], 3), "max": float_clean(edges[i + 1], 3), "count": int(hist[i])}
        for i in range(len(hist))
    ]

    top_scores = np.sort(samples)[:16]
    top_candidates = []
    artifacts = []
    for rank, score in enumerate(top_scores, start=1):
        fig, ax = plt.subplots(figsize=(3.2, 3.2))
        n_atoms = int(rng.integers(8, 14))
        pts = rng.random((n_atoms, 2))
        for i in range(n_atoms):
            for j in range(i + 1, n_atoms):
                if np.linalg.norm(pts[i] - pts[j]) < 0.35:
                    ax.plot([pts[i, 0], pts[j, 0]], [pts[i, 1], pts[j, 1]], color="#2c3e50", lw=1.5)
        ax.scatter(pts[:, 0], pts[:, 1], s=80, c="#3498db", zorder=3)
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_title("Simulated Compound")
        stamp_simulated(ax, "Simulated Compound")
        name = f"compound_{rank:03d}.png"
        path = out / name
        save_fig(path, fig)
        art_id = f"{meta['artifact_prefix']}C{rank:02d}"
        art = make_artifact(art_id, name, path.relative_to(REPO_ROOT), type_="image", format_="png")
        artifacts.append(art)
        top_candidates.append(
            {
                "rank": rank,
                "compound_id": f"SIM-CMPD-{rank:04d}",
                "docking_score": float_clean(float(score), 3),
                "molecular_weight": float_clean(float(rng.uniform(220, 480)), 1),
                "logp": float_clean(float(rng.uniform(1.0, 4.5)), 2),
                "preview_url": art["preview_url"],
            }
        )

    write_csv(out / "top_candidates.csv", top_candidates)
    write_json(out / "score_distribution.json", {"source_type": "simulated", "score_distribution": score_distribution})
    artifacts.append(
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "top_candidates.csv",
            (out / "top_candidates.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        )
    )

    domain_data = {
        "scenario_id": scenario_id,
        "screening_funnel": screening_funnel,
        "score_distribution": score_distribution,
        "top_candidates": top_candidates,
    }
    merge_domain_into_run(
        domain,
        run_id,
        domain_data,
        artifacts,
        metrics_patch={
            "score_summary": {
                "best_score": top_candidates[0]["docking_score"],
                "average_score": float_clean(float(np.mean(samples)), 2),
                "median_score": float_clean(float(np.median(samples)), 2),
                "qualified_count": int((samples < -9.0).sum()),
            }
        },
    )
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("virtual-screening ok")


if __name__ == "__main__":
    main()
