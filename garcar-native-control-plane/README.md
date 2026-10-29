# Garcar Native Control Plane and Local Event Orchestrator

Version: `0.2.0`

A local-first, self-hosted foundation intended to reduce reliance on blocked hosted app platforms. The Docker Compose setup contains two services: a protected control-plane API with a browser console, and a private event orchestrator. It is not itself an always-on public hosting provider.

## Current capabilities

- Control-plane browser console served from the same origin at `/console`.
- Public liveness endpoints at `/health`; these do not claim database or integration readiness.
- Protected operator endpoints using `GARCAR_OPERATOR_TOKEN` and `X-Operator-Token`; configured operator tokens shorter than 32 bytes are rejected.
- Read-only local health and service inventory operations. When Compose is used, the control plane checks the orchestrator's known-local `/health` endpoint. Web, worker, and scheduler statuses remain unverified.
- Persistent work plans in SQLite with an explicit approval-recording endpoint for actions outside the read-only allowlist.
- Fail-closed execution: even an approved mutating plan **cannot** execute in this version.
- Values under common secret-like and common personal-data keys (including email, phone, and date-of-birth fields) are redacted before plan persistence and audit logging. This key-based filter is a safeguard, not a guarantee; do not submit credentials or unnecessary private customer data.
- Control-plane SQLite audit entries include a SHA-256 hash chain, with `GET /api/audit/verify` to detect unexpected edits to the stored chain.
- The event orchestrator requires an HMAC signature on `POST /dispatch`; a missing or shorter-than-32-byte `DISPATCH_SECRET` returns HTTP 503 rather than accepting requests.
- `GET /events` requires operator authentication.
- Event payloads are redacted for common secret-like and personal-data keys before persistence. If Supabase is unset or temporarily fails, events fall back to local SQLite; local event data lives in its own Docker volume.
- Existing GitHub/Linear/Notion handlers that can create external records are disabled by default with `GARCAR_ENABLE_EXTERNAL_HANDLERS=false` in Compose. Customer email is not written to payment-event logs, and handler failures log only the exception type. Do not enable external handlers until action-by-action approval and audit controls exist.
- Local backup utilities for both SQLite databases, including SQLite integrity checks.
- Docker containers run as non-root users. Only the control-plane port is published, bound to `127.0.0.1`; the orchestrator is private to the Compose network.

## Option 0: run both services directly in Android Termux (no Docker)

This is the mobile-friendly path for a phone that has Termux and Python. It keeps both services bound to loopback on the same device; it does not make the console public or guarantee that Android will keep the processes alive indefinitely.

In Termux, from a clean checkout:

```bash
pkg update
pkg install python git coreutils
git clone --depth 1 -b feat/garcar-native-control-plane https://github.com/Garrettc123/tree-of-life-system.git
cd tree-of-life-system/garcar-native-control-plane
bash ops/run_termux_stack.sh init
bash ops/run_termux_stack.sh install
bash ops/run_termux_stack.sh test
```

The secret bootstrap writes random operator and dispatch secrets to the ignored local `.env` file. It does not print their values. The install command creates separate local Python environments for the control plane and orchestrator and installs the required packages. On Termux, it requires Python 3.14 and pre-installs the matching `pydantic-core==2.50.0` Android wheel before resolving the pinned requirements. That wheel is provided by the third-party [Android Pydantic Core project](https://github.com/Eutalix/android-pydantic-core), which documents its supported Termux ABIs and Python version; inspect that dependency source if you prefer to build it yourself. If your Termux Python is older, the script stops with a message instead of trying an on-device Rust compilation. A test command does not start the services.

When the tests finish, start the local stack:

```bash
bash ops/run_termux_stack.sh start
```

Type the exact confirmation phrase shown by the script. Then open this address **on the same phone**:

[http://127.0.0.1:8080/console](http://127.0.0.1:8080/console)

Useful follow-up commands:

```bash
bash ops/run_termux_stack.sh status
bash ops/run_termux_stack.sh logs control-plane
bash ops/run_termux_stack.sh logs orchestrator
bash ops/run_termux_stack.sh backup
bash ops/run_termux_stack.sh stop
```

Stop also requires an exact confirmation phrase. The stack saves logs and local databases under the repository's ignored runtime/data/backups directories. If Android kills the processes, run the start command again. A Termux wake lock may reduce sleep-related interruptions but is not a guarantee of continuous operation. Do not expose the API to the internet or forward these ports publicly.

### Optional: temporary, email-gated remote preview

Keep the regular stack loopback-only unless remote access is needed. To create a temporary protected preview, `cloudflared` must already be installed and support the `--allowed-mail` option. First confirm that the local stack is healthy, then run:

```bash
GARCAR_TUNNEL_ALLOWED_MAIL=you@example.com bash ops/run_termux_stack.sh tunnel
```

Replace the example with an email address you control. The command refuses to start without a single specific email address, verifies both local APIs, displays a public-exposure warning, and requires you to type an exact confirmation phrase. Cloudflare then requires an email one-time PIN before visitors can reach the console; the Garcar operator token is still separately required for protected API actions. The tunnel runs in the foreground; keep Termux open and press `Ctrl+C` to end it. Its `trycloudflare.com` URL is temporary and changes on restart.

This is **for temporary testing, not production hosting**. Cloudflare states that Quick Tunnels have no uptime guarantee and are limited to 200 in-flight requests; the URL stops working when the tunnel process stops. See the [official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Do not remove the email gate, share the operator token, or commit `.env`.

## Option A: run the control plane by itself (Python 3.12+)

From this directory, run:

```bash
bash ops/run_local.sh
```

The script creates a Python virtual environment and a local `.env` file with random operator and dispatch secrets when needed. It runs only the control-plane API, bound to `127.0.0.1`.

Open [http://127.0.0.1:8080/console](http://127.0.0.1:8080/console). To retrieve the operator token locally for pasting into the console, use:

```bash
grep '^GARCAR_OPERATOR_TOKEN=' .env
```

Keep `.env` private. It is excluded from Git. Never put tokens in source code, public issues, chat, or screenshots.

Set a different port with `PORT`, for example `PORT=8090 bash ops/run_local.sh`.

## Option B: run the full local Compose stack

Docker is required. Generate local secrets without printing their values, then validate the Compose configuration without starting containers:

```bash
bash ops/manage_stack.sh init
bash ops/manage_stack.sh validate
```

The initialization script creates or repairs the two required local secrets in `.env`, restricts the file to owner-only permissions, and does not display the secret values. Do not send or commit `.env`.

Start the complete local stack only when you are ready. The manager requires you to type an exact confirmation phrase for start, stop, and restart actions:

```bash
bash ops/manage_stack.sh start
bash ops/manage_stack.sh status
bash ops/manage_stack.sh logs control-plane
bash ops/manage_stack.sh logs orchestrator
bash ops/verify_local.sh
REQUIRE_ORCHESTRATOR=1 bash ops/verify_local.sh
```

These commands operate on your own Docker host; they do not deploy to Render, Railway, or the public internet. Use `bash ops/manage_stack.sh stop` to stop the stack without deleting persisted data, or `bash ops/manage_stack.sh backup` to make timestamped SQLite-verified local backups.

The app is published only at `127.0.0.1:8080`. The orchestrator has no host-published port. SQLite data is persisted in the named volumes `garcar_data` and `garcar_event_data`. Optional Supabase settings may be added to the ignored local `.env` file as `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`; leave them unset to use the local event store.

Check local service status:

```bash
docker compose ps
docker compose logs --tail=100 control-plane orchestrator
```

Stop without deleting persisted data:

```bash
docker compose down
```

Do **not** use `docker compose down -v` unless you intend to delete both database volumes.

## Control-plane API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Public process liveness only |
| GET | `/console` | Browser console |
| GET | `/api/status` | Protected process/database status |
| GET | `/api/services` | Protected inventory; probes only the configured local orchestrator health endpoint |
| POST | `/api/work/plan` | Store a plan and redact common secret-keyed parameters |
| GET | `/api/work/{plan_id}` | Read a stored plan and approval state |
| POST | `/api/work/{plan_id}/approve` | Record approval with exact `APPROVE {plan_id}` confirmation; does not enable execution |
| POST | `/api/work/execute` | Execute only `health_check` or `list_services` |
| GET | `/api/audit` | Read recent audit records |
| GET | `/api/audit/verify` | Check the local audit hash chain |

All control-plane protected endpoints require `X-Operator-Token`.

## Orchestrator API (private network)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Public liveness inside the private Compose network |
| GET | `/events` | Read event history; requires `X-Operator-Token` |
| POST | `/dispatch` | Accept a JSON object only when `X-Dispatch-Sig` matches the HMAC-SHA256 of the exact request bytes |

The dispatch signature format is `sha256=<hex-digest>`. The signing secret must stay in local configuration and be shared only with an authorized event sender. Requests over 1 MB are rejected. CORS has no allowed origins by default. The API also rejects exact replays of a previously accepted request body.

The orchestrator stores events in local SQLite when Supabase is not configured or a remote write fails. Local fallback records remain visible alongside remote results, but are **not** automatically reconciled to Supabase; inspect and reconcile those records before treating the remote store as complete. The current Compose file deliberately does not pass GitHub, Linear, or Notion API keys into the orchestrator, and sets `GARCAR_ENABLE_EXTERNAL_HANDLERS=false`. Do not add those keys or set that flag to true until explicit per-action approval gates are implemented, because existing event handlers can create external issue/comment/page records when enabled.

## Backup and verification

For a local Python control-plane run:

```bash
python ops/backup_db.py
```

For the event store:

```bash
cd ../orchestrator
python backup_db.py
```

Both utilities use SQLite's online backup mechanism and run `PRAGMA integrity_check`. This validates SQLite file structure, not business-event correctness or the audit hash chain.

After starting a local instance, run the operator verification script from this directory:

```bash
bash ops/verify_local.sh
```

It checks control-plane liveness, authenticated database status, the local audit chain, and prints the orchestrator probe status. For a Compose stack, require the orchestrator probe to pass:

```bash
REQUIRE_ORCHESTRATOR=1 bash ops/verify_local.sh
```

A successful local check does not prove public availability or third-party integration status.

For a Docker Compose run, create both backups inside their respective containers and copy them out before relying on them:

```bash
mkdir -p backups
chmod 700 backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose exec -T control-plane python ops/backup_db.py --output "/app/backups/garcar-control-plane-$STAMP.sqlite3"
docker cp "$(docker compose ps -q control-plane):/app/backups/garcar-control-plane-$STAMP.sqlite3" backups/
docker compose exec -T orchestrator python backup_db.py --output "/app/backups/garcar-events-$STAMP.sqlite3"
docker cp "$(docker compose ps -q orchestrator):/app/backups/garcar-events-$STAMP.sqlite3" backups/
```

To verify the control-plane audit chain, use the console or make a local request to `/api/audit/verify` with the operator token. Keep backups outside Git and test restoration before relying on them.

## Tests

The pinned runtime dependencies are FastAPI 0.162.0, Uvicorn 0.54.0, HTTPX 0.28.1, and Pydantic 2.14.0. Pydantic 2.14.0 pins `pydantic-core==2.50.0`, which is why the Termux runner installs that Android wheel before installing the runtime requirements.

Control plane:

```bash
python -m pip install -r requirements-dev.txt
python -m compileall -q app.py ops/backup_db.py
python -m pytest -q
```

Orchestrator (from `../orchestrator`):

```bash
python -m pip install -r requirements.txt pytest==9.2.0
python -m compileall -q main.py router.py supabase_log.py test_main.py backup_db.py handlers/stripe_payment.py handlers/github_ci.py handlers/rhns_alert.py handlers/generic.py
python -m pytest -q test_main.py
```

GitHub Actions is configured to run both test suites and build local images. A workflow file alone is not test evidence; use the actual check result.

## Explicit limitations

- This branch does not repair existing Render, Railway, or Vercel deployments.
- It does not automatically start, restart, or verify the existing web, worker, or scheduler services.
- It does not execute arbitrary shell commands, deploy code, charge cards, send customer email, or mutate cloud infrastructure through the control-plane API.
- Approval is an audit record only; mutation execution is deliberately disabled.
- Supabase fallback data is local and is not automatically replayed to Supabase.
- The local SQLite audit hash chain is tamper-evident against simple record edits, but is not a substitute for signed external log storage, secure backups, or protection against an attacker who can rewrite the database and recompute the chain. When an older v0.1 database is first upgraded, the migration adds hashes to existing records; this creates an integrity baseline at migration time, but does not prove those earlier records were never altered.
- A local app is only reachable from the same machine. Continuous public access requires a lawful machine or host that remains online.
- No paid deployment, billing change, production secret, or external side effect is performed by these files.

## Next engineering stages

1. Get the new CI suites passing and inspect their logs.
2. Add verified service adapters one at a time, each with timeouts, allowlisted operations, dry-run behavior, and auditable results.
3. Add a supervised process manager with restart limits and rollback.
4. Add a tested local-to-Supabase reconciliation process with idempotency before enabling auto-sync.
5. Test database restore and audit recovery using non-production data.
