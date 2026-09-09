#!/usr/bin/env python3
"""Check artifact files referenced by run-details and artifact_index."""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_domain_data.common import (  # noqa: E402
    ARTIFACT_INDEX_PATH,
    ARTIFACTS_ROOT,
    MOCK_DATA_DIR,
    SCENARIO_RUNS,
)

REPORT_PATH = ROOT / "artifact_check_report.json"


def safe_under_artifacts(path: Path) -> bool:
    try:
        resolved = path.resolve()
        root = ARTIFACTS_ROOT.resolve()
        # also allow any path under repo artifacts/
        artifacts = (ROOT / "artifacts").resolve()
        return str(resolved).startswith(str(artifacts)) and ".." not in path.as_posix()
    except Exception:
        return False


def check_file(path: Path, fmt: str):
    errs = []
    if not path.exists():
        return [f"missing file {path}"]
    if not safe_under_artifacts(path) and "artifacts" not in path.as_posix():
        # generated files should live under artifacts/
        errs.append(f"file not under artifacts/: {path}")
    if ".." in path.as_posix():
        errs.append(f"path traversal: {path}")
    try:
        if fmt == "png" or path.suffix.lower() == ".png":
            from PIL import Image

            with Image.open(path) as im:
                im.verify()
        elif fmt == "json" or path.suffix.lower() == ".json":
            json.loads(path.read_text(encoding="utf-8"))
        elif fmt == "csv" or path.suffix.lower() == ".csv":
            with path.open(encoding="utf-8", newline="") as f:
                list(csv.reader(f))
    except Exception as e:
        errs.append(f"unreadable {path}: {e}")
    return errs


def main():
    errors = []
    checked = 0

    if not ARTIFACT_INDEX_PATH.exists():
        errors.append("artifact_index.json missing")
    else:
        index = json.loads(ARTIFACT_INDEX_PATH.read_text(encoding="utf-8"))
        for art_id, meta in (index.get("artifacts") or {}).items():
            rel = meta.get("path") or ""
            if ".." in rel:
                errors.append(f"traversal in index {art_id}: {rel}")
                continue
            path = (ROOT / rel).resolve()
            errs = check_file(path, meta.get("format") or path.suffix.lstrip("."))
            errors.extend(errs)
            size = meta.get("size")
            if path.exists() and size is not None and abs(path.stat().st_size - int(size)) > 0:
                # allow exact match preference
                if path.stat().st_size != int(size):
                    errors.append(f"size mismatch {art_id}: meta={size} actual={path.stat().st_size}")
            checked += 1

    for meta in SCENARIO_RUNS.values():
        detail_path = MOCK_DATA_DIR / meta["domain"] / "run-details" / f"{meta['run_id']}.json"
        payload = json.loads(detail_path.read_text(encoding="utf-8"))
        for art in payload["data"].get("artifacts") or []:
            for url_key in ("preview_url", "download_url"):
                url = art.get(url_key) or ""
                if url and ".." in url:
                    errors.append(f"traversal in {url_key}: {url}")
            storage = art.get("storage_path") or ""
            if storage.startswith("gfs://"):
                # legacy placeholder — skip existence for old entries without local file
                continue
            if storage.startswith("artifacts/"):
                path = ROOT / storage
                errs = check_file(path, art.get("format") or path.suffix.lstrip("."))
                errors.extend([f"{art.get('id')}: {e}" for e in errs])
                checked += 1
                if art.get("preview_url") and not art["preview_url"].startswith("/api/v1/files/"):
                    errors.append(f"bad preview_url {art.get('id')}")
                if art.get("download_url") and not art["download_url"].startswith("/api/v1/files/"):
                    errors.append(f"bad download_url {art.get('id')}")

    report = {
        "source_type": "simulated",
        "status": "PASS" if not errors else "FAIL",
        "checked": checked,
        "errors": errors,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(report["status"], f"checked={checked} errors={len(errors)}")
    for e in errors[:50]:
        print(" -", e)
    print(f"wrote {REPORT_PATH}")
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
