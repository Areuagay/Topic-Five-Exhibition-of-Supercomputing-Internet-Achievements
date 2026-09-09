"""dft / high-throughput-screening simulated domain data."""
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

ELEMENTS = ["Si", "Ge", "Ga", "As", "Al", "N", "Ti", "O", "Zn", "S", "Cu", "Se"]
CLUSTERS = [
    ("changsha", "长沙"),
    ("guangzhou", "广州"),
    ("kunshan", "昆山"),
    ("jinan", "济南"),
]


def formula_from_rng(rng):
    a, b = rng.choice(ELEMENTS, size=2, replace=False)
    n1, n2 = int(rng.integers(1, 4)), int(rng.integers(1, 4))
    return f"{a}{n1 if n1 > 1 else ''}{b}{n2 if n2 > 1 else ''}"


def is_qualified(m):
    return (
        m["converged"]
        and m["formation_energy"] < -0.3
        and 0.8 < m["band_gap"] < 2.5
        and m["stability_score"] > 0.7
    )


def generate(run_id=None, output_dir=None, seed=None, force=False):
    meta = resolve_meta("high-throughput-screening", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    total = 200
    materials = []
    for i in range(total):
        fe = float(rng.normal(-0.5, 0.35) if rng.random() < 0.7 else rng.normal(0.1, 0.25))
        if rng.random() < 0.08:
            gap = 0.0
        else:
            gap = float(np.clip(rng.uniform(0.0, 4.0), 0, 4))
        # negative correlation with formation_energy + noise
        stability = float(np.clip(0.55 - 0.35 * fe + rng.normal(0, 0.08), 0.05, 0.99))
        converged = bool(rng.random() > 0.06)
        cluster_id = CLUSTERS[i % 4][0]
        m = {
            "material_id": f"SIM-MAT-{i + 1:04d}",
            "formula": formula_from_rng(rng),
            "formation_energy": float_clean(fe, 4),
            "band_gap": float_clean(gap, 3),
            "stability_score": float_clean(stability, 4),
            "converged": converged,
            "cluster_id": cluster_id,
        }
        materials.append(m)

    completed = total
    converged = sum(1 for m in materials if m["converged"])
    failed = completed - converged
    qualified_mats = [m for m in materials if is_qualified(m)]
    qualified = len(qualified_mats)

    batch_summary = {
        "total": total,
        "completed": completed,
        "converged": converged,
        "failed": failed,
        "qualified": qualified,
    }

    ranked = sorted(
        qualified_mats,
        key=lambda m: (-m["stability_score"], m["formation_energy"], -abs(m["band_gap"] - 1.5)),
    )[:20]
    candidate_ranking = []
    for i, m in enumerate(ranked, start=1):
        score = float_clean(m["stability_score"] * 0.6 + max(0, -m["formation_energy"]) * 0.4, 4)
        candidate_ranking.append(
            {
                "rank": i,
                "material_id": m["material_id"],
                "score": score,
                "reason": "converged + FE<-0.3 + 0.8<Eg<2.5 + stability>0.7 (simulated rule)",
            }
        )

    cluster_distribution = []
    for cid, name in CLUSTERS:
        assigned = sum(1 for m in materials if m["cluster_id"] == cid)
        cluster_distribution.append({"cluster_id": cid, "cluster_name": name, "assigned": assigned})
    assert sum(c["assigned"] for c in cluster_distribution) == total

    write_csv(out / "materials.csv", materials)
    write_json(
        out / "batch_summary.json",
        {
            "source_type": "simulated",
            "batch_summary": batch_summary,
            "candidate_ranking": candidate_ranking,
            "cluster_distribution": cluster_distribution,
        },
    )
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "materials.csv",
            (out / "materials.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}JSON1",
            "batch_summary.json",
            (out / "batch_summary.json").relative_to(REPO_ROOT),
            type_="dataset",
            format_="json",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "batch_summary": batch_summary,
        "materials": materials,
        "candidate_ranking": candidate_ranking,
        "cluster_distribution": cluster_distribution,
        "filter_rule": {
            "converged": True,
            "formation_energy_lt": -0.3,
            "band_gap_range": [0.8, 2.5],
            "stability_score_gt": 0.7,
        },
    }
    merge_domain_into_run(
        domain,
        run_id,
        domain_data,
        artifacts,
        metrics_patch={
            "batch_progress": {
                "total_materials": total,
                "completed_materials": completed,
                "converged_materials": converged,
                "failed_materials": failed,
                "materials_per_hour": 42,
                "qualified_candidates": qualified,
            }
        },
    )
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("high-throughput-screening ok")


if __name__ == "__main__":
    main()
