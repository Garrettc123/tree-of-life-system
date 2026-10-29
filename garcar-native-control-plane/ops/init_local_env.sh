#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to generate local secrets." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  (umask 077; : > .env)
fi

ensure_secret() {
  local key="$1"
  local current
  current="$(sed -n "s/^$key=//p" .env | head -n 1)"
  if [[ -z "$current" || "$current" == *replace-with-* || ${#current} -lt 32 ]]; then
    local generated
    generated="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
    if grep -q "^$key=" .env; then
      sed -i "s|^$key=.*|$key=$generated|" .env
    else
      printf '%s=%s\n' "$key" "$generated" >> .env
    fi
    unset generated
  fi
}

ensure_secret GARCAR_OPERATOR_TOKEN
ensure_secret DISPATCH_SECRET
chmod 600 .env

echo "Local operator and dispatch secrets are ready in the ignored .env file."
echo "Secret values were not printed. Keep .env private and never commit it."
