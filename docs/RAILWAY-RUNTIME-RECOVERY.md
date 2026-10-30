# Railway runtime recovery and read-only health canary

## Runtime correction

The root repository is the Node.js 20 Tree of Life agent runtime. The previous root Railway configuration selected NIXPACKS/Python and a Python orchestrator command, conflicting with the root Node Dockerfile and the worker's Node startup command. Root Railway defaults now use the root Dockerfile and `node agents/startup.js`.

The gRPC listener defaults to `0.0.0.0` so a service on the Railway private network can reach the process. It remains on the configured gRPC port (default 50051); this change does not expose a public gRPC domain.

## Health endpoints

The agent service's existing health server is authoritative:
- `GET /health`: liveness after the gRPC listener starts.
- `GET /ready`: readiness only when all registered runtime agents report active handlers.
- `GET /status`: detailed state snapshot.

These endpoints report runtime readiness, not revenue capability. The safe runtime handlers remain bounded; durable Supabase storage and the approval gate stay disabled unless their required secrets and tenant configuration are present.

## Scheduled canary

`scripts/garcar-health-canary.js` performs HTTP GET probes only:
- Web service: `GARCAR_WEB_HEALTH_URL` (expected to target its `/health` endpoint).
- Agent worker: `GARCAR_WORKER_READY_URL` (expected to target its `/ready` endpoint).

It emits a structured result and returns non-zero on a missing target, timeout, network failure, non-2xx response, or a worker that is not ready. It does not call any write, money, customer, outreach, self-heal, or deployment API.

Suggested Railway scheduler settings:
- Builder: `DOCKERFILE`
- Dockerfile: `Dockerfile`
- Start: `node scripts/garcar-health-canary.js`
- Cron: `*/5 * * * *`
- `GARCAR_WEB_HEALTH_URL=http://${{web.RAILWAY_PRIVATE_DOMAIN}}:8001/health`
- `GARCAR_WORKER_READY_URL=http://${{worker.RAILWAY_PRIVATE_DOMAIN}}:3000/ready`
- `GARCAR_CANARY_TIMEOUT_MS=7000`

Do not configure the scheduler cron until the source revision has been merged and the service has the two private-network target variables. A successful canary means those endpoints responded; it is not proof of payment processing or end-to-end business execution.
