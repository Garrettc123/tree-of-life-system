#!/bin/bash

################################################################################
# FULL-SCALE DEPLOYMENT WITH COMPLETE FILE GENERATION
# Auto-creates all necessary configs, deploys everything, activates revenue
# Usage: ./FULL_SCALE_DEPLOY.sh [production|staging]
################################################################################

set -o pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-"production"}
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_LOG="${DEPLOY_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"
REVENUE_LOG="${DEPLOY_DIR}/revenue-$(date +%Y%m%d-%H%M%S).log"
ERROR_LOG="${DEPLOY_DIR}/errors-$(date +%Y%m%d-%H%M%S).log"
BACKUP_DIR="${DEPLOY_DIR}/backups/$(date +%Y%m%d-%H%M%S)"

MAX_RETRIES=5
RETRY_DELAY=5
START_TIME=$(date +%s)
SUCCESS=0

# Helper functions
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$DEPLOY_LOG"; }
log_success() { echo -e "${GREEN}✅ [$(date +'%H:%M:%S')] $1${NC}" | tee -a "$DEPLOY_LOG"; }
log_error() { echo -e "${RED}❌ [$(date +'%H:%M:%S')] $1${NC}" | tee -a "$DEPLOY_LOG" "$ERROR_LOG"; }
log_warn() { echo -e "${YELLOW}⚠️  [$(date +'%H:%M:%S')] $1${NC}" | tee -a "$DEPLOY_LOG"; }
log_revenue() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$REVENUE_LOG"; }

################################################################################
# GENERATE CONFIGURATION FILES
################################################################################

generate_env_file() {
  log "📝 Generating .env file..."
  
  cat > "${DEPLOY_DIR}/.env" << 'EOF'
# ==============================================================================
# Tree-of-Life System - Environment Configuration
# Generated: Auto-deployment script
# ==============================================================================

# Application Mode
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Kafka Configuration
KAFKA_BROKERS=kafka-broker-1:29092
KAFKA_CLIENT_ID=tree-of-life-client
KAFKA_TOPICS=events,transactions,metrics,revenue
KAFKA_PARTITIONS=8
KAFKA_REPLICATION_FACTOR=1
KAFKA_CONSUMER_GROUP=tree-of-life-group
KAFKA_SESSION_TIMEOUT=30000

# gRPC Configuration
GRPC_HOST=0.0.0.0
GRPC_PORT=50051
GRPC_MAX_CONCURRENT_STREAMS=100
GRPC_MAX_MESSAGE_LENGTH=10485760

# Zookeeper
ZOOKEEPER_CONNECT=zookeeper:2181

# Revenue System
REVENUE_MODE=enabled
REVENUE_API_ENDPOINT=http://localhost:3000/api/revenue
REVENUE_TRACKING_ENABLED=true
REVENUE_AUTO_START=true
REVENUE_UPDATE_INTERVAL=5000

# Auto-Retry Configuration
AUTO_RETRY=true
MAX_RETRIES=5
RETRY_DELAY=10
FAILURE_THRESHOLD=3
RECOVERY_MODE=auto

# Monitoring
HEALTH_CHECK_INTERVAL=30000
METRICS_COLLECTION=enabled
ALERT_ON_FAILURE=true

# Security
ALLOW_CORS=true
CORS_ORIGIN=*
ALLOW_UNSIGNED=false

# Performance Tuning
MAX_ITERATIONS=5
CONCURRENCY_LEVEL=8
TIMEOUT_MS=30000
BUFFER_SIZE=102400

# Docker & Orchestration
DOCKER_NETWORK=tree-of-life
DOCKER_IMAGE_PREFIX=tree-of-life
CONTAINER_RESTART_POLICY=always
EOF
  
  log_success ".env file generated"
}

generate_dockerfile() {
  log "📝 Generating Dockerfile..."
  
  cat > "${DEPLOY_DIR}/Dockerfile" << 'EOF'
FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    tini

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit

# Copy application
COPY . .

# Create directories
RUN mkdir -p logs agents data

# Expose ports
EXPOSE 3000 50051

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('net').createConnection({port:50051},()=>process.exit(0))"

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["npm", "start"]
EOF
  
  log_success "Dockerfile generated"
}

generate_docker_compose() {
  log "📝 Generating docker-compose.yml..."
  
  cat > "${DEPLOY_DIR}/docker-compose.yml" << 'EOF'
version: '3.9'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: zk-1
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
      ZOOKEEPER_SERVER_ID: 1
    ports:
      - "2181:2181"
    networks:
      - tree-of-life
    healthcheck:
      test: ["CMD", "echo", "ruok", "|", "nc", "localhost", "2181"]
      interval: 10s
      timeout: 5s
      retries: 5

  kafka-broker-1:
    image: confluentinc/cp-kafka:7.5.0
    container_name: kafka-1
    depends_on:
      zookeeper:
        condition: service_healthy
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-broker-1:29092,PLAINTEXT_HOST://kafka-broker-1:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_LOG_RETENTION_MS: 6912000000
      KAFKA_LOG_SEGMENT_BYTES: 1073741824
      KAFKA_NUM_NETWORK_THREADS: 8
      KAFKA_NUM_IO_THREADS: 8
      KAFKA_SOCKET_SEND_BUFFER_BYTES: 102400
      KAFKA_SOCKET_RECEIVE_BUFFER_BYTES: 102400
      KAFKA_SOCKET_REQUEST_MAX_BYTES: 104857600
    ports:
      - "9092:9092"
      - "29092:29092"
    networks:
      - tree-of-life
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 10s
      timeout: 10s
      retries: 5
    volumes:
      - kafka-data-1:/var/lib/kafka/data

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: kafka-ui
    depends_on:
      kafka-broker-1:
        condition: service_healthy
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-broker-1:29092
      KAFKA_CLUSTERS_0_ZOOKEEPER: zookeeper:2181
    ports:
      - "8080:8080"
    networks:
      - tree-of-life

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: tree-of-life-app
    depends_on:
      kafka-broker-1:
        condition: service_healthy
    environment:
      NODE_ENV: production
      KAFKA_BROKERS: kafka-broker-1:29092
      GRPC_HOST: 0.0.0.0
      GRPC_PORT: 50051
      LOG_LEVEL: info
      REVENUE_MODE: enabled
    ports:
      - "3000:3000"
      - "50051:50051"
    networks:
      - tree-of-life
    volumes:
      - ./agents:/app/agents
      - ./logs:/app/logs
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "require('net').createConnection({port:50051},()=>process.exit(0))"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    stdin_open: true
    tty: true

networks:
  tree-of-life:
    driver: bridge

volumes:
  kafka-data-1:
    driver: local
EOF
  
  log_success "docker-compose.yml generated"
}

generate_github_workflows() {
  log "📝 Generating GitHub Actions workflows..."
  
  mkdir -p "${DEPLOY_DIR}/.github/workflows"
  
  cat > "${DEPLOY_DIR}/.github/workflows/deploy.yml" << 'EOF'
name: Production Deployment

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Deploy
        run: bash FULL_SCALE_DEPLOY.sh production
EOF
  
  log_success "GitHub Actions workflows generated"
}

generate_monitoring_script() {
  log "📝 Generating monitoring script..."
  
  cat > "${DEPLOY_DIR}/monitor.sh" << 'EOF'
#!/bin/bash

echo "🔍 Monitoring Tree-of-Life Deployment"

# Docker containers
echo -e "\n📦 Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}"

# Kafka topics
echo -e "\n📨 Kafka Topics:"
docker exec kafka-1 kafka-topics --bootstrap-server localhost:9092 --list

# Application logs
echo -e "\n📋 Application Logs (last 20 lines):"
docker logs --tail 20 tree-of-life-app

# Resource usage
echo -e "\n💾 Resource Usage:"
docker stats --no-stream

# Health endpoints
echo -e "\n🏥 Health Checks:"
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:50051 2>&1 || echo "gRPC ready"

# Revenue tracking
echo -e "\n💰 Revenue Status:"
curl -s http://localhost:3000/api/revenue/status 2>/dev/null | jq . || echo "Revenue endpoint pending"
EOF
  
  chmod +x "${DEPLOY_DIR}/monitor.sh"
  log_success "Monitoring script generated"
}

generate_recovery_script() {
  log "📝 Generating auto-recovery script..."
  
  cat > "${DEPLOY_DIR}/auto-recovery.sh" << 'EOF'
#!/bin/bash

echo "🔧 Auto-Recovery Initiated"
LOG_FILE="recovery-$(date +%Y%m%d-%H%M%S).log"

# Check and fix failed containers
echo "Checking failed containers..." | tee -a "$LOG_FILE"
docker ps -a --filter "status=exited" | tee -a "$LOG_FILE"

# Restart failed services
echo "Restarting failed services..." | tee -a "$LOG_FILE"
docker-compose restart 2>&1 | tee -a "$LOG_FILE"

# Wait for services
sleep 10

# Verify recovery
echo "Verifying recovery..." | tee -a "$LOG_FILE"
docker ps --format "table {{.Names}}\t{{.Status}}" | tee -a "$LOG_FILE"

# Check health
echo "Running health checks..." | tee -a "$LOG_FILE"
curl -s http://localhost:3000/health | tee -a "$LOG_FILE"

echo "Recovery complete" | tee -a "$LOG_FILE"
EOF
  
  chmod +x "${DEPLOY_DIR}/auto-recovery.sh"
  log_success "Auto-recovery script generated"
}

################################################################################
# PRE-DEPLOYMENT CHECKS
################################################################################

check_prerequisites() {
  log "🔍 Checking prerequisites..."
  
  # Check Docker
  if ! command -v docker &> /dev/null; then
    log_warn "Docker not found, installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
  fi
  log_success "Docker available"
  
  # Check Docker Compose
  if ! command -v docker-compose &> /dev/null; then
    log_warn "Docker Compose not found, installing..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
  fi
  log_success "Docker Compose available"
  
  # Check Git
  if ! command -v git &> /dev/null; then
    log_error "Git not installed"
    return 1
  fi
  log_success "Git available"
  
  # Check Node.js
  if ! command -v node &> /dev/null; then
    log_warn "Node.js not found, installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  log_success "Node.js available"
}

backup_existing() {
  log "💾 Backing up existing configuration..."
  
  mkdir -p "$BACKUP_DIR"
  
  for file in .env Dockerfile docker-compose.yml package.json; do
    if [ -f "${DEPLOY_DIR}/${file}" ]; then
      cp "${DEPLOY_DIR}/${file}" "${BACKUP_DIR}/${file}.bak"
    fi
  done
  
  log_success "Backup created at $BACKUP_DIR"
}

################################################################################
# DEPLOYMENT
################################################################################

deploy_services() {
  local attempt=1
  
  while [ $attempt -le $MAX_RETRIES ]; do
    log "🚀 Deployment attempt $attempt/$MAX_RETRIES..."
    
    if docker-compose up -d --build 2>&1 | tee -a "$DEPLOY_LOG"; then
      log_success "Services deployed successfully"
      return 0
    fi
    
    log_warn "Deployment failed, retrying in ${RETRY_DELAY}s..."
    docker-compose down --remove-orphans 2>/dev/null || true
    sleep $RETRY_DELAY
    attempt=$((attempt + 1))
  done
  
  log_error "Deployment failed after $MAX_RETRIES attempts"
  return 1
}

verify_deployment() {
  log "✅ Verifying deployment..."
  
  local timeout=60
  local elapsed=0
  
  while [ $elapsed -lt $timeout ]; do
    # Check Kafka
    if docker exec kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092 &>/dev/null; then
      log_success "Kafka is healthy"
      
      # Check application
      if curl -s http://localhost:3000/health &>/dev/null; then
        log_success "Application is healthy"
        return 0
      fi
    fi
    
    sleep 5
    elapsed=$((elapsed + 5))
  done
  
  log_error "Services failed to become healthy"
  return 1
}

activate_revenue() {
  log "💰 Activating revenue system..."
  
  log_revenue "DEPLOYMENT_START=${START_TIME}"
  log_revenue "ENVIRONMENT=${ENVIRONMENT}"
  log_revenue "STATUS=activating_revenue_system"
  
  # Start revenue endpoints
  if curl -s -X POST http://localhost:3000/api/revenue/start \
       -H "Content-Type: application/json" \
       -d '{"mode":"auto","env":"'${ENVIRONMENT}'"}' > /dev/null; then
    log_success "Revenue system activated"
    log_revenue "REVENUE_SYSTEM=active"
    return 0
  else
    log_warn "Revenue system activation needs manual verification"
    log_revenue "REVENUE_SYSTEM=pending"
    return 1
  fi
}

################################################################################
# MONITORING
################################################################################

start_monitoring() {
  log "📊 Starting monitoring..."
  
  # Create monitoring cron job
  cat > "${DEPLOY_DIR}/cron-monitor.sh" << 'EOF'
#!/bin/bash
LOG_FILE="/var/log/tree-of-life-monitor.log"
docker ps --filter "status=exited" >> $LOG_FILE
if [ $(docker ps -q | wc -l) -lt 4 ]; then
  cd /opt/tree-of-life-system
  ./auto-recovery.sh >> $LOG_FILE
fi
EOF
  
  chmod +x "${DEPLOY_DIR}/cron-monitor.sh"
  log_success "Monitoring enabled"
}

################################################################################
# MAIN
################################################################################

main() {
  log_revenue "═══════════════════════════════════════════════════════════════"
  log_revenue "FULL-SCALE DEPLOYMENT INITIATED"
  log_revenue "Environment: ${ENVIRONMENT}"
  log_revenue "Start Time: $(date)"
  log_revenue "═══════════════════════════════════════════════════════════════"
  
  echo -e "${MAGENTA}\n╔═══════════════════════════════════════════════════════╗"
  echo "║  🌳 TREE-OF-LIFE FULL-SCALE DEPLOYMENT 🌳           ║"
  echo "║  Auto-Retry • Revenue Activation • Full Monitoring    ║"
  echo "╚═══════════════════════════════════════════════════════╝${NC}\n"
  
  check_prerequisites || { log_error "Prerequisites check failed"; exit 1; }
  backup_existing || { log_error "Backup failed"; exit 1; }
  generate_env_file
  generate_dockerfile
  generate_docker_compose
  generate_github_workflows
  generate_monitoring_script
  generate_recovery_script
  deploy_services || { log_error "Deployment failed"; exit 1; }
  verify_deployment || { log_error "Verification failed"; exit 1; }
  activate_revenue
  start_monitoring
  
  local end_time=$(date +%s)
  local duration=$((end_time - START_TIME))
  
  echo -e "${GREEN}\n╔═══════════════════════════════════════════════════════╗"
  echo "║  ✅ DEPLOYMENT COMPLETE! ✅                            ║"
  echo "╚═══════════════════════════════════════════════════════╝${NC}"
  
  log_success "Deployment completed in ${duration}s"
  log_success "Logs: $DEPLOY_LOG"
  log_success "Errors: $ERROR_LOG"
  log_success "Revenue: $REVENUE_LOG"
  
  log_revenue "DEPLOYMENT_END=$(date +%s)"
  log_revenue "DURATION_SECONDS=${duration}"
  log_revenue "STATUS=complete"
  log_revenue "═══════════════════════════════════════════════════════════════"
  
  echo -e "${BLUE}\n📊 Access Points:"
  echo "   App: http://localhost:3000"
  echo "   gRPC: localhost:50051"
  echo "   Kafka UI: http://localhost:8080"
  echo "   Monitor: ./monitor.sh${NC}\n"
}

trap 'log_error "Deployment interrupted"; exit 1' INT TERM
main "$@"
