"""Bounded business directives with durable, operator-readable execution receipts.

No generic shell, arbitrary URL, outbound-message or payment adapter is exposed.
"""
import asyncio
import hashlib
import json
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from contextlib import contextmanager

import httpx
from fastapi import HTTPException

ACTIONS = {"system_health", "revenue_readiness"}
MAX_RESPONSE_BYTES = 200_000


def now():
    return datetime.now(timezone.utc).isoformat()


class DirectiveStore:
    def __init__(self, db_path):
        self.db_path = str(db_path)
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS business_directives (
                id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, action TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL,
                dry_run INTEGER NOT NULL, result TEXT NOT NULL)""")
            # A process may stop during a probe. Never turn lost work into a successful result.
            db.execute("UPDATE business_directives SET status='interrupted', updated_at=? WHERE status='running'", (now(),))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=10000")
        try:
            with db:
                yield db
        finally:
            db.close()

    def get(self, directive_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM business_directives WHERE id=?", (directive_id,)).fetchone()
        if not row:
            return None
        value = dict(row)
        value.pop("request_hash")
        value["dry_run"] = bool(value["dry_run"])
        value["result"] = json.loads(value["result"])
        value["receipt_url"] = "/directives/" + directive_id
        return value

    def claim(self, directive_id, request_hash, action, dry_run):
        stamp = now()
        with self.connect() as db:
            cursor = db.execute("""INSERT OR IGNORE INTO business_directives VALUES (?,?,?,?,?,?,?,?)""",
                                (directive_id, request_hash, action, stamp, stamp, "running", int(dry_run), "{}"))
            row = db.execute("SELECT request_hash FROM business_directives WHERE id=?", (directive_id,)).fetchone()
            if row["request_hash"] != request_hash:
                raise HTTPException(409, "directive_id already belongs to a different signed request")
            return cursor.rowcount == 1

    def finish(self, directive_id, status, result):
        with self.connect() as db:
            db.execute("UPDATE business_directives SET status=?, updated_at=?, result=? WHERE id=?",
                       (status, now(), json.dumps(result, separators=(",", ":")), directive_id))

    def list(self, limit):
        with self.connect() as db:
            ids = db.execute("SELECT id FROM business_directives ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [self.get(row["id"]) for row in ids]


def validate(event):
    allowed = {"event_type", "directive_id", "action", "issued_at", "dry_run", "source_system", "trace_id"}
    if set(event) - allowed:
        raise HTTPException(422, "unsupported directive fields")
    if event.get("event_type") != "business.directive":
        raise HTTPException(422, "event_type must be business.directive")
    directive_id = event.get("directive_id")
    if not isinstance(directive_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", directive_id):
        raise HTTPException(422, "directive_id must be 8-100 URL-safe characters")
    action = event.get("action")
    if not isinstance(action, str) or not re.fullmatch(r"[a-z_]{1,60}", action):
        raise HTTPException(422, "action must be a named directive")
    issued_at = event.get("issued_at")
    if type(issued_at) not in (int, float) or not time.time() - 300 <= issued_at <= time.time() + 30:
        raise HTTPException(403, "directive signature expired or issued_at is invalid")
    dry_run = event.get("dry_run", True)
    if type(dry_run) is not bool:
        raise HTTPException(422, "dry_run must be boolean")
    return directive_id, action, dry_run


async def probe(name, url, kind):
    result = {"name": name, "source": url, "checked_at": now()}
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False, trust_env=False) as client:
            async with client.stream("GET", url, headers={"Accept": "application/json", "User-Agent": "Garcar-Directive/1.2"}) as response:
                result["http_status"] = response.status_code
                if 300 <= response.status_code < 400:
                    return {**result, "ok": False, "error": "redirect_not_followed"}
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_RESPONSE_BYTES:
                        return {**result, "ok": False, "error": "response_too_large"}
                if kind == "runtime":
                    payload = json.loads(body)
                    if not isinstance(payload, dict):
                        raise ValueError("invalid_runtime_response")
                    # Only explicitly selected observations are returned, never provider secrets.
                    result["runtime"] = {k: payload.get(k) for k in ("service", "status", "startup_completed", "execution_mode", "durable_storage", "approval_gate", "agents", "grpc", "ready")}
                    result["ok"] = response.is_success and payload.get("startup_completed") is True
                elif kind == "github":
                    repos = json.loads(body)
                    if not isinstance(repos, list):
                        return {**result, "ok": False, "error": "unexpected_github_response"}
                    result["repositories"] = [{k: row.get(k) for k in ("name", "html_url", "pushed_at", "archived")} for row in repos if isinstance(row, dict)]
                    result["ok"] = response.is_success
                else:
                    result["ok"] = response.is_success
        return result
    except Exception as exc:
        return {**result, "ok": False, "error": type(exc).__name__}


async def execute(store, event, body):
    directive_id, action, dry_run = validate(event)
    created = await asyncio.to_thread(store.claim, directive_id, hashlib.sha256(body).hexdigest(), action, dry_run)
    if not created:
        return {"accepted": True, "duplicate": True, "receipt": await asyncio.to_thread(store.get, directive_id)}
    # Targets are server-owned. Request payloads can never select a URL or command.
    targets = [("worker", os.getenv("GARCAR_WORKER_STATUS_URL", ""), "runtime"),
               ("public_site", "https://garcar-enterprise.up.railway.app", "http"),
               ("github", "https://api.github.com/users/Garrettc123/repos?sort=updated&per_page=20&type=owner", "github")]
    if action not in ACTIONS:
        status, result = "blocked", {"reason": "unsupported_directive", "supported_actions": sorted(ACTIONS), "external_writes": False,
                                      "note": "Outbound, payment and deployment actions require separate approved adapters; none is enabled."}
    elif dry_run:
        status, result = "planned", {"action": action, "read_only": True, "targets": [name for name, _, _ in targets],
                                    "external_writes": False, "note": "No probes ran. Submit a new directive_id with dry_run=false to run this bounded read-only plan."}
    else:
        try:
            observations = await asyncio.gather(*[probe(name, url, kind) if url else _missing(name) for name, url, kind in targets])
            blockers = [{"code": "source_check_failed", "source": row["name"]} for row in observations if not row.get("ok")]
            if action == "revenue_readiness":
                blockers += [{"code": "stripe_not_connected", "detail": "Charges, balance and payouts are unknown."},
                             {"code": "crm_not_connected", "detail": "Leads and outreach delivery are unknown."},
                             {"code": "checkout_not_verified", "detail": "An HTTP homepage response does not verify checkout or fulfillment."}]
            result = {"observations": observations, "blockers": blockers, "read_only": True, "external_writes": False,
                      "note": "Completed means the evidence check ran, not that systems are healthy or a sale occurred."}
            status = "completed"
        except Exception as exc:
            status, result = "failed", {"error": type(exc).__name__, "external_writes": False}
    await asyncio.to_thread(store.finish, directive_id, status, result)
    return {"accepted": True, "duplicate": False, "receipt": await asyncio.to_thread(store.get, directive_id)}


async def _missing(name):
    return {"name": name, "ok": False, "error": "target_not_configured", "checked_at": now()}
