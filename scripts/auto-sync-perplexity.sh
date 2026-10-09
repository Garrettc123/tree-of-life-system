#!/usr/bin/env bash
# auto-sync-perplexity.sh
# No simulation. Host apply or a hard stop.
# Never prompts. Never prints a raw key. Never prints a payment link.
# proof_hash comes only from the operator zeus.py run-once. This script does not mint one.
#
# Usage:
#   GARCAR_APPROVED=1 PERPLEXITY_API_KEY=... ./auto-sync-perplexity.sh --apply
set -euo pipefail

ROOT="${TREE_OF_LIFE_ROOT:-$HOME/tree-of-life-system}"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

mask() {
  local v="$1" n=${#v}
  if (( n < 8 )); then printf '***'; return; fi
  printf '%s***%s' "${v:0:3}" "${v: -4}"
}

refuse_contaminated() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -E -q '(^|[[:space:]])(curl|wget)[[:space:]]|\|[[:space:]]*(bash|sh)\b|https?://[^[:space:]]+[[:space:]]*\|' "$f"; then
    die "contaminated env ($f). Recreate from scripts/.env.example. Do not source it."
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "docker compose not installed"
  fi
}

upsert() {
  local key="$1" val="$2" file="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$val" '
    BEGIN { found=0 }
    index($0, k "=")==1 { print k "=" v; found=1; next }
    { print }
    END { if (!found) print k "=" v }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
  chmod 600 "$file"
}

if [[ "$APPLY" -ne 1 || "${GARCAR_APPROVED:-0}" != "1" ]]; then
  die "hold: pass --apply and GARCAR_APPROVED=1. No dry-run path."
fi
if [[ -z "${PERPLEXITY_API_KEY:-}" ]]; then
  die "hold: PERPLEXITY_API_KEY is not in the host environment. Do not paste it into chat."
fi
case "$PERPLEXITY_API_KEY" in
  *[$'\n\r']*|*'#'*) die "key contains illegal characters" ;;
esac

[[ -d "$ROOT" ]] || die "Tree of Life root missing: $ROOT"
cd "$ROOT"
refuse_contaminated "$ROOT/.env"
[[ -f .gitignore ]] || die ".gitignore missing. Refusing to write a secret."
grep -q -E '(^|/)\.env$|^\.env$' .gitignore || die ".env is not gitignored. Refusing to write a secret."

log "execute: key $(mask "$PERPLEXITY_API_KEY") model=${PERPLEXITY_MODEL:-sonar-pro}"

if ! compose ps --status running 2>/dev/null | grep -q .; then
  if [[ -x ./deploy.sh ]]; then
    ./deploy.sh
  elif [[ -x ./scripts/deploy.sh ]]; then
    ./scripts/deploy.sh
  else
    die "deploy.sh missing at repo root and scripts/"
  fi
  sleep 10
fi

touch "$ROOT/.env"
chmod 600 "$ROOT/.env"
upsert PERPLEXITY_API_KEY "$PERPLEXITY_API_KEY" "$ROOT/.env"
upsert PERPLEXITY_MODEL "${PERPLEXITY_MODEL:-sonar-pro}" "$ROOT/.env"
log "env updated mode 600. key not echoed."
compose restart
sleep 5

AI_URL="${AI_ENGINE_URL:-http://127.0.0.1:3002}"
ORCH_URL="${ORCH_URL:-http://127.0.0.1:3000}"
RESPONSE="$(curl -fsS --max-time 15 "$AI_URL/api/integrations/perplexity" || true)"
printf '%s' "$RESPONSE" | grep -q "connected" || {
  log "probe did not return connected"
  printf 'probe: %s\n' "$RESPONSE"
  exit 1
}

curl -fsS --max-time 20 -X POST "$ORCH_URL/api/orchestrator/start" \
  -H "Content-Type: application/json" \
  -d '{"modules":["perplexity_research","trend_monitoring","content_generation"],"schedule":"hourly","auto_heal":true}' \
  >/dev/null

mkdir -p "$ROOT/zeus_data/data_room/proofs"
printf '%s\n' "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"perplexity_sync_apply\",\"verb\":\"execute\",\"sku\":\"MARS-750\",\"estimated_value_usd\":750,\"cash\":false,\"proof_hash\":null}" \
  >> "$ROOT/zeus_data/data_room/proofs/revenue_events.jsonl"

log "apply finished. cash=false. proof_hash still null until operator zeus.py run-once."
log "not a live claim."
