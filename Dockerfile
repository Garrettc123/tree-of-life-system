# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

WORKDIR /app

# Install root runtime dependencies and the nested planning-agent dependencies.
COPY package*.json ./
COPY agents/package.json ./agents/package.json
RUN npm ci --omit=dev \
    && npm install --prefix ./agents --omit=dev --no-package-lock \
    && npm cache clean --force

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install essential tools
RUN apk add --no-cache \
    curl \
    dumb-init \
    protobuf-dev \
    python3

# Copy built dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy application code
COPY agents ./agents
COPY --from=builder /app/agents/node_modules ./agents/node_modules
COPY proto ./proto
COPY scripts ./scripts
COPY .env.template ./.env.template

# Create logs directory
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Ensure both Python command names are available to Railway's process launcher.
RUN ln -sf /usr/bin/python3 /usr/bin/python && python --version && python3 --version

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/health" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Default command
CMD ["node", "agents/startup.js"]

# Metadata
LABEL org.opencontainers.image.title="Tree of Life - Autonomous Agent Orchestration"
LABEL org.opencontainers.image.description="Enterprise-grade autonomous multi-agent system with Kafka, gRPC, and ReWOO orchestration"
LABEL org.opencontainers.image.version="2.5"
LABEL org.opencontainers.image.authors="Garrett Carrol"
