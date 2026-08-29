# Deployment Guide

This document is the single source of truth for deploying the Tree of Life System. Legacy deployment docs (`DEPLOYMENT.md`, `ZERO_TOKEN_DEPLOY.md`, `DEPLOYMENT_SUMMARY.md`, `scripts/one-click-deploy.md`) are kept for historical reference but this file supersedes them.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Docker](#docker)
- [Cloudflair (Frontend)](#cloudflair-frontend)
- [Railway (Backend / Full-stack)](#railway-backendful-stack)
- [Environment Variables](#environment-variables)
- [Health Checks](#health-checks)

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Node.js | 20.x (see `.nvmrc`) |
| npm | 10.x |
| Docker | 24.x |
| Docker Compose | 2.x |

---

## Local Development

```bash
# Clone the repo
git clone https://github.com/Garrettc123/tree-of-life-system.git
cd tree-of-life-system

# Install dependencies
npm ci

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start infrastructure (Kafka, etc.)
docker-compose up -d

# Start the agent system
npm start
```

The API server is available at `http://localhost:3000`. Health check: `GET /health`.

---

## Docker

### Build the image

```bash
docker build -t tree-of-life:latest .
```

### Run with Docker Compose

```bash
docker-compose up -d
docker-compose logs -f
```

### Stop

```bash
docker-compose down
```

The `Dockerfile` uses a multi-stage build. The final image is based on `node:20-alpine` and includes only production dependencies.

---

## Cloudflair (Frontend)

1. Go to [cloudflair.com/new](https://cloudflair.com/new).
2. Import this GitHub repository.
3. Set the build command to `npm run build` (if applicable) or leave blank for static files from `public/`.
4. Set environment variables in the Cloudflair dashboard (see [Environment Variables](#environment-variables)).
5. Cloudflair auto-deploys on every push to `main`.

---

## Railway (Backend / Full-stack)

1. Create a new Railway project and connect this GitHub repository.
2. Railway uses `railway.json` for build/start configuration.
3. Set all required environment variables in the Railway service settings.
4. Railway redeploys automatically on push to `main`.

**Required Railway env vars:**
- `NODE_ENV=production`
- `KAFKA_BROKERS` — your managed Kafka broker addresses
- `PORT` — Railway sets this automatically

---

## Environment Variables

See `.env.example` for the full reference. Copy it to `.env` for local development. For production, inject variables via your platform's secrets manager (Railway variables, Cloudflair env, GitHub Secrets, etc.).

**Never commit `.env` to source control.**

---

## Health Checks

| Endpoint | Expected response |
|----------|------------------|
| `GET /health` | `{"status":"healthy"}` |
| `GET /` | `{"status":"healthy","service":"Tree of Life System",...}` |
| `GET /api/v1/status` | `{"status":"operational"}` |

The Docker image includes a `HEALTHCHECK` that hits `/health` every 30 seconds.
