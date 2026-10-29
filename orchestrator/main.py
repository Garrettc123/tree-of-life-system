"""Garcar event orchestrator with fail-closed webhook authentication."""
import hashlib
import hmac
import json
import logging
import os
import sys
import uuid
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from router import route_event
from supabase_log import EventLog

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-5s | %(name)-10s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dispatch")

PORT = int(os.environ.get("PORT", 8001))
DISPATCH_SECRET = os.getenv("DISPATCH_SECRET", "")
OPERATOR_TOKEN = os.getenv("GARCAR_OPERATOR_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
MAX_EVENT_BYTES = 1_000_000
SENSITIVE_KEY_PARTS = (
    "token", "secret", "password", "credential", "api_key", "apikey",
    "authorization", "private_key", "access_key", "client_secret",
)

app = FastAPI(title="garcar-dispatch", version="1.1.0")
allowed_origins = [
    origin.strip()
    for origin in os.getenv("DISPATCH_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Dispatch-Sig", "X-Operator-Token"],
    allow_credentials=False,
)

event_log = EventLog(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _verify_sig(body: bytes, sig: Optional[str]) -> bool:
    """Verify the exact request bytes; an unset secret must never allow a request."""
    if not DISPATCH_SECRET or not sig:
        return False
    expected = "sha256=" + hmac.new(
        DISPATCH_SECRET.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig)


def _redact_for_storage(value):
    """Redact common secret-keyed fields from persistence while leaving routing input intact."""
    if isinstance(value, dict):
        safe = {}
        for key, item in value.items():
            normalized = "".join(ch for ch in str(key).lower() if ch.isalnum() or ch == "_")
            if any(part in normalized for part in SENSITIVE_KEY_PARTS):
                safe[str(key)] = "[REDACTED]"
            else:
                safe[str(key)] = _redact_for_storage(item)
        return safe
    if isinstance(value, list):
        return [_redact_for_storage(item) for item in value]
    return value


def require_operator(x_operator_token: Optional[str] = Header(default=None, alias="X-Operator-Token")) -> str:
    if not OPERATOR_TOKEN:
        raise HTTPException(503, "Operator authentication is not configured")
    if not x_operator_token or not hmac.compare_digest(x_operator_token, OPERATOR_TOKEN):
        raise HTTPException(401, "Operator authentication required")
    return "operator"


@app.get("/health")
async def health():
    """Public liveness only; external database reachability is not implied."""
    return {"status": "ok", "service": "garcar-dispatch", "version": "1.1.0"}


@app.get("/events")
async def get_events(
    limit: int = Query(default=50, ge=1, le=200),
    source: Optional[str] = None,
    actor: str = Depends(require_operator),
):
    events = await event_log.fetch(limit=limit, source=source)
    return {"events": events, "count": len(events)}


@app.post("/dispatch")
async def dispatch(
    request: Request,
    background: BackgroundTasks,
    x_dispatch_sig: Optional[str] = Header(default=None, alias="X-Dispatch-Sig"),
):
    if not DISPATCH_SECRET:
        raise HTTPException(503, "Dispatch signature validation is not configured")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_EVENT_BYTES:
                raise HTTPException(413, "event payload exceeds the 1 MB limit")
        except ValueError:
            raise HTTPException(400, "invalid content-length")

    chunks = []
    total_bytes = 0
    async for chunk in request.stream():
        total_bytes += len(chunk)
        if total_bytes > MAX_EVENT_BYTES:
            raise HTTPException(413, "event payload exceeds the 1 MB limit")
        chunks.append(chunk)
    body = b"".join(chunks)
    if not _verify_sig(body, x_dispatch_sig):
        raise HTTPException(403, "invalid signature")

    try:
        event = json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "invalid JSON")

    if not isinstance(event, dict):
        raise HTTPException(400, "JSON event must be an object")
    event_type = event.get("event_type")
    if not isinstance(event_type, str) or not event_type.strip():
        raise HTTPException(400, "missing or invalid event_type")
    event_type = event_type.strip()
    if len(event_type) > 150 or any(ord(char) < 32 for char in event_type):
        raise HTTPException(400, "event_type is invalid or too long")
    event["event_type"] = event_type

    source_system = event.get("source_system")
    if source_system is not None:
        if not isinstance(source_system, str) or len(source_system) > 100 or any(ord(char) < 32 for char in source_system):
            raise HTTPException(400, "source_system is invalid or too long")

    trace_id = event.get("trace_id")
    if trace_id is None:
        event["trace_id"] = f"trc_{uuid.uuid4().hex[:12]}"
    elif not isinstance(trace_id, str) or not trace_id.strip() or len(trace_id) > 200 or any(ord(char) < 32 for char in trace_id):
        raise HTTPException(400, "trace_id is invalid or too long")

    # Persist a redacted copy; dispatch the original event to the internal handler.
    event_id = await event_log.write(_redact_for_storage(event))
    background.add_task(route_event, event, event_id, event_log)

    log.info(
        "dispatch_accepted event_type=%s event_id=%s trace=%s",
        event_type, event_id, event.get("trace_id"),
    )
    return {
        "accepted": True,
        "event_id": event_id,
        "event_type": event_type,
        "trace_id": event.get("trace_id"),
    }


def main():
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
