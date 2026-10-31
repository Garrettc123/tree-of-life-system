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

# Install the Node runtime, Python tooling, and process supervisor.
RUN apk add --no-cache \
    curl \
    dumb-init \
    protobuf-dev \
    python3 \
    py3-virtualenv

# Copy built Node dependencies.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/agents/node_modules ./agents/node_modules

# Copy application code for both Node services and the Python web service.
COPY agents ./agents
COPY orchestrator ./orchestrator
COPY proto ./proto
COPY scripts ./scripts
COPY .env.template ./.env.template

# Install Python dependencies in an isolated environment and provide the
# executable name used by Railway's Procfile process launcher.
RUN ln -sf /usr/bin/python3 /usr/bin/python \
    && virtualenv -p /usr/bin/python3 /opt/venv \
    && /opt/venv/bin/python -m pip install --no-cache-dir -r /app/orchestrator/requirements.txt

ENV PATH="/opt/venv/bin:${PATH}"

# Create logs directory.
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Health check follows Railway's injected PORT for the selected service.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/health" || exit 1

ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["node", "agents/startup.js"]

LABEL org.opencontainers.image.title="Tree of Life - Autonomous Agent Orchestration"
LABEL org.opencontainers.image.description="Enterprise-grade multi-agent orchestration runtime"
LABEL org.opencontainers.image.version="2.5"
LABEL org.opencontainers.image.authors="Garrett Carrol"
