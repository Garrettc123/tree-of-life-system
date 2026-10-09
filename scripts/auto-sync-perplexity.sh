#!/usr/bin/env bash
# auto-sync-perplexity.sh
# Host-keyed Perplexity sync. Never prompts. Never prints the key.
# Refuses contaminated env files (curl/wget/| bash).
# Usage:
#   PERPLEXITY_API_KEY=... ./auto-sync-perplexity.sh            # dry-run
#   PERPLEXITY_API_KEY=... ./auto-sync-perplexity.sh --apply    # write + restart
set -euo pipefail

ROOT="${TREE_OF_LIFE_ROOT:-$HOME/tree-of-life-system}"
APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

mask() {
  local v="$1"
  local n=${#v}
  if (( n < 8 )); then
    printf '***'
    return
  fi
  printf '%s***%s' "${v:0:3}" "${v: -4}"
}

refuse_contaminated() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  local first
  first="$(head -n 1 "$f" || true)"
  case "$first" in
    curl*|wget*|*\|*bash*|*\|*sh*)
      die "contaminated env file ($f starts with a fetch/pipe). Recreate from .env.example. Do not source it."
      ;;
  esac
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

log "Perplexity auto-sync (mode=$([[ $APPLY -eq 1 ]] && echo apply || echo dry-run))"

[[ -d "$ROOT" ]] || die "Tree of Life root missing: $ROOT"
cd "$ROOT"
refuse_contaminated "$ROOT/.env"

if [[ -z "${PERPLEXITY_API_KEY:-}" ]]; then
  die "PERPLEXITY_API_KEY is not in the host environment. Set it in the host secret store or Termux export. Do not paste it into chat."
fi

case "$PERPLEXITY_API_KEY" in
  *[$'\n\r']*|*'#'*) die "key contains illegal characters" ;;
esac

log "key present: $(mask "$PERPLEXITY_API_KEY") model=${PERPLEXITY_MODEL:-sonar-pro}"

if ! compose ps --status running 2>/dev/null | grep -q .; then
  log "stack not running"
  if [[ $APPLY -eq 1 ]]; then
    if [[ -x ./deploy.sh ]]; then
      ./deploy.sh
    elif [[ -x ./scripts/deploy.sh ]]; then
      ./scripts/deploy.sh
    else
      die "deploy.sh missing at repo root and scripts/"
    fi
    sleep 10
  else
    log "dry-run: would run ./deploy.sh"
  fi
fi

ENV_FILE="$ROOT/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

upsert() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k {$0=k "=" v} {print}' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

if [[ $APPLY -eq 1 ]]; then
  upsert PERPLEXITY_API_KEY "$PERPLEXITY_API_KEY"
  upsert PERPLEXITY_MODEL "${PERPLEXITY_MODEL:-sonar-pro}"
  log "env updated (mode 600). key not echoed."
  log "restarting compose so the engine reloads env"
  compose restart
  sleep 5
else
  log "dry-run: would upsert PERPLEXITY_API_KEY and PERPLEXITY_MODEL, then compose restart"
fi

AI_URL="${AI_ENGINE_URL:-http://127.0.0.1:3002}"
ORCH_URL="${ORCH_URL:-http://127.0.0.1:3000}"

if [[ $APPLY -eq 1 ]]; then
  RESPONSE="$(curl -fsS --max-time 15 "$AI_URL/api/integrations/perplexity" || true)"
  if printf '%s' "$RESPONSE" | grep -q "connected"; then
    log "Perplexity integration ACTIVE"
  else
    log "integration probe did not return connected"
    printf 'probe: %s\n' "$RESPONSE"
    exit 1
  fi

  curl -fsS --max-time 20 -X POST "$ORCH_URL/api/orchestrator/start" \
    -H "Content-Type: application/json" \
    -d '{"modules":["perplexity_research","trend_monitoring","content_generation"],"schedule":"hourly","auto_heal":true}' \
    >/dev/null
  log "orchestrator start sent"
else
  log "dry-run: would GET $AI_URL/api/integrations/perplexity"
  log "dry-run: would POST $ORCH_URL/api/orchestrator/start modules=perplexity_research,trend_monitoring,content_generation schedule=hourly"
fi

mkdir -p "$ROOT/zeus_data/data_room/proofs"
printf '%s\n' "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"perplexity_sync_prepared\",\"mode\":\"$([[ $APPLY -eq 1 ]] && echo apply || echo dry-run)\",\"sku\":\"MARS-750\",\"cash\":false}" \
  >> "$ROOT/zeus_data/data_room/proofs/revenue_events.jsonl"

log "done. cash=false until Stripe paid=true. attach MARS-750 after proof."
log "dashboards: http://127.0.0.1:80  http://127.0.0.1:3000  http://127.0.0.1:3002"
