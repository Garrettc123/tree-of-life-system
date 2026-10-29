# Garcar Native Control Plane

Version: `0.2.0`

A local-first, self-hosted control-plane foundation for Garcar Enterprise. It is intended to reduce reliance on hosted app platforms, but it is not itself an always-on hosting provider.

## Current capabilities

- Public `GET /health` liveness endpoint.
- Protected operator endpoints using `GARCAR_OPERATOR_TOKEN` and `X-Operator-Token`.
- Same-origin browser console at `/console`.
- Read-only health and service-inventory operations.
- Persistent work plans in SQLite with explicit approval-recording for plans outside the read-only allowlist.
- Fail-closed execution: even an approved mutating plan **cannot** execute in this version.
- Secret-like parameter values are redacted before plan persistence and audit logging.
- SQLite audit entries include a SHA-256 hash chain, with `GET /api/audit/verify` to detect unexpected edits to the stored chain.
- Local backup utility with SQLite `integrity_check`.
- Local-only Docker Compose mapping and non-root container user.

## Run locally (Python 3.12+)

From this directory, run:

```bash
bash ops/run_local.sh
```

On first run, the script creates a Python virtual environment and a local `.env` file with a random operator token. The script binds the server to `127.0.0.1`, not a public network interface.

Open [http://127.0.0.1:8080/console](http://127.0.0.1:8080/console). The token is not printed or saved by the browser console. To retrieve the token locally for pasting into the console, use:

```bash
grep '^GARCAR_OPERATOR_TOKEN=' .env
```

Keep `.env` private. It is excluded from Git. Never put the token in source code, a public issue, chat, or a screenshot.

Set a different port by setting `PORT` before running the script, for example `PORT=8090 bash ops/run_local.sh`.

## Run with Docker Compose

Docker must be installed locally. If you do not already have a local `.env`, generate one:

```bash
python3 -c 'import secrets; print("GARCAR_OPERATOR_TOKEN=" + secrets.token_urlsafe(48))' > .env
chmod 600 .env
```

Then run:

```bash
docker compose up --build -d
```

The app is published only on `127.0.0.1:8080`. SQLite data is persisted in the named `garcar_data` volume. Set `HOST_PORT` in `.env` if you need a different local port. Check status with:

```bash
docker compose ps
docker compose logs --tail=100 control-plane
```

Stop the local container with `docker compose down`. Do not use `docker compose down -v` unless you explicitly want to delete the named database volume.

## API reference

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Public process liveness only |
| GET | `/api/status` | Protected process/database status and local record counts |
| GET | `/api/services` | Protected service-name inventory; external state is unverified |
| POST | `/api/work/plan` | Store a work plan and redact secret-like parameter keys |
| GET | `/api/work/{plan_id}` | Read the stored plan and approval state |
| POST | `/api/work/{plan_id}/approve` | Record explicit approval with exact `APPROVE {plan_id}` confirmation; does not enable execution |
| POST | `/api/work/execute` | Execute only `health_check` or `list_services` |
| GET | `/api/audit` | Read recent audit entries and hash links |
| GET | `/api/audit/verify` | Verify the local hash chain |

All protected endpoints require the `X-Operator-Token` header. Keep the API on localhost until proper remote authentication, TLS, network restrictions, recovery, and operational monitoring are designed and tested.

## Backup and verification

For a local Python run, create a backup:

```bash
python ops/backup_db.py
```

The utility uses SQLite's online backup mechanism, writes the backup with restrictive local file permissions where supported, and runs `PRAGMA integrity_check`. This checks the database file's structural integrity; it does **not** prove the history was never changed. While the local server is running, verify the audit chain via the console or:

```bash
curl -H "X-Operator-Token: YOUR_LOCAL_TOKEN" http://127.0.0.1:8080/api/audit/verify
```

Replace the example token locally; do not commit it. Keep backups outside the Git repository and test restoration before relying on them.

For the Docker named volume, make a backup using the container's database path and copy the resulting file out of the container; do not assume the host-side Python backup command can see the named volume directly.

## Tests

```bash
python -m pip install -r requirements.txt
python -m compileall -q app.py ops/backup_db.py
python -m pytest -q
```

GitHub Actions runs these checks for pull requests that change this directory or its workflow. Test evidence must come from the workflow result; a workflow declaration alone is not evidence that tests passed.

## Explicit limitations

- This branch does not replace or repair existing Render, Railway, or Vercel services.
- It does not automatically deploy, start, or restart the existing Garcar web, worker, or scheduler.
- Service names in the inventory are not live uptime evidence.
- It does not execute arbitrary shell commands, run jobs, send email, contact payment processors, charge cards, or mutate cloud infrastructure.
- Approval is an audit record only; mutation execution is deliberately disabled.
- The SQLite hash chain is tamper-evident against simple record edits but is not a substitute for signed external log storage, secure backups, or protection against an attacker who can rewrite the database and recompute the chain.
- A local app is reachable only from the same machine. Public, continuous access requires a lawful machine or host that remains online.
- No paid deployment, billing change, production secret, or external side effect is performed by these files.

## Next engineering stages

1. Pass tests and review the resulting check run.
2. Add verified adapters for specific local services, each with timeouts, allowlisted operations, dry-run behavior, and auditable results.
3. Add a supervised process manager with rollback and restart limits.
4. Add backup/restore drills and externally anchored audit evidence.
5. Evaluate a free, lawful runtime only after the local system is tested.
