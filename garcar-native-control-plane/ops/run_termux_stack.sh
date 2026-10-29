#!/usr/bin/env bash
set -euo pipefail

CONTROL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$CONTROL_DIR/.." && pwd)"
ORCH_DIR="$REPO_ROOT/orchestrator"
CONTROL_VENV="$CONTROL_DIR/.venv"
ORCH_VENV="$ORCH_DIR/.venv"
RUNTIME_DIR="${GARCAR_RUNTIME_DIR:-$CONTROL_DIR/runtime}"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
CONTROL_PORT="${GARCAR_CONTROL_PORT:-8080}"
ORCH_PORT="${GARCAR_ORCHESTRATOR_PORT:-8001}"
CONTROL_DB="$CONTROL_DIR/data/garcar-control-plane.sqlite3"
ORCH_DB="$ORCH_DIR/data/garcar-events.sqlite3"
ENV_FILE="$CONTROL_DIR/.env"

usage() {
  cat <<'EOF'
Garcar local stack for Termux/Linux (no Docker required)

Usage:
  bash ops/run_termux_stack.sh init
  bash ops/run_termux_stack.sh install
  bash ops/run_termux_stack.sh test
  bash ops/run_termux_stack.sh start
  bash ops/run_termux_stack.sh status
  bash ops/run_termux_stack.sh logs [control-plane|orchestrator]
  bash ops/run_termux_stack.sh backup
  bash ops/run_termux_stack.sh stop

This runs both APIs on 127.0.0.1 only. It does not deploy publicly.
Start and stop require an exact confirmation phrase.
EOF
}

need_python() {
  command -v python3 >/dev/null 2>&1 || {
    echo "Python 3 is required. In Termux, run: pkg install python git" >&2
    exit 1
  }
  python3 - <<'PY'
import sys
if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11 or newer is required.")
PY
}

validate_port() {
  local name="$1" value="$2"
  if [[ ! "$value" =~ ^[0-9]{1,5}$ ]] || (( value < 1024 || value > 65535 )); then
    echo "$name must be an integer between 1024 and 65535." >&2
    exit 2
  fi
}

load_local_env() {
  [[ -f "$ENV_FILE" ]] || bash "$CONTROL_DIR/ops/init_local_env.sh"
  # Parse only known variables; do not source/evaluate .env as shell code.
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      GARCAR_OPERATOR_TOKEN|DISPATCH_SECRET|SUPABASE_URL|SUPABASE_SERVICE_KEY)
        export "$key=$value"
        ;;
    esac
  done < "$ENV_FILE"

  local operator_token="${GARCAR_OPERATOR_TOKEN:-}" dispatch_secret="${DISPATCH_SECRET:-}"
  if (( ${#operator_token} < 32 )); then
    echo "GARCAR_OPERATOR_TOKEN is missing or shorter than 32 characters." >&2
    exit 1
  fi
  if (( ${#dispatch_secret} < 32 )); then
    echo "DISPATCH_SECRET is missing or shorter than 32 characters." >&2
    exit 1
  fi
}

ensure_runtime_dirs() {
  mkdir -p "$LOG_DIR" "$PID_DIR" "$CONTROL_DIR/data" "$ORCH_DIR/data" "$CONTROL_DIR/backups" "$ORCH_DIR/backups"
  chmod 700 "$RUNTIME_DIR" "$LOG_DIR" "$PID_DIR" "$CONTROL_DIR/data" "$ORCH_DIR/data" "$CONTROL_DIR/backups" "$ORCH_DIR/backups"
}

need_nohup() {
  command -v nohup >/dev/null 2>&1 || {
    echo "nohup is required for background runtime. In Termux, run: pkg install coreutils" >&2
    exit 1
  }
}

install_runtime() {
  need_python
  need_nohup
  load_local_env
  ensure_runtime_dirs

  if [[ ! -x "$CONTROL_VENV/bin/python" ]]; then
    python3 -m venv "$CONTROL_VENV"
  fi
  if [[ ! -x "$ORCH_VENV/bin/python" ]]; then
    python3 -m venv "$ORCH_VENV"
  fi

  local is_termux="false"
  if [[ -n "${TERMUX_VERSION:-}" || -d /data/data/com.termux ]]; then
    is_termux="true"
    local py_minor
    py_minor="$("$CONTROL_VENV/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    if [[ "$py_minor" != "3.14" ]]; then
      echo "This Termux bootstrap expects Python 3.14 so it can use the matching Android pydantic-core wheel. Run 'pkg update && pkg upgrade python', then rerun install." >&2
      exit 1
    fi
    echo "Installing the Termux Python 3.14 pydantic-core wheel..."
    "$CONTROL_VENV/bin/python" -m pip install --disable-pip-version-check --no-deps --only-binary=:all: --index-url https://eutalix.github.io/android-pydantic-core/ pydantic-core==2.50.0
    "$ORCH_VENV/bin/python" -m pip install --disable-pip-version-check --no-deps --only-binary=:all: --index-url https://eutalix.github.io/android-pydantic-core/ pydantic-core==2.50.0
  fi

  echo "Installing control-plane packages..."
  "$CONTROL_VENV/bin/python" -m pip install --disable-pip-version-check -r "$CONTROL_DIR/requirements.txt"
  "$CONTROL_VENV/bin/python" -m pip install --disable-pip-version-check pytest==9.2.0

  echo "Installing event-orchestrator packages..."
  "$ORCH_VENV/bin/python" -m pip install --disable-pip-version-check -r "$ORCH_DIR/requirements.txt"
  "$ORCH_VENV/bin/python" -m pip install --disable-pip-version-check pytest==9.2.0

  "$CONTROL_VENV/bin/python" -c 'import fastapi, httpx, pydantic, pydantic_core, uvicorn; print("Control dependencies: OK", fastapi.__version__, pydantic.__version__, pydantic_core.__version__)'
  "$ORCH_VENV/bin/python" -c 'import fastapi, httpx, pydantic, pydantic_core, uvicorn; print("Orchestrator dependencies: OK", fastapi.__version__, pydantic.__version__, pydantic_core.__version__)'
  echo "PASS: Python environments prepared locally. No server was started."
}

pid_is_expected() {
  local pid="$1" pattern="$2" cmdline
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  [[ "$cmdline" == *"$pattern"* ]]
}

service_pid() {
  local service="$1" pidfile pattern pid
  pidfile="$PID_DIR/$service.pid"
  [[ -f "$pidfile" ]] || return 1
  read -r pid < "$pidfile" || return 1
  case "$service" in
    control-plane) pattern="app:app" ;;
    orchestrator) pattern="main:app" ;;
    *) return 1 ;;
  esac
  pid_is_expected "$pid" "$pattern" || return 1
  printf '%s\n' "$pid"
}

health_ok() {
  local url="$1" expected_service="$2"
  python3 - "$url" "$expected_service" <<'PY'
import json
import sys
import urllib.request
try:
    with urllib.request.urlopen(sys.argv[1], timeout=2) as response:
        data = json.loads(response.read().decode("utf-8"))
    raise SystemExit(0 if data.get("status") == "ok" and data.get("service") == sys.argv[2] else 1)
except Exception:
    raise SystemExit(1)
PY
}

wait_for_health() {
  local service="$1" url="$2" expected="$3" i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    health_ok "$url" "$expected" && return 0
    sleep 1
  done
  echo "FAIL: $service did not pass its liveness check. Recent log:" >&2
  tail -n 80 "$LOG_DIR/$service.log" >&2 || true
  return 1
}

start_service() {
  local service="$1" pidfile url expected
  pidfile="$PID_DIR/$service.pid"
  if service_pid "$service" >/dev/null 2>&1; then
    echo "$service already appears to be running."
    return 0
  fi
  case "$service" in
    control-plane)
      url="http://127.0.0.1:$CONTROL_PORT/health"
      expected="garcar-native-control-plane"
      ;;
    orchestrator)
      url="http://127.0.0.1:$ORCH_PORT/health"
      expected="garcar-dispatch"
      ;;
    *)
      echo "Unknown service: $service" >&2
      return 2
      ;;
  esac
  if health_ok "$url" "$expected"; then
    echo "$service already answers on its configured port but is not managed by this script; refusing to start a duplicate." >&2
    return 2
  fi
  rm -f "$pidfile"

  if [[ "$service" == "orchestrator" ]]; then
    (
      cd "$ORCH_DIR"
      export PORT="$ORCH_PORT"
      export DISPATCH_SECRET GARCAR_OPERATOR_TOKEN
      export GARCAR_EVENT_DB_PATH="$ORCH_DB"
      export GARCAR_ENABLE_EXTERNAL_HANDLERS=false
      exec nohup "$ORCH_VENV/bin/uvicorn" main:app --host 127.0.0.1 --port "$ORCH_PORT" --log-level info
    ) >> "$LOG_DIR/orchestrator.log" 2>&1 < /dev/null &
  else
    (
      cd "$CONTROL_DIR"
      export GARCAR_OPERATOR_TOKEN
      export GARCAR_DB_PATH="$CONTROL_DB"
      export GARCAR_ORCHESTRATOR_HEALTH_URL="http://127.0.0.1:$ORCH_PORT/health"
      exec nohup "$CONTROL_VENV/bin/uvicorn" app:app --host 127.0.0.1 --port "$CONTROL_PORT" --log-level info
    ) >> "$LOG_DIR/control-plane.log" 2>&1 < /dev/null &
  fi
  local pid=$!
  printf '%s\n' "$pid" > "$pidfile"
  chmod 600 "$pidfile"
}

stop_one() {
  local service="$1" pidfile pid i pattern
  pidfile="$PID_DIR/$service.pid"
  [[ -f "$pidfile" ]] || return 0
  read -r pid < "$pidfile" || { rm -f "$pidfile"; return 0; }
  case "$service" in
    control-plane) pattern="app:app" ;;
    orchestrator) pattern="main:app" ;;
    *) return 1 ;;
  esac
  if ! pid_is_expected "$pid" "$pattern"; then
    rm -f "$pidfile"
    return 0
  fi
  kill -TERM "$pid" 2>/dev/null || true
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pidfile"
      echo "Stopped $service."
      return 0
    fi
    sleep 0.5
  done
  echo "WARNING: $service has not exited yet; PID $pid remains recorded." >&2
  return 1
}

confirm_action() {
  local action="$1" expected="CONFIRM GARCAR LOCAL $1" entered
  if [[ ! -t 0 ]]; then
    echo "Refusing $action in non-interactive mode. Run interactively and type: $expected" >&2
    exit 2
  fi
  read -r -p "Type '$expected' to continue: " entered
  [[ "$entered" == "$expected" ]] || {
    echo "Confirmation did not match; no action taken." >&2
    exit 2
  }
}

show_status() {
  local control="DOWN" orchestrator="DOWN"
  health_ok "http://127.0.0.1:$CONTROL_PORT/health" "garcar-native-control-plane" && control="UP"
  health_ok "http://127.0.0.1:$ORCH_PORT/health" "garcar-dispatch" && orchestrator="UP"
  printf 'Control plane: %s (127.0.0.1:%s)\n' "$control" "$CONTROL_PORT"
  printf 'Orchestrator:  %s (127.0.0.1:%s)\n' "$orchestrator" "$ORCH_PORT"
  if [[ "$control" == "UP" ]]; then
    python3 - "$CONTROL_PORT" "$GARCAR_OPERATOR_TOKEN" <<'PY'
import json
import sys
import urllib.request
url = f"http://127.0.0.1:{sys.argv[1]}/api/status"
request = urllib.request.Request(url, headers={"X-Operator-Token": sys.argv[2]})
try:
    with urllib.request.urlopen(request, timeout=3) as response:
        data = json.loads(response.read().decode("utf-8"))
    print("Control database:", data.get("database", "unknown"))
except Exception as exc:
    print("Control database: check failed (" + type(exc).__name__ + ")")
PY
  fi
}

cmd="${1:-help}"
case "$cmd" in
  init)
    need_python
    bash "$CONTROL_DIR/ops/init_local_env.sh"
    ;;
  install)
    install_runtime
    ;;
  test)
    [[ -x "$CONTROL_VENV/bin/python" && -x "$ORCH_VENV/bin/python" ]] || {
      echo "Install environments first: bash ops/run_termux_stack.sh install" >&2
      exit 1
    }
    "$CONTROL_VENV/bin/python" -m pytest -q "$CONTROL_DIR/test_app.py"
    (cd "$ORCH_DIR" && "$ORCH_VENV/bin/python" -m pytest -q test_main.py)
    ;;
  start)
    need_python
    need_nohup
    validate_port GARCAR_CONTROL_PORT "$CONTROL_PORT"
    validate_port GARCAR_ORCHESTRATOR_PORT "$ORCH_PORT"
    if [[ "$ORCH_PORT" != "8001" && "$ORCH_PORT" != "8080" ]]; then
      echo "GARCAR_ORCHESTRATOR_PORT must be 8001 or 8080 so the control plane can safely verify it." >&2
      exit 2
    fi
    if [[ "$CONTROL_PORT" == "$ORCH_PORT" ]]; then
      echo "Control-plane and orchestrator ports must differ." >&2
      exit 2
    fi
    load_local_env
    ensure_runtime_dirs
    [[ -x "$CONTROL_VENV/bin/uvicorn" && -x "$ORCH_VENV/bin/uvicorn" ]] || {
      echo "Run 'bash ops/run_termux_stack.sh install' first." >&2
      exit 1
    }
    confirm_action START
    start_service orchestrator
    if ! wait_for_health orchestrator "http://127.0.0.1:$ORCH_PORT/health" "garcar-dispatch"; then
      stop_one orchestrator || true
      exit 1
    fi
    if ! start_service control-plane; then
      stop_one orchestrator || true
      exit 1
    fi
    if ! wait_for_health control-plane "http://127.0.0.1:$CONTROL_PORT/health" "garcar-native-control-plane"; then
      stop_one control-plane || true
      stop_one orchestrator || true
      exit 1
    fi
    show_status
    echo "Console: http://127.0.0.1:$CONTROL_PORT/console"
    echo "Both services listen on loopback only; no public deployment was created."
    ;;
  status)
    load_local_env
    show_status
    ;;
  logs)
    case "${2:-}" in
      control-plane) tail -n 100 "$LOG_DIR/control-plane.log" ;;
      orchestrator) tail -n 100 "$LOG_DIR/orchestrator.log" ;;
      "" ) tail -n 100 "$LOG_DIR/control-plane.log" "$LOG_DIR/orchestrator.log" ;;
      *) echo "Use logs control-plane or logs orchestrator." >&2; exit 2 ;;
    esac
    ;;
  backup)
    load_local_env
    ensure_runtime_dirs
    [[ -x "$CONTROL_VENV/bin/python" && -x "$ORCH_VENV/bin/python" ]] || {
      echo "Install environments first: bash ops/run_termux_stack.sh install" >&2
      exit 1
    }
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    GARCAR_DB_PATH="$CONTROL_DB" "$CONTROL_VENV/bin/python" "$CONTROL_DIR/ops/backup_db.py" --output "$CONTROL_DIR/backups/garcar-control-plane-$stamp.sqlite3"
    GARCAR_EVENT_DB_PATH="$ORCH_DB" "$ORCH_VENV/bin/python" "$ORCH_DIR/backup_db.py" --output "$CONTROL_DIR/backups/garcar-events-$stamp.sqlite3"
    chmod 600 "$CONTROL_DIR/backups/garcar-control-plane-$stamp.sqlite3" "$CONTROL_DIR/backups/garcar-events-$stamp.sqlite3"
    ;;
  stop)
    confirm_action STOP
    stop_one control-plane
    stop_one orchestrator
    ;;
  help|-h|--help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
