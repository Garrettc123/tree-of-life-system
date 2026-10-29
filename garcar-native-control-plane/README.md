# Garcar Native Control Plane (v0.1)

A small self-hosted control-plane foundation intended to reduce dependency on hosted application platforms.

## What it currently does
- Provides a public liveness endpoint at `GET /health`.
- Requires `GARCAR_OPERATOR_TOKEN` for protected endpoints.
- Exposes an inventory of known Garcar service names without pretending those external services are online.
- Creates read-only work plans and blocks unknown/mutating actions from execution.
- Writes audit events to a local SQLite database.
- Includes a Dockerfile and smoke tests.

## What it does NOT do yet
- It does not deploy or restart the existing Garcar web, worker, or scheduler.
- It does not execute arbitrary shell commands, contact Stripe, send emails, or run payments.
- It does not create a public internet endpoint or provide an always-on host by itself.
- The included browser console is a prototype, not a production-grade identity provider or remote agent runtime.

## Browser console prototype\nOpen `console/index.html` in a browser. Enter the base URL of a separately running control-plane server and the operator token when needed. The token remains in page memory and is not persisted. For cross-origin use, configure the server's CORS policy deliberately; no CORS middleware is enabled by default.\n\n## Run locally (Python 3.12+)
```bash
cd garcar-native-control-plane
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export GARCAR_OPERATOR_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
uvicorn app:app --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/health`. Keep the server bound to localhost until authentication, TLS, firewalling, and deployment hardening have been reviewed.

Protected endpoints require header `X-Operator-Token`. Do not put real tokens in source control or chat.

## Tests
```bash
pytest -q
```

## Safety model
- Authentication fails closed when the operator token is absent.
- Only `health_check` and `list_services` are executable in v0.1.
- Other actions are plan-only and marked as requiring approval.
- The audit ledger is local evidence, not tamper-proof storage.
- A passing test is not evidence that any hosted production service is live.

## Next milestones
1. CI smoke tests and test evidence.
2. Local operator console.
3. Service adapters with dry-run mode and explicit approvals.
4. Signed audit export and backup/restore checks.
5. A lawful, $0 hosting/runtime option if continuous public access is required.
