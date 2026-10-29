#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install Python 3.12 or newer and rerun." >&2
  exit 1
fi

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt

if [[ ! -f .env ]]; then
  TOKEN="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  DISPATCH="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  (umask 077; printf 'GARCAR_OPERATOR_TOKEN=%s\nDISPATCH_SECRET=%s\n' "$TOKEN" "$DISPATCH" > .env)
  unset TOKEN DISPATCH
  echo "Operator and dispatch secrets were generated in the ignored .env file."
fi

if ! grep -q '^DISPATCH_SECRET=[^[:space:]]' .env; then
  DISPATCH="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  if grep -q '^DISPATCH_SECRET=' .env; then
    sed -i "s/^DISPATCH_SECRET=.*/DISPATCH_SECRET=$DISPATCH/" .env
  else
    printf 'DISPATCH_SECRET=%s\n' "$DISPATCH" >> .env
  fi
  unset DISPATCH
fi
chmod 600 .env

OPERATOR_TOKEN="$(sed -n 's/^GARCAR_OPERATOR_TOKEN=//p' .env | head -n 1)"
if [[ -z "$OPERATOR_TOKEN" || "$OPERATOR_TOKEN" == *replace-with-* ]]; then
  echo "GARCAR_OPERATOR_TOKEN in .env is missing or is a placeholder. Replace it with a long random token." >&2
  exit 1
fi

export GARCAR_OPERATOR_TOKEN="$OPERATOR_TOKEN"
export GARCAR_DB_PATH="${GARCAR_DB_PATH:-$ROOT/data/garcar-control-plane.sqlite3}"
unset OPERATOR_TOKEN

echo "Starting locally on 127.0.0.1:${PORT:-8080}. Public hosting is not enabled."
echo "Open http://127.0.0.1:${PORT:-8080}/console"
echo "To copy your operator token, read the ignored .env file locally; never share it."
exec .venv/bin/uvicorn app:app --host 127.0.0.1 --port "${PORT:-8080}"
