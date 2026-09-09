#!/usr/bin/env python3
"""API smoke test without Node: mirrors backend/server.js routing for key endpoints."""
from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
MOCK = ROOT / "mock-data"
ARTIFACTS = ROOT / "artifacts"
INDEX = ARTIFACTS / "simulated" / "artifact_index.json"

RUNS = [
    ("geodynamics", "GEO-20260811-0001"),
    ("geodynamics", "GEO-20260811-0010"),
    ("llm", "LLM-20260811-0001"),
    ("llm", "LLM-20260811-0010"),
    ("automotive", "AUTO-20260811-0001"),
    ("automotive", "AUTO-20260811-0010"),
    ("uav", "UAV-20260811-0001"),
    ("uav", "UAV-20260811-0010"),
    ("drug", "DRUG-20260811-0001"),
    ("drug", "DRUG-20260811-0010"),
    ("dft", "DFT-20260811-0001"),
    ("dft", "DFT-20260811-0010"),
]


def load_json(rel: str):
    return json.loads((MOCK / rel).read_text(encoding="utf-8"))


def resolve_artifact(artifact_id: str) -> Path | None:
    if not artifact_id or ".." in artifact_id or "/" in artifact_id or "\\" in artifact_id:
        return None
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    entry = (index.get("artifacts") or {}).get(artifact_id)
    if not entry:
        return None
    rel = str(entry.get("path") or "").replace("\\", "/")
    if ".." in rel or not rel.startswith("artifacts/"):
        return None
    path = (ROOT / rel).resolve()
    if not str(path).startswith(str(ARTIFACTS.resolve())):
        return None
    return path if path.is_file() else None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.path.startswith("/api/v1/"):
            self._send_json(404, {"code": 404, "message": "not found", "data": None})
            return
        parts = [p for p in self.path[len("/api/v1/") :].split("?")[0].split("/") if p]
        if parts[:1] == ["files"] and len(parts) >= 3 and parts[2] in ("preview", "download"):
            path = resolve_artifact(parts[1])
            if not path:
                self._send_json(404, {"code": 404, "message": "artifact missing", "data": None})
                return
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if len(parts) >= 2 and parts[1] == "runs":
            domain = parts[0]
            if len(parts) == 2:
                payload = load_json(f"{domain}/runs.json")
                self._send_json(200, {"code": 200, "message": "success", "data": payload["data"]})
                return
            run_id = parts[2]
            payload = load_json(f"{domain}/run-details/{run_id}.json")
            data = payload["data"]
            if len(parts) == 4 and parts[3] in ("metrics", "artifacts", "workflow", "logs"):
                data = data[parts[3]]
            self._send_json(200, {"code": 200, "message": "success", "data": data, "timestamp": payload.get("timestamp")})
            return

        self._send_json(404, {"code": 404, "message": f"unsupported {self.path}", "data": None})


def get_json(base, path):
    with urlopen(base + path, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8")), resp.status


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    errors = []
    ok = 0

    for domain, run_id in RUNS:
        for suffix in ("", "/metrics", "/artifacts"):
            path = f"/api/v1/{domain}/runs/{run_id}{suffix}"
            try:
                payload, status = get_json(base, path)
            except Exception as e:
                errors.append(f"{path}: {e}")
                continue
            if status != 200 or payload.get("code") != 200 or payload.get("data") is None:
                errors.append(f"{path}: bad response")
                continue
            data = payload["data"]
            if suffix == "":
                if "domain_data" not in data:
                    errors.append(f"{path}: missing domain_data")
                    continue
                if data.get("source_type") != "simulated":
                    errors.append(f"{path}: source_type")
                    continue
            if suffix == "/metrics":
                if not isinstance(data, dict) or "domain_data" not in data:
                    errors.append(f"{path}: metrics missing domain_data")
                    continue
            if suffix == "/artifacts":
                if not isinstance(data, list) or not data:
                    errors.append(f"{path}: artifacts empty")
                    continue
                # probe one local simulated artifact if present
                local = next((a for a in data if str(a.get("storage_path", "")).startswith("artifacts/")), None)
                if local:
                    art_id = local["id"]
                    try:
                        with urlopen(base + f"/api/v1/files/{art_id}/preview", timeout=5) as resp:
                            body = resp.read()
                            if resp.status != 200 or not body:
                                errors.append(f"file preview failed {art_id}")
                                continue
                    except Exception as e:
                        errors.append(f"file preview {art_id}: {e}")
                        continue
            ok += 1
            print(f"OK {path}")

    # traversal should fail
    try:
        with urlopen(base + "/api/v1/files/../secrets/preview", timeout=5) as resp:
            if resp.status == 200:
                errors.append("traversal unexpectedly succeeded")
    except Exception:
        print("OK traversal blocked")

    server.shutdown()
    print(f"smoke_ok={ok} errors={len(errors)}")
    for e in errors:
        print(" -", e)
    report = {"status": "PASS" if not errors else "FAIL", "ok": ok, "errors": errors, "source_type": "simulated"}
    (ROOT / "smoke_api_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(report["status"])
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
