#!/bin/bash

################################################################################
# ITERATE & DEPLOY - Agent Bootstrap Cycle with Revenue Activation
# Automates: agents/bootstrap.js → startup.js → grpc-gateway.js → revenue
# Usage: ./ITERATE_AND_DEPLOY.sh [iterations] [environment]
################################################################################

set -o pipefail

# Configuration
ITERATIONS=${1:-5}
ENVIRONMENT=${2:-"production"}
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="${DEPLOY_DIR}/agents"
LOG_DIR="${DEPLOY_DIR}/iteration-logs"
ITERATION_LOG="${LOG_DIR}/iteration-$(date +%Y%m%d-%H%M%S).log"
REVENUE_LOG="${LOG_DIR}/revenue-$(date +%Y%m%d-%H%M%S).log"
PID_FILE="${LOG_DIR}/pids-$(date +%Y%m%d-%H%M%S).txt"

mkdir -p "$LOG_DIR"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
ITER_COUNT=0
SUCCESS_COUNT=0
FAIL_COUNT=0
START_TIME=$(date +%s%N)

# Helper functions
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$ITERATION_LOG"; }
log_success() { echo -e "${GREEN}✅ [$(date +'%H:%M:%S')] $1${NC}" | tee -a "$ITERATION_LOG"; }
log_error() { echo -e "${RED}❌ [$(date +'%H:%M:%S')] $1${NC}" | tee -a "$ITERATION_LOG"; }
log_warn() { echo -e "${YELLOW}⚠️  [$(date +'%H:%M:%S')] $1${NC}" | tee -a "$ITERATION_LOG"; }
revenue_log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$REVENUE_LOG"; }
bar() { echo -e "${CYAN}════════════════════════════════════════════════════════${NC}" | tee -a "$ITERATION_LOG"; }

################################################################################
# STAGE 1: BOOTSTRAP AGENTS
################################################################################

stage_bootstrap() {
  local iter=$1
  
  log "🔀 [ITERATION $iter] Stage 1: Bootstrapping agents..."
  
  cd "$AGENTS_DIR" || return 1
  
  if [ ! -f "bootstrap.js" ]; then
    log_error "bootstrap.js not found in $AGENTS_DIR"
    return 1
  fi
  
  # Run bootstrap with timeout
  if timeout 60 node bootstrap.js \
     --iteration "$iter" \
     --environment "$ENVIRONMENT" \
     --max-iterations "$ITERATIONS" 2>&1 | tee -a "$ITERATION_LOG"; then
    log_success "Bootstrap completed"
    return 0
  else
    log_error "Bootstrap failed or timed out"
    return 1
  fi
}

################################################################################
# STAGE 2: STARTUP INITIALIZATION
################################################################################

stage_startup() {
  local iter=$1
  
  log "🚀 [ITERATION $iter] Stage 2: Initializing startup sequence..."
  
  cd "$AGENTS_DIR" || return 1
  
  if [ ! -f "startup.js" ]; then
    log_error "startup.js not found in $AGENTS_DIR"
    return 1
  fi
  
  # Run startup
  if timeout 90 node startup.js \
     --iteration "$iter" \
     --environment "$ENVIRONMENT" \
     --bootstrap-complete true 2>&1 | tee -a "$ITERATION_LOG"; then
    log_success "Startup initialization completed"
    return 0
  else
    log_error "Startup initialization failed"
    return 1
  fi
}

################################################################################
# STAGE 3: gRPC GATEWAY ACTIVATION
################################################################################

stage_grpc_gateway() {
  local iter=$1
  local grpc_pid
  
  log "🏖️ [ITERATION $iter] Stage 3: Starting gRPC gateway..."
  
  cd "$AGENTS_DIR" || return 1
  
  if [ ! -f "grpc-gateway.js" ]; then
    log_error "grpc-gateway.js not found in $AGENTS_DIR"
    return 1
  fi
  
  # Start gRPC gateway in background
  node grpc-gateway.js \
    --iteration "$iter" \
    --environment "$ENVIRONMENT" \
    --port 50051 \
    --max-streams 100 2>&1 | tee -a "$ITERATION_LOG" &
  
  grpc_pid=$!
  echo "$grpc_pid" >> "$PID_FILE"
  
  log "gRPC gateway started with PID $grpc_pid"
  
  # Wait for gateway to be ready
  local timeout=30
  local elapsed=0
  
  while [ $elapsed -lt $timeout ]; do
    if nc -z localhost 50051 2>/dev/null; then
      log_success "gRPC gateway is ready on port 50051"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  log_error "gRPC gateway failed to start within ${timeout}s"
  kill $grpc_pid 2>/dev/null || true
  return 1
}

################################################################################
# STAGE 4: EVENT BUS CONNECTION
################################################################################

stage_event_bus() {
  local iter=$1
  
  log "📨 [ITERATION $iter] Stage 4: Connecting to event bus (Kafka)..."
  
  cd "$AGENTS_DIR" || return 1
  
  # Create Kafka topics if needed
  if command -v docker &> /dev/null; then
    docker exec kafka-1 kafka-topics \
      --bootstrap-server localhost:9092 \
      --create \
      --if-not-exists \
      --topic iteration-$iter \
      --partitions 4 \
      --replication-factor 1 2>&1 | tee -a "$ITERATION_LOG"
  fi
  
  # Verify connection via Node script
  if node -e "
    const { Kafka } = require('kafkajs');
    const kafka = new Kafka({
      clientId: 'tree-of-life-iter-$iter',
      brokers: ['kafka-broker-1:29092']
    });
    kafka.admin().connect()
      .then(() => {
        console.log('✓ Kafka connected');
        process.exit(0);
      })
      .catch(err => {
        console.error('✗ Kafka connection failed', err.message);
        process.exit(1);
      });
  " 2>&1 | tee -a "$ITERATION_LOG"; then
    log_success "Event bus connected"
    return 0
  else
    log_warn "Event bus connection pending"
    return 0  # Don't fail deployment for this
  fi
}

################################################################################
# STAGE 5: HEALTH VERIFICATION
################################################################################

stage_health_check() {
  local iter=$1
  
  log "💏 [ITERATION $iter] Stage 5: Running health checks..."
  
  # Check HTTP endpoint
  if curl -s http://localhost:3000/health 2>/dev/null | grep -q 'ok\|healthy'; then
    log_success "HTTP health check passed"
  else
    log_warn "HTTP health check not yet responding"
  fi
  
  # Check gRPC
  if nc -z localhost 50051 2>/dev/null; then
    log_success "gRPC endpoint is healthy"
  else
    log_error "gRPC endpoint not responding"
    return 1
  fi
  
  # Check Kafka
  if docker ps --filter "name=kafka" --quiet &>/dev/null; then
    log_success "Kafka broker is running"
  else
    log_warn "Kafka broker status unknown"
  fi
  
  return 0
}

################################################################################
# STAGE 6: REVENUE ACTIVATION
################################################################################

stage_revenue_activation() {
  local iter=$1
  
  log "💰 [ITERATION $iter] Stage 6: Activating revenue system..."
  
  revenue_log "ITERATION_${iter}_START=$(date +%s)"
  revenue_log "ITERATION=${iter}"
  revenue_log "ENVIRONMENT=${ENVIRONMENT}"
  
  # Wait for app to be ready
  local timeout=30
  local elapsed=0
  
  while [ $elapsed -lt $timeout ]; do
    if curl -s http://localhost:3000/api/revenue/status 2>/dev/null | grep -q 'active\|enabled'; then
      log_success "Revenue system already active"
      revenue_log "REVENUE_STATUS=already_active"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  # Try to activate
  if curl -s -X POST http://localhost:3000/api/revenue/start \
       -H "Content-Type: application/json" \
       -d "{
         \"mode\": \"auto\",
         \"environment\": \"${ENVIRONMENT}\",
         \"iteration\": ${iter},
         \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
       }" 2>/dev/null | grep -q 'success\|activated'; then
    log_success "Revenue system activated"
    revenue_log "REVENUE_STATUS=activated"
    return 0
  else
    log_warn "Revenue system activation needs manual verification"
    revenue_log "REVENUE_STATUS=pending_verification"
    return 0
  fi
}

################################################################################
# STAGE 7: METRICS & TELEMETRY
################################################################################

stage_metrics() {
  local iter=$1
  
  log "📊 [ITERATION $iter] Stage 7: Collecting metrics..."
  
  # Memory usage
  local mem_usage=$(free | awk 'NR==2{print int($3/$2 * 100)}')
  log "Memory usage: ${mem_usage}%"
  revenue_log "MEMORY_USAGE=${mem_usage}%"
  
  # CPU load
  local cpu_load=$(uptime | awk -F'load average:' '{print $2}')
  log "CPU load: $cpu_load"
  revenue_log "CPU_LOAD=$cpu_load"
  
  # Docker stats
  if command -v docker &> /dev/null; then
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | tee -a "$ITERATION_LOG"
  fi
  
  # Iteration timing
  local current_time=$(date +%s%N)
  local iter_duration=$(( (current_time - ITER_START_TIME) / 1000000 ))  # Convert to ms
  log "Iteration duration: ${iter_duration}ms"
  revenue_log "ITERATION_${iter}_DURATION_MS=${iter_duration}"
  
  return 0
}

################################################################################
# FULL ITERATION CYCLE
################################################################################

run_iteration() {
  local iter=$1
  ITER_START_TIME=$(date +%s%N)
  
  bar
  log "🔄 ITERATION $iter / $ITERATIONS"
  bar
  
  # Run all stages
  stage_bootstrap "$iter" || { FAIL_COUNT=$((FAIL_COUNT + 1)); return 1; }
  sleep 2
  
  stage_startup "$iter" || { FAIL_COUNT=$((FAIL_COUNT + 1)); return 1; }
  sleep 2
  
  stage_grpc_gateway "$iter" || { FAIL_COUNT=$((FAIL_COUNT + 1)); return 1; }
  sleep 3
  
  stage_event_bus "$iter" || true  # Don't fail on this
  sleep 2
  
  stage_health_check "$iter" || { FAIL_COUNT=$((FAIL_COUNT + 1)); return 1; }
  sleep 2
  
  stage_revenue_activation "$iter" || true  # Don't fail on this
  sleep 2
  
  stage_metrics "$iter"
  
  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  log_success "Iteration $iter completed successfully"
  
  # Cool down between iterations
  if [ $iter -lt $ITERATIONS ]; then
    log "⏱️  Cooling down before next iteration..."
    sleep 5
  fi
}

################################################################################
# CLEANUP
################################################################################

cleanup() {
  log_warn "🗑️ Cleaning up processes..."
  
  if [ -f "$PID_FILE" ]; then
    while read pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        log "Killed process $pid"
      fi
    done < "$PID_FILE"
  fi
}

################################################################################
# MAIN EXECUTION
################################################################################

main() {
  echo -e "${MAGENTA}"
  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║  🌳 ITERATE & DEPLOY - Agent Orchestration Cycle 🌳          ║"
  echo "║  Bootstrap → Startup → gRPC → EventBus → Revenue → Metrics  ║"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  
  log "🔍 Configuration:"
  log "  Iterations: $ITERATIONS"
  log "  Environment: $ENVIRONMENT"
  log "  Agents dir: $AGENTS_DIR"
  log "  Logs: $LOG_DIR"
  
  revenue_log "════════════════════════════════════════════════════"
  revenue_log "ITERATE_AND_DEPLOY START"
  revenue_log "ITERATIONS=$ITERATIONS"
  revenue_log "ENVIRONMENT=$ENVIRONMENT"
  revenue_log "START_TIME=$(date)"
  revenue_log "════════════════════════════════════════════════════"
  
  # Run iterations
  for i in $(seq 1 $ITERATIONS); do
    ITER_COUNT=$i
    run_iteration $i || log_warn "Iteration $i had failures"
  done
  
  # Cleanup
  cleanup
  
  # Final report
  local end_time=$(date +%s%N)
  local total_duration=$(( (end_time - START_TIME) / 1000000000 ))  # Convert to seconds
  
  echo -e "${GREEN}"
  bar
  log_success "✅ ITERATION CYCLE COMPLETE!"
  log "Total iterations: $ITER_COUNT"
  log "Successful: $SUCCESS_COUNT"
  log "Failed: $FAIL_COUNT"
  log "Total duration: ${total_duration}s"
  bar
  echo -e "${NC}"
  
  revenue_log ""
  revenue_log "ITERATE_AND_DEPLOY COMPLETE"
  revenue_log "TOTAL_ITERATIONS=$ITER_COUNT"
  revenue_log "SUCCESSFUL=$SUCCESS_COUNT"
  revenue_log "FAILED=$FAIL_COUNT"
  revenue_log "TOTAL_DURATION_SECONDS=$total_duration"
  revenue_log "END_TIME=$(date)"
  revenue_log "════════════════════════════════════════════════════"
  
  log_success "Logs: $ITERATION_LOG"
  log_success "Revenue: $REVENUE_LOG"
  log_success "PIDs: $PID_FILE"
}

trap 'cleanup; exit 1' INT TERM EXIT
main "$@"
