#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VENV="$ROOT/.mcp-venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required." >&2
  exit 1
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
fi

if [[ -n "${TERMUX_VERSION:-}" || -d /data/data/com.termux ]]; then
  py_minor="$("$VENV/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  if [[ "$py_minor" != "3.14" ]]; then
    echo "The tested Termux bootstrap targets Python 3.14 for the Android pydantic-core wheel. Update Termux Python and rerun." >&2
    exit 1
  fi
  "$VENV/bin/python" -m pip install --disable-pip-version-check --no-deps --only-binary=:all: --index-url https://eutalix.github.io/android-pydantic-core/ pydantic-core==2.50.0
fi

"$VENV/bin/python" -m pip install --disable-pip-version-check -r requirements-mcp.txt
"$VENV/bin/python" -m pip install --disable-pip-version-check pytest==9.2.0

"$VENV/bin/python" -c 'import httpx, mcp, pydantic, pydantic_core; print("MCP dependencies ready:", mcp.__version__, pydantic.__version__, pydantic_core.__version__)'
echo "PASS: MCP environment installed separately. No server was started."
