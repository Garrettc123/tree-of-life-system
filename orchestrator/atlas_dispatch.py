# GARCAR ENTERPRISE — ATLAS Dispatch Service
# Deploy on Railway alongside garcar-dispatch.
# pip install fastapi uvicorn supabase httpx python-dotenv pydantic

import asyncio, os, httpx
from datetime import datetime, timezone
from typing import List
from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI(title="ATLAS Dispatch Engine", version="1.0.0")
security = HTTPBearer()

sb: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
ATLAS_API_KEY = os.environ["ATLAS_API_KEY"]
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "garcar-alerts")
DISPATCH_URL = os.environ.get("DISPATCH_URL", "")

def verify(creds: HTTPAuthorizationCredentials = Security(security)):
    if creds.credentials != ATLAS_API_KEY:
        raise HTTPException(401, "Invalid API key")
    return creds.credentials

class DispatchReq(BaseModel):
    webhook_event_id: str
    source: str
    event_type: str
    task_types: List[str]
    payload: dict

# ── Forward to garcar-dispatch event bus ─────────────────────
async def _emit_dispatch(source: str, event_type: str, webhook_event_id: str, results: dict) -> None:
    if not DISPATCH_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(f"{DISPATCH_URL}/dispatch", json={
                "event_type": f"{source}.{event_type}".replace(".", "_"),
                "source_system": "atlas-dispatch",
                "trace_id": f"atlas_{webhook_event_id[:12]}",
                "payload": {"webhook_event_id": webhook_event_id, "source": source,
                            "event_type": event_type, "results": results},
            })
    except Exception:
        pass

# ── Task Handlers ────────────────────────────────────────────
async def handle_accrual_tax(wid: str, payload: dict) -> dict:
    amount = payload.get("data", {}).get("object", {}).get("amount", 0)
    now = datetime.now(timezone.utc)
    q = (now.month - 1) // 3 + 1
    rows = []
    for jur, bps in [("federal", 2100), ("texas", 0)]:
        r = sb.table("tax_accruals").insert(dict(period_year=now.year, period_quarter=q,
            tax_jurisdiction=jur, taxable_amount=amount, tax_rate_bps=bps, status="accrued")).execute()
        rows.append(r.data)
    return {"accruals": len(rows), "amount_cents": amount}

async def handle_sweep_treasury(wid: str, payload: dict) -> dict:
    amount = payload.get("data", {}).get("object", {}).get("amount", 0)
    sb.table("treasury_positions").upsert(dict(account_name="stripe_primary", account_type="stripe",
        balance_cents=amount, last_synced_at=datetime.now(timezone.utc).isoformat()),
        on_conflict="account_name").execute()
    return {"treasury_updated": True, "amount_cents": amount}

async def handle_qualify_lead(wid: str, payload: dict) -> dict:
    data = dict(email=payload.get("email",""), first_name=payload.get("first_name",""),
        last_name=payload.get("last_name",""), company=payload.get("organization",{}).get("name",""),
        title=payload.get("title",""), apollo_id=payload.get("id"),
        enrichment_data=payload, status="new", assigned_agent="lead_qualifier_crew")
    sb.table("leads").upsert(data, on_conflict="apollo_id").execute()
    return {"lead_queued": True, "email": data["email"]}

async def handle_activate_subscription(wid: str, payload: dict) -> dict:
    eid = payload.get("envelopeId","")
    sb.table("contracts").update(dict(status="completed",
        signed_at=datetime.now(timezone.utc).isoformat())).eq("docusign_envelope_id", eid).execute()
    return {"contract_completed": True, "envelope_id": eid}

async def handle_deploy(wid: str, payload: dict) -> dict:
    sb.table("deployments").insert(dict(webhook_event_id=wid,
        repo_name=payload.get("repository",{}).get("name",""),
        repo_full_name=payload.get("repository",{}).get("full_name",""),
        branch=payload.get("ref","refs/heads/main").replace("refs/heads/",""),
        commit_sha=payload.get("after",""), status="triggered",
        triggered_by=payload.get("pusher",{}).get("name",""), environment="production")).execute()
    return {"deploy_logged": True}

async def handle_notify(wid: str, payload: dict) -> dict:
    amount = payload.get("data",{}).get("object",{}).get("amount",0)
    etype = payload.get("type","event")
    async with httpx.AsyncClient() as c:
        await c.post(f"https://ntfy.sh/{NTFY_TOPIC}",
            content=f"⚡ {etype} | ${amount/100:.2f}",
            headers={"Title":"Garcar ATLAS","Priority":"default","Tags":"money_with_wings"})
    return {"notified": True}

HANDLERS = {
    "accrual_tax":           handle_accrual_tax,
    "sweep_treasury":        handle_sweep_treasury,
    "qualify_lead":          handle_qualify_lead,
    "activate_subscription": handle_activate_subscription,
    "deploy":                handle_deploy,
    "notify":                handle_notify,
}

# ── Dispatch endpoint ────────────────────────────────────────
@app.post("/api/v1/dispatch")
async def dispatch(req: DispatchReq, _: str = Depends(verify)):
    results, errors = {}, []
    now = datetime.now(timezone.utc)

    for task_type in req.task_types:
        handler = HANDLERS.get(task_type)
        if not handler:
            errors.append(f"Unknown task: {task_type}"); continue

        rec = sb.table("atlas_tasks").insert(dict(webhook_event_id=req.webhook_event_id,
            task_type=task_type, crew_agent=f"{task_type}_crew",
            input_data=req.payload, status="running",
            started_at=now.isoformat())).execute()
        tid = rec.data[0]["id"] if rec.data else None

        try:
            t0 = asyncio.get_event_loop().time()
            result = await handler(req.webhook_event_id, req.payload)
            ms = int((asyncio.get_event_loop().time() - t0) * 1000)
            if tid:
                sb.table("atlas_tasks").update(dict(status="completed", output_data=result,
                    completed_at=datetime.now(timezone.utc).isoformat(), duration_ms=ms)).eq("id", tid).execute()
            results[task_type] = result
        except Exception as e:
            if tid:
                sb.table("atlas_tasks").update(dict(status="failed", error_message=str(e),
                    completed_at=datetime.now(timezone.utc).isoformat())).eq("id", tid).execute()
            errors.append(f"{task_type}: {e}")

    sb.table("webhook_events").update(dict(
        status="processed" if not errors else "failed",
        processed_at=datetime.now(timezone.utc).isoformat(),
        error_message="; ".join(errors) or None
    )).eq("id", req.webhook_event_id).execute()

    asyncio.ensure_future(
        _emit_dispatch(req.source, req.event_type, req.webhook_event_id, results)
    )

    return {"ok": True, "webhook_event_id": req.webhook_event_id,
            "tasks_completed": list(results.keys()), "errors": errors, "results": results}

@app.get("/health")
async def health(): return {"status": "ok", "service": "atlas-dispatch"}
