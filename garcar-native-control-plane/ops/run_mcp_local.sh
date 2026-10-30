#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VENV="$ROOT/.mcp-venv"
ENV_FILE="$ROOT/.env"

if [[ "${1:-}" == "--print-config" ]]; then
  python3 - "$ROOT/ops/run_mcp_local.sh" <<'PY'
import json
import sys
print(json.dumps({
  "mcpServers": {
    "garcar-control-plane": {
      "command": "bash",
      "args": [sys.argv[1]]
    }
  }
}, indent=2))
PY
  exit 0
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "MCP dependencies are not installed. Run: bash ops/install_mcp.sh" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Local .env was not found. Run: bash ops/init_local_env.sh" >&2
  exit 1
fi

# Parse only known variables; never source/evaluate .env as shell code.
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    GARCAR_OPERATOR_TOKEN|GARCAR_CONTROL_PLANE_URL)
      export "$key=$value"
      ;;
  esac
done < "$ENV_FILE"

token="${GARCAR_OPERATOR_TOKEN:-}"
if (( ${#token} < 32 )); then
  echo "GARCAR_OPERATOR_TOKEN is missing or shorter than 32 bytes in .env" >&2
  exit 1
fi
unset token

export GARCAR_CONTROL_PLANE_URL="${GARCAR_CONTROL_PLANE_URL:-http://127.0.0.1:8080}"
exec "$VENV/bin/python" "$ROOT/mcp_server.py"
