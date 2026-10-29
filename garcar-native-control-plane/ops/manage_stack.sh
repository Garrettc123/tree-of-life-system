#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Garcar local stack manager (Docker Compose only)

Usage:
  bash ops/manage_stack.sh validate
  bash ops/manage_stack.sh status
  bash ops/manage_stack.sh start
  bash ops/manage_stack.sh stop
  bash ops/manage_stack.sh restart
  bash ops/manage_stack.sh logs [control-plane|orchestrator]
  bash ops/manage_stack.sh backup

Mutations require typing an exact confirmation phrase. No public deployment is performed.
EOF
}

need_compose() {
  command -v docker >/dev/null 2>&1 || {
    echo "Docker is required for this command." >&2
    exit 1
  }
  docker compose version >/dev/null 2>&1 || {
    echo "Docker Compose plugin is required." >&2
    exit 1
  }
}

confirm_action() {
  local action="$1"
  local expected="CONFIRM GARCAR LOCAL $action"
  local entered=""
  if [[ ! -t 0 ]]; then
    echo "Refusing '$action': run this command interactively and type: $expected" >&2
    exit 2
  fi
  read -r -p "Type '$expected' to continue: " entered
  if [[ "$entered" != "$expected" ]]; then
    echo "Confirmation did not match; no action taken." >&2
    exit 2
  fi
}

cmd="${1:-}"
case "$cmd" in
  validate)
    need_compose
    if [[ ! -f .env ]]; then
      bash ops/init_local_env.sh
    fi
    docker compose config -q
    echo "PASS: Compose configuration is valid. No containers were started."
    ;;
  status)
    need_compose
    docker compose ps --all
    ;;
  start)
    need_compose
    confirm_action START
    docker compose up --build -d
    docker compose ps
    ;;
  stop)
    need_compose
    confirm_action STOP
    docker compose stop
    docker compose ps --all
    ;;
  restart)
    need_compose
    confirm_action RESTART
    docker compose restart
    docker compose ps
    ;;
  logs)
    need_compose
    service="${2:-}"
    case "$service" in
      "" ) docker compose logs --tail=100 ;;
      control-plane|orchestrator) docker compose logs --tail=100 "$service" ;;
      * ) echo "Unknown service '$service'. Use control-plane or orchestrator." >&2; exit 2 ;;
    esac
    ;;
  backup)
    need_compose
    mkdir -p backups
    chmod 700 backups
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    cp_id="$(docker compose ps -q control-plane)"
    orch_id="$(docker compose ps -q orchestrator)"
    if [[ -z "$cp_id" || -z "$orch_id" ]]; then
      echo "Both stack services must be running before backing up." >&2
      exit 1
    fi
    cp_name="garcar-control-plane-$stamp.sqlite3"
    orch_name="garcar-events-$stamp.sqlite3"
    docker compose exec -T control-plane python ops/backup_db.py --output "/app/backups/$cp_name"
    docker cp "$cp_id:/app/backups/$cp_name" "backups/$cp_name"
    docker compose exec -T orchestrator python backup_db.py --output "/app/backups/$orch_name"
    docker cp "$orch_id:/app/backups/$orch_name" "backups/$orch_name"
    chmod 600 "backups/$cp_name" "backups/$orch_name"
    echo "Backups copied to $ROOT/backups/ after SQLite integrity checks."
    ;;
  help|-h|--help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
