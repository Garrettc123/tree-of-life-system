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
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
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
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

app = FastAPI(title="garcar-dispatch", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

event_log = EventLog(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _verify_sig(body: bytes, sig: Optional[str]) -> bool:
    if not DISPATCH_SECRET:
        return True
    if not sig:
        return False
    expected = "sha256=" + hmac.new(
        DISPATCH_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "garcar-dispatch", "version": "1.0.0"}


@app.get("/events")
async def get_events(limit: int = 50, source: Optional[str] = None):
    events = await event_log.fetch(limit=min(limit, 200), source=source)
    return {"events": events, "count": len(events)}


@app.post("/dispatch")
async def dispatch(
    request: Request,
    background: BackgroundTasks,
    x_dispatch_sig: Optional[str] = Header(default=None, alias="X-Dispatch-Sig"),
):
    body = await request.body()
    if not _verify_sig(body, x_dispatch_sig):
        raise HTTPException(403, "invalid signature")

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "invalid JSON")

    event_type = event.get("event_type")
    if not event_type:
        raise HTTPException(400, "missing event_type")

    if "trace_id" not in event:
        event["trace_id"] = f"trc_{uuid.uuid4().hex[:12]}"

    event_id = await event_log.write(event)
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
