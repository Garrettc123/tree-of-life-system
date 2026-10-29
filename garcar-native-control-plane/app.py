"""Local-first Garcar control plane with fail-closed execution policy."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import sqlite3
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
import httpx
from pydantic import BaseModel, Field

APP_NAME = "garcar-native-control-plane"
APP_DIR = Path(__file__).resolve().parent
CONSOLE_PATH = APP_DIR / "console" / "index.html"
DB_PATH = os.getenv("GARCAR_DB_PATH", str(APP_DIR / "data" / "garcar-control-plane.sqlite3"))
ORCHESTRATOR_HEALTH_URL = os.getenv("GARCAR_ORCHESTRATOR_HEALTH_URL", "").strip()
READ_ONLY_ACTIONS = {"health_check", "list_services"}
SENSITIVE_KEY_PARTS = (
    "token", "secret", "password", "credential", "api_key", "apikey",
    "authorization", "private_key", "access_key", "client_secret",
    "email", "phone", "ssn", "date_of_birth", "dob",
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Garcar Native Control Plane",
    version="0.2.0",
    description="Local-first control API with protected operations, persistent plans, and an audit ledger.",
    lifespan=lifespan,
)

# These are inventory labels, not evidence that external systems are online.
SERVICE_INVENTORY = [
    {"name": "native-control-plane", "kind": "api", "status": "current_process"},
    {"name": "orchestrator", "kind": "event-api", "status": "external_status_unverified"},
    {"name": "web", "kind": "application", "status": "external_status_unverified"},
    {"name": "worker", "kind": "worker", "status": "external_status_unverified"},
    {"name": "scheduler", "kind": "scheduler", "status": "external_status_unverified"},
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connect_db() -> Iterator[sqlite3.Connection]:
    """Open, commit/rollback, and always close one SQLite connection."""
    path = Path(DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=5)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    with connect_db() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS audit_events (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                actor TEXT NOT NULL,
                event_type TEXT NOT NULL,
                detail_json TEXT NOT NULL,
                previous_hash TEXT,
                event_hash TEXT
            )"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS work_plans (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                parameters_json TEXT NOT NULL,
                status TEXT NOT NULL,
                requires_approval INTEGER NOT NULL,
                approved_at TEXT,
                approved_by TEXT
            )"""
        )

        # Migrate the legacy v0.1 schema only when hash columns are first introduced.
        # Never silently rebuild a missing hash on a newer schema: verification must flag it.
        columns = {row["name"] for row in db.execute("PRAGMA table_info(audit_events)").fetchall()}
        legacy_hash_schema = "previous_hash" not in columns and "event_hash" not in columns
        if "previous_hash" not in columns:
            db.execute("ALTER TABLE audit_events ADD COLUMN previous_hash TEXT")
        if "event_hash" not in columns:
            db.execute("ALTER TABLE audit_events ADD COLUMN event_hash TEXT")

        if legacy_hash_schema:
            previous_hash = "0" * 64
            rows = db.execute("SELECT * FROM audit_events ORDER BY rowid").fetchall()
            for row in rows:
                payload = {
                    "id": row["id"],
                    "created_at": row["created_at"],
                    "actor": row["actor"],
                    "event_type": row["event_type"],
                    "detail_json": row["detail_json"],
                    "previous_hash": previous_hash,
                }
                digest = hashlib.sha256(
                    json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
                ).hexdigest()
                db.execute(
                    "UPDATE audit_events SET previous_hash = ?, event_hash = ? WHERE id = ?",
                    (previous_hash, digest, row["id"]),
                )
                previous_hash = digest


def redact_sensitive(value: Any) -> Any:
    """Redact values under secret-like keys before they reach disk or responses."""
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9_]", "", str(key).lower())
            if any(part in normalized for part in SENSITIVE_KEY_PARTS):
                cleaned[str(key)] = "[REDACTED]"
            else:
                cleaned[str(key)] = redact_sensitive(item)
        return cleaned
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    return value


def event_digest(
    event_id: str,
    created_at: str,
    actor: str,
    event_type: str,
    detail_json: str,
    previous_hash: str,
) -> str:
    payload = {
        "id": event_id,
        "created_at": created_at,
        "actor": actor,
        "event_type": event_type,
        "detail_json": detail_json,
        "previous_hash": previous_hash,
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def audit(actor: str, event_type: str, detail: dict[str, Any]) -> None:
    init_db()
    event_id = str(uuid.uuid4())
    created_at = utc_now()
    detail_json = json.dumps(redact_sensitive(detail), sort_keys=True, separators=(",", ":"))
    with connect_db() as db:
        # Serialize verification and append so concurrent requests cannot fork the local chain.
        db.execute("BEGIN IMMEDIATE")
        previous_hash = "0" * 64
        rows = db.execute("SELECT * FROM audit_events ORDER BY rowid").fetchall()
        for row in rows:
            expected_hash = event_digest(
                row["id"], row["created_at"], row["actor"], row["event_type"],
                row["detail_json"], previous_hash,
            )
            if row["previous_hash"] != previous_hash or row["event_hash"] != expected_hash:
                raise RuntimeError("Audit chain fails verification; refusing to append.")
            previous_hash = expected_hash
        digest = event_digest(event_id, created_at, actor, event_type, detail_json, previous_hash)
        db.execute(
            """INSERT INTO audit_events
               (id, created_at, actor, event_type, detail_json, previous_hash, event_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (event_id, created_at, actor, event_type, detail_json, previous_hash, digest),
        )


def require_operator(x_operator_token: str | None = Header(default=None)) -> str:
    expected = os.getenv("GARCAR_OPERATOR_TOKEN", "")
    if len(expected.encode("utf-8")) < 32:
        raise HTTPException(status_code=503, detail="Operator authentication requires a token of at least 32 bytes")
    if not x_operator_token or not hmac.compare_digest(x_operator_token.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Operator authentication required")
    return "operator"


class WorkPlan(BaseModel):
    action: str = Field(min_length=1, max_length=100)
    parameters: dict[str, Any] = Field(default_factory=dict)


class PlanApproval(BaseModel):
    confirmation: str = Field(min_length=1, max_length=180)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness only: does not claim database or integration readiness."""
    return {"status": "ok", "service": APP_NAME, "version": app.version}


@app.get("/console", include_in_schema=False)
def console() -> FileResponse:
    if not CONSOLE_PATH.is_file():
        raise HTTPException(status_code=404, detail="Console assets are not installed")
    return FileResponse(CONSOLE_PATH, media_type="text/html")


@app.get("/api/status")
def status(actor: str = Depends(require_operator)) -> dict[str, Any]:
    audit(actor, "status_read", {})
    with connect_db() as db:
        db.execute("SELECT 1").fetchone()
        plan_count = db.execute("SELECT COUNT(*) AS n FROM work_plans").fetchone()["n"]
        audit_count = db.execute("SELECT COUNT(*) AS n FROM audit_events").fetchone()["n"]
    return {
        "control_plane": "available",
        "mode": "local_self_hosted",
        "database": "available",
        "spending_authorized": False,
        "external_services_checked_by_this_endpoint": False,
        "service_count": len(SERVICE_INVENTORY),
        "stored_plan_count": plan_count,
        "audit_event_count": audit_count,
        "note": "Use /api/services for the configured orchestrator health probe.",
    }


def _validated_orchestrator_health_url() -> str:
    """Only probe an operator-configured, known-local orchestrator health endpoint."""
    if not ORCHESTRATOR_HEALTH_URL:
        return ""
    try:
        parsed = urlsplit(ORCHESTRATOR_HEALTH_URL)
        port = parsed.port
    except ValueError:
        return ""
    allowed_hosts = {"orchestrator", "localhost", "127.0.0.1", "::1"}
    if (
        parsed.scheme != "http"
        or parsed.hostname not in allowed_hosts
        or port not in {8001, 8080}
        or parsed.path != "/health"
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
    ):
        return ""
    return ORCHESTRATOR_HEALTH_URL


async def collect_service_status() -> list[dict[str, Any]]:
    services = [dict(service) for service in SERVICE_INVENTORY]
    for service in services:
        if service["name"] != "orchestrator":
            continue
        if not ORCHESTRATOR_HEALTH_URL:
            continue
        url = _validated_orchestrator_health_url()
        service["checked_at"] = utc_now()
        if not url:
            service["status"] = "invalid_health_url_config"
            continue
        try:
            async with httpx.AsyncClient(timeout=2.0, follow_redirects=False) as client:
                response = await client.get(url)
            if response.status_code == 200:
                payload = response.json()
                service["status"] = (
                    "healthy"
                    if isinstance(payload, dict)
                    and payload.get("status") == "ok"
                    and payload.get("service") == "garcar-dispatch"
                    else "unexpected_health_response"
                )
            else:
                service["status"] = "unhealthy"
                service["http_status"] = response.status_code
        except Exception as exc:
            service["status"] = "unreachable"
            service["check_error"] = type(exc).__name__
    return services


@app.get("/api/services")
async def list_services(actor: str = Depends(require_operator)) -> dict[str, Any]:
    services = await collect_service_status()
    audit(
        actor,
        "service_inventory_read",
        {"count": len(services), "statuses": {item["name"]: item["status"] for item in services}},
    )
    return {
        "services": services,
        "note": "Only the orchestrator is actively checked when a known-local health URL is configured; other external runtime states remain unverified.",
    }


@app.post("/api/work/plan")
def plan_work(work: WorkPlan, actor: str = Depends(require_operator)) -> dict[str, Any]:
    init_db()
    action = work.action.strip()
    if not action:
        raise HTTPException(status_code=422, detail="Action cannot be blank")
    parameters = redact_sensitive(work.parameters)
    read_only = action in READ_ONLY_ACTIONS
    plan_id = str(uuid.uuid4())
    state = "ready_read_only" if read_only else "approval_required"
    created_at = utc_now()
    with connect_db() as db:
        db.execute(
            """INSERT INTO work_plans
               (id, created_at, actor, action, parameters_json, status, requires_approval)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (plan_id, created_at, actor, action, json.dumps(parameters, sort_keys=True), state, int(not read_only)),
        )
    result = {
        "plan_id": plan_id,
        "created_at": created_at,
        "action": action,
        "parameters": parameters,
        "status": state,
        "mode": "read_only" if read_only else "approval_required",
        "requires_approval": not read_only,
        "executable_now": read_only,
        "external_side_effects": False,
    }
    audit(actor, "work_plan_created", result)
    return result


@app.get("/api/work/{plan_id}")
def get_plan(plan_id: str, actor: str = Depends(require_operator)) -> dict[str, Any]:
    init_db()
    with connect_db() as db:
        row = db.execute("SELECT * FROM work_plans WHERE id = ?", (plan_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {
        "plan_id": row["id"],
        "created_at": row["created_at"],
        "action": row["action"],
        "parameters": json.loads(row["parameters_json"]),
        "status": row["status"],
        "requires_approval": bool(row["requires_approval"]),
        "approved_at": row["approved_at"],
        "approved_by": row["approved_by"],
        "execution_enabled": row["action"] in READ_ONLY_ACTIONS,
    }


@app.post("/api/work/{plan_id}/approve")
def approve_plan(plan_id: str, approval: PlanApproval, actor: str = Depends(require_operator)) -> dict[str, Any]:
    """Record deliberate operator approval; approval does not enable mutation execution."""
    init_db()
    expected_confirmation = f"APPROVE {plan_id}"
    if not hmac.compare_digest(approval.confirmation, expected_confirmation):
        raise HTTPException(status_code=400, detail=f"Confirmation must exactly equal: {expected_confirmation}")
    with connect_db() as db:
        row = db.execute("SELECT * FROM work_plans WHERE id = ?", (plan_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Plan not found")
        if row["action"] in READ_ONLY_ACTIONS:
            raise HTTPException(status_code=409, detail="Read-only plans do not require approval")
        if row["status"] != "approval_required":
            raise HTTPException(status_code=409, detail="Plan is not awaiting approval")
        approved_at = utc_now()
        db.execute(
            "UPDATE work_plans SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?",
            ("approved_not_executable", approved_at, actor, plan_id),
        )
    audit(actor, "work_plan_approval_recorded", {"plan_id": plan_id, "action": row["action"]})
    return {
        "plan_id": plan_id,
        "status": "approved_not_executable",
        "approval_recorded": True,
        "execution_enabled": False,
        "note": "Approval evidence was recorded. This version still blocks all mutating action execution.",
    }


@app.post("/api/work/execute")
async def execute_work(work: WorkPlan, actor: str = Depends(require_operator)) -> dict[str, Any]:
    action = work.action.strip()
    if action not in READ_ONLY_ACTIONS:
        audit(actor, "work_execution_blocked", {"action": action, "reason": "not_in_read_only_allowlist"})
        raise HTTPException(
            status_code=403,
            detail="Action is not in the read-only allowlist; no action was executed.",
        )
    if action == "health_check":
        result: dict[str, Any] = health()
    else:
        services = await collect_service_status()
        result = {
            "services": services,
            "note": "Only the orchestrator is actively checked when a known-local health URL is configured; other external runtime states remain unverified.",
        }
    audit(actor, "read_only_work_executed", {"action": action})
    return {"executed": True, "action": action, "result": result}


def verify_audit_chain() -> dict[str, Any]:
    init_db()
    with connect_db() as db:
        rows = db.execute("SELECT * FROM audit_events ORDER BY rowid").fetchall()
    previous_hash = "0" * 64
    for index, row in enumerate(rows, start=1):
        expected = event_digest(
            row["id"], row["created_at"], row["actor"], row["event_type"],
            row["detail_json"], previous_hash,
        )
        if row["previous_hash"] != previous_hash or row["event_hash"] != expected:
            return {"valid": False, "events_checked": index, "failed_event_id": row["id"]}
        previous_hash = expected
    return {"valid": True, "events_checked": len(rows), "head_hash": previous_hash}


@app.get("/api/audit/verify")
def audit_verify(actor: str = Depends(require_operator)) -> dict[str, Any]:
    result = verify_audit_chain()
    if not result["valid"]:
        # Do not append to a chain that has failed verification.
        return result
    audit(actor, "audit_chain_verified", {"valid": True, "events_checked": result["events_checked"]})
    # Verify again including the verification event so the returned status reflects the persisted chain.
    return verify_audit_chain()


@app.get("/api/audit")
def get_audit(limit: int = 50, actor: str = Depends(require_operator)) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 200))
    with connect_db() as db:
        rows = db.execute(
            """SELECT id, created_at, actor, event_type, detail_json, previous_hash, event_hash
               FROM audit_events ORDER BY created_at DESC LIMIT ?""",
            (safe_limit,),
        ).fetchall()
    return {
        "events": [
            {
                "id": row["id"],
                "created_at": row["created_at"],
                "actor": row["actor"],
                "event_type": row["event_type"],
                "detail": json.loads(row["detail_json"]),
                "previous_hash": row["previous_hash"],
                "event_hash": row["event_hash"],
            }
            for row in rows
        ]
    }
