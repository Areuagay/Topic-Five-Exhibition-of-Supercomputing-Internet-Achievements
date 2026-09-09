#!/usr/bin/env python3
"""Validate simulated domain_data in mock-data run-details."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_domain_data.admet import passes as admet_passes  # noqa: E402
from generate_domain_data.common import MOCK_DATA_DIR, SCENARIO_RUNS  # noqa: E402
from generate_domain_data.uav_path import point_in_obstacle  # noqa: E402

REPORT_PATH = ROOT / "validation_report.json"


def is_number_ok(v):
    return isinstance(v, (int, float)) and math.isfinite(float(v))


def walk_finite(obj, path="$"):
    errs = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            errs.extend(walk_finite(v, f"{path}.{k}"))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            errs.extend(walk_finite(v, f"{path}[{i}]"))
    elif isinstance(obj, float):
        if not math.isfinite(obj):
            errs.append(f"non-finite at {path}")
    return errs


def ordered(xs, key):
    vals = [row[key] for row in xs]
    return all(vals[i] <= vals[i + 1] for i in range(len(vals) - 1))


def overall_down(xs, key):
    return xs[-1][key] < xs[0][key]


def validate_one(meta):
    errors = []
    warnings = []
    domain = meta["domain"]
    run_id = meta["run_id"]
    scenario_id = meta["scenario_id"]
    path = MOCK_DATA_DIR / domain / "run-details" / f"{run_id}.json"
    if not path.exists():
        return [f"missing run detail {path}"], warnings

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"JSON parse failed {path}: {e}"], warnings

    data = payload.get("data") or {}
    if data.get("run_id") != run_id:
        errors.append("run_id mismatch")
    if data.get("scenario_id") != scenario_id:
        errors.append(f"scenario_id expected {scenario_id}, got {data.get('scenario_id')}")
    if data.get("source_type") != "simulated":
        errors.append("source_type != simulated")

    dd = data.get("domain_data")
    if not isinstance(dd, dict):
        errors.append("missing domain_data")
        return errors, warnings
    if dd.get("source_type") != "simulated":
        errors.append("domain_data.source_type != simulated")

    errors.extend(walk_finite(dd))

    metrics = data.get("metrics") or {}
    if "domain_data" not in metrics:
        warnings.append("metrics.domain_data missing (prefer exposing via /metrics)")

    sid = scenario_id
    if sid == "wave-propagation":
        rs = dd.get("residual_series") or []
        if not (30 <= len(rs) <= 50):
            errors.append(f"residual_series length {len(rs)}")
        if not ordered(rs, "iteration"):
            errors.append("residual iteration not ordered")
        if not overall_down(rs, "residual"):
            errors.append("residual not overall decreasing")
        ss = dd.get("seismogram_series") or []
        if not (120 <= len(ss) <= 200):
            errors.append(f"seismogram length {len(ss)}")
        if not ordered(ss, "time"):
            errors.append("seismogram time not ordered")

    elif sid == "tectonic-evolution":
        for key in ("temperature_series", "velocity_series", "nonlinear_series"):
            if key not in dd:
                errors.append(f"missing {key}")
        if dd.get("nonlinear_series") and not overall_down(dd["nonlinear_series"], "residual"):
            errors.append("nonlinear residual not overall decreasing")

    elif sid == "llm-pretraining":
        ts = dd.get("training_series") or []
        if not (60 <= len(ts) <= 100):
            errors.append(f"training_series length {len(ts)}")
        if not overall_down(ts, "loss"):
            errors.append("loss final >= initial")

    elif sid == "pinn-acceleration":
        ts = dd.get("pinn_training_series") or []
        if not overall_down(ts, "total_loss"):
            errors.append("pinn total_loss final >= initial")
        rf = dd.get("residual_field") or {}
        vals = rf.get("values") or []
        if not vals or len(vals) != len(vals[0]):
            errors.append("residual_field not square-ish grid")

    elif sid == "vehicle-crash":
        es = dd.get("energy_series") or []
        if not (80 <= len(es) <= 150):
            errors.append(f"energy_series length {len(es)}")
        if not overall_down(es, "kinetic_energy"):
            errors.append("kinetic not decreasing")
        if not (es[-1]["internal_energy"] > es[0]["internal_energy"]):
            errors.append("internal not increasing")
        hg = [r["hourglass_energy"] for r in es]
        if max(hg) > max(r["kinetic_energy"] for r in es) * 0.2:
            errors.append("hourglass abnormally high")

    elif sid == "fatigue-life":
        ds = dd.get("damage_series") or []
        if not ordered(ds, "cycle"):
            errors.append("damage cycles not ordered")
        ratios = [r["damage_ratio"] for r in ds]
        if any(ratios[i] > ratios[i + 1] + 1e-12 for i in range(len(ratios) - 1)):
            errors.append("damage_ratio not monotonic non-decreasing")
        locs = dd.get("critical_locations") or []
        for i in range(len(locs) - 1):
            if locs[i]["damage"] < locs[i + 1]["damage"] and locs[i]["predicted_life"] < locs[i + 1]["predicted_life"]:
                warnings.append("location damage/life ordering soft check")

    elif sid == "swarm-coordination":
        fs = dd.get("formation_series") or []
        completed = [r["completed_uavs"] for r in fs]
        if any(completed[i] > completed[i + 1] for i in range(len(completed) - 1)):
            errors.append("completed_uavs not non-decreasing")
        total = dd.get("total_uavs", 1000)
        if any(r["active_uavs"] > total for r in fs):
            errors.append("active_uavs > total")

    elif sid == "path-planning":
        env = dd.get("environment") or {}
        start, goal = env.get("start"), env.get("goal")
        obstacles = env.get("obstacles") or []
        if any(point_in_obstacle(start[0] + 0.5, start[1] + 0.5, o) for o in obstacles):
            errors.append("start inside obstacle")
        if any(point_in_obstacle(goal[0] + 0.5, goal[1] + 0.5, o) for o in obstacles):
            errors.append("goal inside obstacle")
        for p in dd.get("best_path") or []:
            # Path points are integer grid cells; test cell centers like the planner.
            cx, cy = float(p["x"]) + 0.5, float(p["y"]) + 0.5
            if any(point_in_obstacle(cx, cy, o) for o in obstacles):
                errors.append(f"path hits obstacle at {p}")
                break
        cs = dd.get("cost_series") or []
        if cs and not overall_down(cs, "best_cost"):
            errors.append("best_cost not overall decreasing")
        if any(r["average_cost"] <= r["best_cost"] for r in cs):
            errors.append("average_cost must be > best_cost")

    elif sid == "virtual-screening":
        funnel = dd.get("screening_funnel") or {}
        keys = ["input", "preprocessed", "docked", "property_passed", "top_n"]
        vals = [funnel.get(k, -1) for k in keys]
        if any(vals[i] < vals[i + 1] for i in range(len(vals) - 1)):
            errors.append("funnel not monotone decreasing")
        tops = dd.get("top_candidates") or []
        dist = dd.get("score_distribution") or []
        # lower docking score is better
        if tops and dist:
            # approximate overall mean mid of bins
            mid = sum(((b["min"] + b["max"]) / 2) * b["count"] for b in dist) / max(1, sum(b["count"] for b in dist))
            if tops[0]["docking_score"] > mid:
                errors.append("top candidate not better than distribution center")

    elif sid == "admet-prediction":
        for row in dd.get("candidate_properties") or []:
            for k in ("absorption", "distribution", "metabolism", "excretion", "toxicity"):
                if not (0 <= row[k] <= 1):
                    errors.append(f"{row['compound_id']} {k} out of range")
            if bool(row["passed"]) != admet_passes(row):
                errors.append(f"{row['compound_id']} passed flag inconsistent")

    elif sid == "band-dos":
        scf = dd.get("scf_series") or []
        if scf and not overall_down(scf, "energy_delta"):
            # soft: check endpoints
            if scf[-1]["energy_delta"] >= scf[0]["energy_delta"]:
                errors.append("scf energy_delta not decreasing")
        bands = (dd.get("band_structure") or {}).get("bands") or []
        if bands:
            n = len(bands[0]["energies"])
            if any(len(b["energies"]) != n for b in bands):
                errors.append("band lengths inconsistent")
        if any(r["total_dos"] < 0 for r in dd.get("dos_series") or []):
            errors.append("DOS negative")

    elif sid == "high-throughput-screening":
        bs = dd.get("batch_summary") or {}
        if not (bs.get("completed", 0) <= bs.get("total", -1)):
            errors.append("completed > total")
        if not (bs.get("converged", 0) <= bs.get("completed", -1)):
            errors.append("converged > completed")
        if not (bs.get("failed", 0) <= bs.get("completed", -1)):
            errors.append("failed > completed")
        if not (bs.get("qualified", 0) <= bs.get("converged", -1)):
            errors.append("qualified > converged")
        cdist = dd.get("cluster_distribution") or []
        if sum(c.get("assigned", 0) for c in cdist) != bs.get("total", -1):
            errors.append("cluster assigned sum != total")

    return errors, warnings


def main():
    results = []
    failed = 0
    for key, meta in SCENARIO_RUNS.items():
        errs, warns = validate_one(meta)
        ok = not errs
        if not ok:
            failed += 1
        results.append(
            {
                "scenario_key": key,
                "run_id": meta["run_id"],
                "scenario_id": meta["scenario_id"],
                "status": "PASS" if ok else "FAIL",
                "errors": errs,
                "warnings": warns,
            }
        )
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {meta['run_id']} ({meta['scenario_id']}) errors={len(errs)} warnings={len(warns)}")
        for e in errs:
            print(f"  - {e}")

    report = {
        "source_type": "simulated",
        "status": "PASS" if failed == 0 else "FAIL",
        "failed_count": failed,
        "results": results,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(report["status"])
    print(f"wrote {REPORT_PATH}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
