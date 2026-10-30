# Railway runtime recovery and read-only health canary

## Runtime correction

The root repository is the Node.js 20 Tree of Life agent runtime. The previous root `railway.toml` and `railway.json` selected conflicting shared build/start commands across three services. Both shared config-as-code files are removed. Each Railway service must use its own service-level configuration so a shared repository does not force the worker, cron scheduler, and Python web orchestrator to share one start command.

Recommended per-service configuration:
- **Worker:** root directory `/`, builder `DOCKERFILE`, Dockerfile `Dockerfile`, start `node agents/startup.js`, health path `/health`.
- **Scheduler:** root directory `/`, builder `DOCKERFILE`, Dockerfile `Dockerfile`, start `node scripts/garcar-health-canary.js`, cron `*/5 * * * *`.
- **Web:** root directory `/orchestrator`, builder `DOCKERFILE`, Dockerfile `Dockerfile`, start `python main.py`, health path `/health`.

The gRPC listener defaults to `0.0.0.0` for private-network service-to-service access, remaining on the configured gRPC port (default 50051). No public gRPC domain is created by this change.

## Health endpoints

The agent service's existing health server is authoritative:
- `GET /health`: liveness after the gRPC listener starts.
- `GET /ready`: readiness only when all registered runtime agents report active handlers.
- `GET /status`: detailed state snapshot.

These endpoints report runtime readiness, not revenue capability. Durable Supabase storage and the approval gate remain disabled unless the required service credentials and tenant configuration are provided.

## Scheduled canary

`scripts/garcar-health-canary.js` performs HTTP GET probes only:
- Web service: `GARCAR_WEB_HEALTH_URL` (target the service `/health` endpoint).
- Agent worker: `GARCAR_WORKER_READY_URL` (target the service `/ready` endpoint).

It emits a structured result and returns non-zero on a missing target, timeout, network failure, non-2xx response, or a worker that is not ready. It does not call business, payment, outreach, self-heal, or deployment APIs.

Suggested scheduler environment variables (set in Railway, not committed):
- `GARCAR_WEB_HEALTH_URL`: reference the web service private domain and port 8001.
- `GARCAR_WORKER_READY_URL`: reference the worker service private domain and port 3000.
- `GARCAR_CANARY_TIMEOUT_MS=7000`.

Do not configure the scheduler cron until both target variables are set. A successful canary means those endpoints responded; it is not proof of payment processing or end-to-end business execution.
