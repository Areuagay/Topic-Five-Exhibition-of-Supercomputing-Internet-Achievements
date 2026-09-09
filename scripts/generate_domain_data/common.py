"""Shared utilities for reproducible simulated domain data generation."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
MOCK_DATA_DIR = REPO_ROOT / "mock-data"
ARTIFACTS_ROOT = REPO_ROOT / "artifacts" / "simulated"
ARTIFACT_INDEX_PATH = ARTIFACTS_ROOT / "artifact_index.json"

# Existing project scenario ids (plate scenario is tectonic-evolution, not plate-tectonics)
SCENARIO_RUNS: dict[str, dict[str, Any]] = {
    "wave-propagation": {
        "domain": "geodynamics",
        "scenario_id": "wave-propagation",
        "run_id": "GEO-20260811-0001",
        "artifact_prefix": "ART-GEO-W",
    },
    "tectonic-evolution": {
        "domain": "geodynamics",
        "scenario_id": "tectonic-evolution",
        "run_id": "GEO-20260811-0010",
        "artifact_prefix": "ART-GEO-T",
        "alias": "plate-tectonics",
    },
    "llm-pretraining": {
        "domain": "llm",
        "scenario_id": "llm-pretraining",
        "run_id": "LLM-20260811-0001",
        "artifact_prefix": "ART-LLM-P",
    },
    "pinn-acceleration": {
        "domain": "llm",
        "scenario_id": "pinn-acceleration",
        "run_id": "LLM-20260811-0010",
        "artifact_prefix": "ART-LLM-N",
    },
    "vehicle-crash": {
        "domain": "automotive",
        "scenario_id": "vehicle-crash",
        "run_id": "AUTO-20260811-0001",
        "artifact_prefix": "ART-AUTO-C",
    },
    "fatigue-life": {
        "domain": "automotive",
        "scenario_id": "fatigue-life",
        "run_id": "AUTO-20260811-0010",
        "artifact_prefix": "ART-AUTO-F",
    },
    "swarm-coordination": {
        "domain": "uav",
        "scenario_id": "swarm-coordination",
        "run_id": "UAV-20260811-0001",
        "artifact_prefix": "ART-UAV-S",
    },
    "path-planning": {
        "domain": "uav",
        "scenario_id": "path-planning",
        "run_id": "UAV-20260811-0010",
        "artifact_prefix": "ART-UAV-P",
    },
    "virtual-screening": {
        "domain": "drug",
        "scenario_id": "virtual-screening",
        "run_id": "DRUG-20260811-0001",
        "artifact_prefix": "ART-DRUG-V",
    },
    "admet-prediction": {
        "domain": "drug",
        "scenario_id": "admet-prediction",
        "run_id": "DRUG-20260811-0010",
        "artifact_prefix": "ART-DRUG-A",
    },
    "band-dos": {
        "domain": "dft",
        "scenario_id": "band-dos",
        "run_id": "DFT-20260811-0001",
        "artifact_prefix": "ART-DFT-B",
    },
    "high-throughput-screening": {
        "domain": "dft",
        "scenario_id": "high-throughput-screening",
        "run_id": "DFT-20260811-0010",
        "artifact_prefix": "ART-DFT-H",
    },
}


def seed_from_run_id(run_id: str, override: int | None = None) -> int:
    if override is not None:
        return int(override)
    digest = hashlib.sha256(run_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def make_rng(run_id: str, override: int | None = None) -> np.random.Generator:
    return np.random.default_rng(seed_from_run_id(run_id, override))


def float_clean(x: float, ndigits: int = 6) -> float:
    v = float(x)
    if not math.isfinite(v):
        raise ValueError(f"non-finite value: {x}")
    return round(v, ndigits)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def artifact_dir(domain: str, scenario_id: str, run_id: str) -> Path:
    return ensure_dir(ARTIFACTS_ROOT / domain / scenario_id / run_id)


def stamp_simulated(ax, text: str = "SIMULATED") -> None:
    ax.text(
        0.02,
        0.98,
        text,
        transform=ax.transAxes,
        fontsize=9,
        color="white",
        fontweight="bold",
        va="top",
        ha="left",
        bbox=dict(boxstyle="round,pad=0.25", facecolor="#c0392b", alpha=0.85, edgecolor="none"),
    )


def save_fig(path: Path, fig) -> Path:
    ensure_dir(path.parent)
    fig.savefig(path, dpi=120, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return path


def write_json(path: Path, payload: Any) -> Path:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> Path:
    import csv

    ensure_dir(path.parent)
    if not fieldnames:
        fieldnames = list(rows[0].keys()) if rows else []
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return path


def file_url(artifact_id: str, kind: str) -> str:
    return f"/api/v1/files/{artifact_id}/{kind}"


def make_artifact(
    artifact_id: str,
    name: str,
    rel_path: Path,
    *,
    type_: str,
    format_: str,
    created_at: str | None = None,
    preview: bool = True,
) -> dict[str, Any]:
    abs_path = (REPO_ROOT / rel_path).resolve() if not rel_path.is_absolute() else rel_path.resolve()
    size = abs_path.stat().st_size if abs_path.exists() else 0
    storage = str(rel_path).replace("\\", "/")
    if not storage.startswith("artifacts/"):
        try:
            storage = str(abs_path.relative_to(REPO_ROOT)).replace("\\", "/")
        except ValueError:
            storage = abs_path.as_posix()
    return {
        "id": artifact_id,
        "name": name,
        "type": type_,
        "format": format_,
        "size": size,
        "storage_path": storage,
        "preview_url": file_url(artifact_id, "preview") if preview else "",
        "download_url": file_url(artifact_id, "download"),
        "created_at": created_at or datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "source_type": "simulated",
    }


def load_artifact_index() -> dict[str, Any]:
    if ARTIFACT_INDEX_PATH.exists():
        return json.loads(ARTIFACT_INDEX_PATH.read_text(encoding="utf-8"))
    return {"source_type": "simulated", "artifacts": {}}


def upsert_artifact_index(entries: list[dict[str, Any]]) -> None:
    index = load_artifact_index()
    arts = index.setdefault("artifacts", {})
    for entry in entries:
        arts[entry["id"]] = {
            "path": entry["storage_path"],
            "name": entry["name"],
            "type": entry["type"],
            "format": entry["format"],
            "size": entry["size"],
            "source_type": "simulated",
        }
    index["source_type"] = "simulated"
    index["updated_at"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    write_json(ARTIFACT_INDEX_PATH, index)


def run_detail_path(domain: str, run_id: str) -> Path:
    return MOCK_DATA_DIR / domain / "run-details" / f"{run_id}.json"


def load_run_detail(domain: str, run_id: str) -> dict[str, Any]:
    path = run_detail_path(domain, run_id)
    return json.loads(path.read_text(encoding="utf-8"))


def save_run_detail(domain: str, run_id: str, payload: dict[str, Any]) -> None:
    path = run_detail_path(domain, run_id)
    write_json(path, payload)


def merge_domain_into_run(
    domain: str,
    run_id: str,
    domain_data: dict[str, Any],
    new_artifacts: list[dict[str, Any]],
    *,
    metrics_patch: dict[str, Any] | None = None,
    keep_existing_artifact_ids: set[str] | None = None,
) -> dict[str, Any]:
    """Merge domain_data into run-detail without removing existing core fields."""
    payload = load_run_detail(domain, run_id)
    data = payload["data"]
    data["source_type"] = data.get("source_type") or "simulated"
    data["execution_mode"] = data.get("execution_mode") or "simulated"

    domain_data = {
        "source_type": "simulated",
        "execution_mode": "simulated",
        **domain_data,
    }
    data["domain_data"] = domain_data

    metrics = data.setdefault("metrics", {})
    if not isinstance(metrics, dict):
        metrics = {"progress": data.get("progress", 0), "metrics": metrics}
        data["metrics"] = metrics
    metrics["domain_data"] = domain_data
    if metrics_patch:
        for key, value in metrics_patch.items():
            metrics[key] = value

    existing = data.get("artifacts") or []
    keep = keep_existing_artifact_ids or set()
    retained = [a for a in existing if a.get("id") in keep or not str(a.get("id", "")).startswith("ART-")]
    # Prefer replacing generated simulated artifacts while keeping original demo entries
    # that we explicitly keep; drop previous generated ones with same names.
    new_names = {a["name"] for a in new_artifacts}
    retained = [a for a in existing if a.get("name") not in new_names]
    # Keep original placeholders only if not superseded by real files of same basename intent
    data["artifacts"] = retained + new_artifacts

    upsert_artifact_index(new_artifacts)
    save_run_detail(domain, run_id, payload)
    return payload


def add_common_cli(parser: argparse.ArgumentParser) -> argparse.ArgumentParser:
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    return parser


def resolve_meta(scenario_key: str, run_id: str | None = None) -> dict[str, Any]:
    meta = dict(SCENARIO_RUNS[scenario_key])
    if run_id:
        meta["run_id"] = run_id
    return meta
