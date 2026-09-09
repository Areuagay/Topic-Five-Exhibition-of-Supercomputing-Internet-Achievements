"""drug / admet-prediction simulated domain data."""
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


def passes(row: dict) -> bool:
    return row["toxicity"] < 0.4 and row["absorption"] > 0.5 and row["distribution"] > 0.4


def generate(run_id=None, output_dir=None, seed=None, force=False):
    meta = resolve_meta("admet-prediction", run_id)
    run_id = meta["run_id"]
    domain, scenario_id = meta["domain"], meta["scenario_id"]
    rng = make_rng(run_id, seed)
    out = Path(output_dir) if output_dir else artifact_dir(domain, scenario_id, run_id)
    out.mkdir(parents=True, exist_ok=True)

    n = 36
    candidate_properties = []
    for i in range(n):
        row = {
            "compound_id": f"SIM-ADMET-{i + 1:03d}",
            "absorption": float_clean(float(rng.beta(2.2, 1.6)), 4),
            "distribution": float_clean(float(rng.beta(2.0, 1.8)), 4),
            "metabolism": float_clean(float(rng.beta(1.8, 1.8)), 4),
            "excretion": float_clean(float(rng.beta(1.7, 1.9)), 4),
            "toxicity": float_clean(float(rng.beta(1.5, 2.5)), 4),
        }
        row["passed"] = passes(row)
        candidate_properties.append(row)

    passed = sum(1 for r in candidate_properties if r["passed"])
    admet_summary = {"total": n, "passed": passed, "failed": n - passed}

    risk_counts = {"low": 0, "medium": 0, "high": 0}
    for r in candidate_properties:
        if r["toxicity"] < 0.3 and r["passed"]:
            risk_counts["low"] += 1
        elif r["toxicity"] < 0.55:
            risk_counts["medium"] += 1
        else:
            risk_counts["high"] += 1
    risk_distribution = [{"risk_level": k, "count": v} for k, v in risk_counts.items()]

    props = ["absorption", "distribution", "metabolism", "excretion", "toxicity"]
    property_distribution = {}
    for p in props:
        vals = np.array([r[p] for r in candidate_properties])
        hist, edges = np.histogram(vals, bins=np.linspace(0, 1, 11))
        property_distribution[p] = {
            "mean": float_clean(float(vals.mean()), 4),
            "std": float_clean(float(vals.std()), 4),
            "bins": [
                {"min": float_clean(edges[i], 3), "max": float_clean(edges[i + 1], 3), "count": int(hist[i])}
                for i in range(len(hist))
            ],
        }

    write_csv(out / "candidate_properties.csv", candidate_properties)
    write_json(
        out / "admet_summary.json",
        {
            "source_type": "simulated",
            "admet_summary": admet_summary,
            "risk_distribution": risk_distribution,
            "property_distribution": property_distribution,
        },
    )
    artifacts = [
        make_artifact(
            f"{meta['artifact_prefix']}CSV1",
            "candidate_properties.csv",
            (out / "candidate_properties.csv").relative_to(REPO_ROOT),
            type_="dataset",
            format_="csv",
        ),
        make_artifact(
            f"{meta['artifact_prefix']}JSON1",
            "admet_summary.json",
            (out / "admet_summary.json").relative_to(REPO_ROOT),
            type_="dataset",
            format_="json",
        ),
    ]

    domain_data = {
        "scenario_id": scenario_id,
        "filter_rule": {
            "toxicity_lt": 0.4,
            "absorption_gt": 0.5,
            "distribution_gt": 0.4,
        },
        "admet_summary": admet_summary,
        "candidate_properties": candidate_properties,
        "risk_distribution": risk_distribution,
        "property_distribution": property_distribution,
    }
    merge_domain_into_run(domain, run_id, domain_data, artifacts)
    return domain_data


def main():
    args = add_common_cli(argparse.ArgumentParser()).parse_args()
    generate(args.run_id, args.output_dir, args.seed, args.force)
    print("admet-prediction ok")


if __name__ == "__main__":
    main()
