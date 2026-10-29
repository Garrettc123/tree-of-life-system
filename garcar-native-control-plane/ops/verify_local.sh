#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${GARCAR_BASE_URL:-http://127.0.0.1:${PORT:-8080}}"
REQUIRE_ORCHESTRATOR="${REQUIRE_ORCHESTRATOR:-0}"

python3 - "$ROOT" "$BASE_URL" "$REQUIRE_ORCHESTRATOR" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

root = Path(sys.argv[1])
base_url = sys.argv[2].rstrip("/")
require_orchestrator = sys.argv[3] == "1"

token = os.environ.get("GARCAR_OPERATOR_TOKEN", "")
env_file = root / ".env"
if not token and env_file.is_file():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("GARCAR_OPERATOR_TOKEN="):
            token = line.partition("=")[2].strip()
            break
if not token:
    raise SystemExit("FAIL: operator token not found in environment or local .env")

def request(path, *, authorized=True):
    headers = {"Accept": "application/json"}
    if authorized:
        headers["X-Operator-Token"] = token
    req = urllib.request.Request(base_url + path, headers=headers)
    with urllib.request.urlopen(req, timeout=4) as response:
        return json.loads(response.read().decode("utf-8"))

try:
    health = request("/health", authorized=False)
    if health.get("status") != "ok":
        raise RuntimeError("public liveness check did not return status=ok")
    print("PASS: control-plane liveness")

    status = request("/api/status")
    if status.get("database") != "available":
        raise RuntimeError("control-plane database did not report available")
    print("PASS: operator authentication and local database")

    inventory = request("/api/services")
    services = {item.get("name"): item for item in inventory.get("services", [])}
    orchestrator = services.get("orchestrator", {})
    print("INFO: orchestrator status =", orchestrator.get("status", "not_in_inventory"))
    if require_orchestrator and orchestrator.get("status") != "healthy":
        raise RuntimeError("orchestrator is required but was not verified healthy")

    audit = request("/api/audit/verify")
    if audit.get("valid") is not True:
        raise RuntimeError("audit hash chain verification failed")
    print("PASS: audit hash chain (", audit.get("events_checked", 0), "events )", sep="")
    print("PASS: local verification completed; this does not prove public hosting or downstream integrations.")
except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, RuntimeError) as exc:
    print("FAIL:", type(exc).__name__ + ":", str(exc), file=sys.stderr)
    raise SystemExit(1)
PY
