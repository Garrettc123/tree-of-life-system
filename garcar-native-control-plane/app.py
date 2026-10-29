"""Minimal self-hosted Garcar control plane; safe-by-default reference implementation."""
from __future__ import annotations

import hmac
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

APP_NAME = "garcar-native-control-plane"
DB_PATH = os.getenv("GARCAR_DB_PATH", str(Path(__file__).with_name("garcar-control-plane.sqlite3")))

app = FastAPI(
    title="Garcar Native Control Plane",
    version="0.1.0",
    description="Self-hosted control API with local audit records and fail-closed execution policy.",
)

# This is an inventory of known service names, not a claim that those services are running.
SERVICE_INVENTORY = [
    {"name": "native-control-plane", "kind": "api", "status": "current_process"},
    {"name": "web", "kind": "application", "status": "external_status_unverified"},
    {"name": "worker", "kind": "worker", "status": "external_status_unverified"},
    {"name": "scheduler", "kind": "scheduler", "status": "external_status_unverified"},
]

READ_ONLY_ACTIONS = {"health_check", "list_services"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect_db() -> sqlite3.Connection:
    path = Path(DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=5)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                actor TEXT NOT NULL,
                event_type TEXT NOT NULL,
                detail_json TEXT NOT NULL
            )
        """)


def audit(actor: str, event_type: str, detail: dict[str, Any]) -> None:
    init_db()
    with connect_db() as db:
        db.execute(
            "INSERT INTO audit_events (id, created_at, actor, event_type, detail_json) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), utc_now(), actor, event_type, json.dumps(detail, sort_keys=True)),
        )


def require_operator(x_operator_token: str | None = Header(default=None)) -> str:
    expected = os.getenv("GARCAR_OPERATOR_TOKEN", "")
    # Protected operations fail closed when no token has been configured.
    if not expected:
        raise HTTPException(status_code=503, detail="Operator authentication is not configured")
    if not x_operator_token or not hmac.compare_digest(x_operator_token, expected):
        raise HTTPException(status_code=401, detail="Operator authentication required")
    return "operator"


class WorkPlan(BaseModel):
    action: str = Field(min_length=1, max_length=100)
    parameters: dict[str, Any] = Field(default_factory=dict)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": APP_NAME, "version": app.version}


@app.get("/api/status")
def status(actor: str = Depends(require_operator)) -> dict[str, Any]:
    audit(actor, "status_read", {})
    return {
        "control_plane": "available",
        "mode": "local_self_hosted",
        "spending_authorized": False,
        "live_external_services_verified": False,
        "service_count": len(SERVICE_INVENTORY),
    }


@app.get("/api/services")
def list_services(actor: str = Depends(require_operator)) -> dict[str, Any]:
    audit(actor, "service_inventory_read", {"count": len(SERVICE_INVENTORY)})
    return {"services": SERVICE_INVENTORY, "note": "Inventory only; external runtime states have not been checked."}


@app.post("/api/work/plan")
def plan_work(work: WorkPlan, actor: str = Depends(require_operator)) -> dict[str, Any]:
    safe = work.action in READ_ONLY_ACTIONS
    result = {
        "plan_id": str(uuid.uuid4()),
        "action": work.action,
        "parameters": work.parameters,
        "mode": "read_only" if safe else "approval_required",
        "requires_approval": not safe,
        "executable_now": safe,
        "external_side_effects": False,
    }
    audit(actor, "work_plan_created", result)
    return result


@app.post("/api/work/execute")
def execute_work(work: WorkPlan, actor: str = Depends(require_operator)) -> dict[str, Any]:
    # Deliberately no arbitrary shell, deployment, payment, or integration execution.
    if work.action not in READ_ONLY_ACTIONS:
        audit(actor, "work_execution_blocked", {"action": work.action, "reason": "not_in_read_only_allowlist"})
        raise HTTPException(
            status_code=403,
            detail="Action is not in the read-only allowlist; no action was executed.",
        )

    if work.action == "health_check":
        result: dict[str, Any] = health()
    else:
        result = {"services": SERVICE_INVENTORY, "note": "Inventory only; external runtime states have not been checked."}

    audit(actor, "read_only_work_executed", {"action": work.action})
    return {"executed": True, "action": work.action, "result": result}


@app.get("/api/audit")
def get_audit(limit: int = 50, actor: str = Depends(require_operator)) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 200))
    init_db()
    with connect_db() as db:
        rows = db.execute(
            "SELECT id, created_at, actor, event_type, detail_json FROM audit_events ORDER BY created_at DESC LIMIT ?",
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
            }
            for row in rows
        ]
    }
