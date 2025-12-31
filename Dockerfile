# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install essential tools
RUN apk add --no-cache \
    curl \
    dumb-init \
    grpc_cli \
    protobuf-dev

# Copy built dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy application code
COPY agents ./agents
COPY proto ./proto
COPY .env.template ./.env.template

# Create logs directory
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Default command
CMD ["node", "agents/bootstrap.js"]

# Metadata
LABEL org.opencontainers.image.title="Tree of Life - Autonomous Agent Orchestration"
LABEL org.opencontainers.image.description="Enterprise-grade autonomous multi-agent system with Kafka, gRPC, and ReWOO orchestration"
LABEL org.opencontainers.image.version="2.4"
LABEL org.opencontainers.image.authors="Garrett Carrol"
