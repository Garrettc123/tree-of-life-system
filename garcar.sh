#!/usr/bin/env bash
# garcar.sh — Garcar Enterprise CLI
# Install: cp garcar.sh $PREFIX/bin/garcar && chmod +x $PREFIX/bin/garcar
# Setup:   garcar setup

set -euo pipefail

CREDS="$HOME/.garcar/credentials"
GARCAR_DIR="$HOME/.garcar"

_load() {
  [[ -f "$CREDS" ]] && source "$CREDS"
  DISPATCH_URL="${DISPATCH_URL:-}"
  ATLAS_URL="${ATLAS_URL:-}"
  SUPABASE_URL="${SUPABASE_URL:-}"
  SUPABASE_KEY="${SUPABASE_KEY:-}"
  ATLAS_API_KEY="${ATLAS_API_KEY:-}"
}

_require() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    echo "Error: $var not set. Run: garcar setup"
    exit 1
  fi
}

cmd_setup() {
  mkdir -p "$GARCAR_DIR"
  echo "Garcar Enterprise Setup"
  echo "-----------------------"
  read -rp "DISPATCH_URL (garcar-dispatch Railway URL): " d_url
  read -rp "ATLAS_URL    (atlas-dispatch Railway URL):   " a_url
  read -rp "ATLAS_API_KEY:                               " a_key
  read -rp "SUPABASE_URL:                                " s_url
  read -rp "SUPABASE_SERVICE_KEY:                        " s_key
  cat > "$CREDS" <<EOF
export DISPATCH_URL="$d_url"
export ATLAS_URL="$a_url"
export ATLAS_API_KEY="$a_key"
export SUPABASE_URL="$s_url"
export SUPABASE_KEY="$s_key"
EOF
  chmod 600 "$CREDS"
  echo "Saved to $CREDS"
  echo "Add 'source $CREDS' to ~/.bashrc or ~/.zshrc"
}

cmd_status() {
  _load
  echo "=== Garcar Enterprise Status ==="

  if [[ -n "$DISPATCH_URL" ]]; then
    STATUS=$(curl -sf "$DISPATCH_URL/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "unreachable")
    echo "garcar-dispatch  $DISPATCH_URL  → $STATUS"
  else
    echo "garcar-dispatch  (not configured)"
  fi

  if [[ -n "$ATLAS_URL" ]]; then
    STATUS=$(curl -sf "$ATLAS_URL/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "unreachable")
    echo "atlas-dispatch   $ATLAS_URL  → $STATUS"
  else
    echo "atlas-dispatch   (not configured)"
  fi
}

cmd_events() {
  _load; _require DISPATCH_URL
  local limit="${1:-20}"
  curl -sf "$DISPATCH_URL/events?limit=$limit" \
    | python3 -c "
import sys, json, datetime
data = json.load(sys.stdin)
events = data.get('events', [])
print(f'{len(events)} events:')
for e in events:
    ts = e.get('created_at','')[:19]
    print(f\"  {ts}  {e.get('event_type','?'):<35} {e.get('source_system','?'):<25} {e.get('status','?')}\")
"
}

cmd_watch() {
  _load; _require DISPATCH_URL
  echo "Watching garcar-dispatch events (Ctrl+C to stop)..."
  local seen=""
  while true; do
    NEW=$(curl -sf "$DISPATCH_URL/events?limit=5" \
      | python3 -c "
import sys, json
data = json.load(sys.stdin)
for e in reversed(data.get('events', [])):
    print(e['id'][:8], e.get('created_at','')[:19], e.get('event_type','?'), e.get('source_system','?'), e.get('status','?'))
" 2>/dev/null || echo "")
    while IFS= read -r line; do
      id="${line%% *}"
      if [[ -n "$line" && "$seen" != *"$id"* ]]; then
        echo "$line"
        seen="$seen $id"
      fi
    done <<< "$NEW"
    sleep 5
  done
}

cmd_revenue() {
  _load; _require SUPABASE_URL; _require SUPABASE_KEY
  curl -sf "$SUPABASE_URL/rest/v1/revenue_ledger?select=stripe_object_id,amount_cents,currency,status,created_at&order=created_at.desc&limit=10" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    | python3 -c "
import sys, json
rows = json.load(sys.stdin)
total = sum(r.get('amount_cents',0) for r in rows if r.get('status') == 'paid')
print(f'Last 10 revenue events (total: \${total/100:.2f}):')
for r in rows:
    amt = r.get('amount_cents',0) / 100
    print(f\"  {r.get('created_at','')[:10]}  \${amt:>8.2f} {r.get('currency','usd').upper()}  {r.get('status','?')}\")
"
}

cmd_dispatch() {
  _load; _require DISPATCH_URL
  local event_type="${1:-test.ping}"
  local payload="${2:-{\"message\":\"manual test from garcar CLI\"}}"
  echo "Dispatching $event_type..."
  curl -sf -X POST "$DISPATCH_URL/dispatch" \
    -H "Content-Type: application/json" \
    -d "{\"event_type\":\"$event_type\",\"source_system\":\"garcar-cli\",\"payload\":$payload}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('Accepted:', d.get('event_id','?'))"
}

cmd_treasury() {
  _load; _require SUPABASE_URL; _require SUPABASE_KEY
  curl -sf "$SUPABASE_URL/rest/v1/treasury_positions?select=account_name,balance_cents,available_cents,currency,last_synced_at" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    | python3 -c "
import sys, json
rows = json.load(sys.stdin)
print('Treasury positions:')
for r in rows:
    bal = r.get('balance_cents',0) / 100
    avail = r.get('available_cents',0) / 100
    print(f\"  {r.get('account_name','?'):<30} balance=\${bal:>10.2f}  available=\${avail:>10.2f}  {r.get('currency','usd').upper()}\")
"
}

cmd_leads() {
  _load; _require SUPABASE_URL; _require SUPABASE_KEY
  local status="${1:-new}"
  curl -sf "$SUPABASE_URL/rest/v1/leads?select=email,first_name,last_name,company,ai_score,status&status=eq.$status&order=ai_score.desc&limit=20" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    | python3 -c "
import sys, json
rows = json.load(sys.stdin)
print(f'Leads (status=$status):')
for r in rows:
    name = f\"{r.get('first_name','')} {r.get('last_name','')}\".strip() or '?'
    score = r.get('ai_score', 0)
    print(f\"  {score:.2f}  {name:<25}  {r.get('company','?'):<25}  {r.get('email','')}\")
"
}

usage() {
  cat <<EOF
Garcar Enterprise CLI

Commands:
  garcar setup              Interactive credential setup
  garcar status             Health check all services
  garcar events [N]         Show last N dispatch events (default 20)
  garcar watch              Stream new events live (polls every 5s)
  garcar revenue            Show last 10 revenue ledger entries
  garcar treasury           Show treasury position balances
  garcar leads [status]     Show leads by status (default: new)
  garcar dispatch <type>    Fire a manual event to garcar-dispatch
EOF
}

CMD="${1:-help}"
shift || true

case "$CMD" in
  setup)    cmd_setup ;;
  status)   cmd_status ;;
  events)   cmd_events "$@" ;;
  watch)    cmd_watch ;;
  revenue)  cmd_revenue ;;
  treasury) cmd_treasury ;;
  leads)    cmd_leads "$@" ;;
  dispatch) cmd_dispatch "$@" ;;
  *)        usage ;;
esac
