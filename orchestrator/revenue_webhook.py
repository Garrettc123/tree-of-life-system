"""Verified Stripe checkout -> durable, private order intake queue.

Only checkout events from specifically identified live Garcar payment links are
tracked. No PII, API keys, or raw Stripe events are persisted. This module NEVER
marks an order fulfilled, initiates money movement, or sends customer messages.
"""
import hashlib
import hmac
import json
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from contextlib import contextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from acquisition import AcquisitionStore, LEAD_PATTERN, now as acquisition_now

router = APIRouter()
MAX_BYTES = 256_000
# Verified live-mode checkout links; the money amount is a further integrity guard.
OFFERS = {
    "plink_1UEcv4FKGbk21LK57hRic0dR": ("lead_followup_review", 49700),
    "plink_1UGpMIFKGbk21LK5RHl8asRI": ("callback_clock_install", 250000),
    "plink_1UExqpFKGbk21LK5PHxGbDRd": ("callback_clock_install", 250000),
}
TRACKED_EVENTS = {
    "checkout.session.completed", "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _db_path():
    return Path(os.environ.get("GARCAR_EVENT_DB_PATH") or "/data/garcar-events.sqlite3")


def _verify(raw: bytes, header: str, secret: str, *, timestamp=None):
    if len(secret.encode()) < 32:
        raise HTTPException(503, "Stripe verification is not configured")
    if not isinstance(header, str) or len(header) > 2000:
        raise HTTPException(403, "invalid Stripe signature")
    fields = [chunk.strip().split("=", 1) for chunk in header.split(",") if "=" in chunk]
    stamps = [v for k, v in fields if k == "t" and v.isdigit()]
    signatures = [v for k, v in fields if k == "v1" and re.fullmatch(r"[0-9a-fA-F]{64}", v)]
    if len(stamps) != 1 or not signatures:
        raise HTTPException(403, "invalid Stripe signature")
    issued_at = int(stamps[0]); now = int(timestamp if timestamp is not None else time.time())
    if abs(now - issued_at) > 300:
        raise HTTPException(403, "expired Stripe signature")
    expected = hmac.new(secret.encode(), f"{issued_at}.".encode() + raw, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, s.lower()) for s in signatures):
        raise HTTPException(403, "invalid Stripe signature")


class Orders:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS verified_checkout_events (
                event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
                event_type TEXT NOT NULL, payload_sha256 TEXT NOT NULL, outcome TEXT NOT NULL
            )""")
            db.execute("""CREATE TABLE IF NOT EXISTS verified_checkout_orders (
                session_id TEXT PRIMARY KEY, offer TEXT NOT NULL, amount_cents INTEGER NOT NULL,
                currency TEXT NOT NULL, payment_link TEXT NOT NULL, state TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )""")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(str(self.path), timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=10000")
        try:
            with db:
                yield db
        finally:
            db.close()

    def record(self, event: dict, digest: str):
        event_id = event.get("id")
        event_type = event.get("type")
        if not isinstance(event_id, str) or not re.fullmatch(r"evt_[A-Za-z0-9]{8,120}", event_id):
            raise HTTPException(422, "invalid Stripe event id")
        if event_type not in TRACKED_EVENTS:
            return {"tracked": False, "reason": "event_not_tracked"}
        data = event.get("data") or {}
        session = data.get("object") if isinstance(data, dict) else None
        if not isinstance(session, dict) or session.get("object") != "checkout.session":
            raise HTTPException(422, "invalid Checkout Session event")
        link = session.get("payment_link")
        offer = OFFERS.get(link)
        session_id = session.get("id")
        amount = session.get("amount_total")
        if (event.get("livemode") is not True or not offer or
            not isinstance(session_id, str) or not re.fullmatch(r"cs_live_[A-Za-z0-9]{8,130}", session_id) or
            type(amount) is not int or amount != offer[1] or session.get("currency") != "usd" or
            session.get("mode") != "payment"):
            return {"tracked": False, "reason": "not_an_approved_live_offer"}
        payment_status = session.get("payment_status")
        if event_type == "checkout.session.async_payment_failed":
            state = "payment_failed"
        elif payment_status == "paid":
            state = "paid_intake_pending"
        else:
            state = "payment_pending"
        stamp = _now()
        with self.connect() as db:
            with db:
                existing = db.execute("SELECT event_id FROM verified_checkout_events WHERE event_id=?", (event_id,)).fetchone()
                if existing:
                    return {"tracked": True, "duplicate": True, "session_id": session_id}
                previous = db.execute("SELECT state FROM verified_checkout_orders WHERE session_id=?", (session_id,)).fetchone()
                if previous and previous["state"] == "paid_intake_pending":
                    state = previous["state"]
                db.execute("INSERT INTO verified_checkout_events VALUES(?,?,?,?,?)",
                           (event_id, stamp, event_type, digest, state))
                db.execute("""INSERT INTO verified_checkout_orders VALUES(?,?,?,?,?,?,?,?)
                    ON CONFLICT(session_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at""",
                           (session_id, offer[0], amount, "usd", link, state, stamp, stamp))
                # Bind a real payment only to a first-party lead actually persisted
                # before checkout. Ignore forged, test or unknown references.
                reference = session.get("client_reference_id")
                if state == "paid_intake_pending" and isinstance(reference, str) and LEAD_PATTERN.fullmatch(reference):
                    try:
                        found = db.execute("SELECT id FROM acquisition_leads WHERE id=?", (reference,)).fetchone()
                        if found:
                            db.execute("INSERT OR IGNORE INTO acquisition_attribution(session_id,lead_id,attached_at) VALUES(?,?,?)",
                                       (session_id, reference, acquisition_now()))
                    except sqlite3.OperationalError:
                        # Checkout without any acquisition form remains valid.
                        pass
        return {"tracked": True, "duplicate": False, "session_id": session_id, "state": state}

    def list(self, limit=50):
        with self.connect() as db:
            rows = db.execute("SELECT * FROM verified_checkout_orders ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        return [dict(row) for row in rows]


    def work_queue(self, limit=50):
        """Read-only, operator-facing action queue using recorded real events.

        Signed webhook receipts are not the same as an independent Stripe API
        reconciliation or confirmed fulfillment. Join only pre-existing
        first-party inquiry records; missing contact attribution stays missing.
        """
        with self.connect() as db:
            available = {
                row["name"] for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            if {"acquisition_attribution", "acquisition_leads"} <= available:
                relationship = """
                    LEFT JOIN acquisition_attribution a ON a.session_id=o.session_id
                    LEFT JOIN acquisition_leads l ON l.id=a.lead_id
                """
                buyer_columns = """
                    a.lead_id AS lead_id, l.company AS company,
                    l.full_name AS contact_name, l.email AS email,
                    l.crm AS crm, l.marketing_consent AS marketing_consent
                """
            else:
                relationship = ""
                buyer_columns = """
                    NULL AS lead_id, NULL AS company, NULL AS contact_name,
                    NULL AS email, NULL AS crm, NULL AS marketing_consent
                """
            rows = db.execute(f"""
                SELECT o.session_id, o.offer, o.amount_cents, o.currency,
                       o.state, o.created_at, o.updated_at, {buyer_columns}
                FROM verified_checkout_orders o {relationship}
                ORDER BY CASE o.state
                    WHEN 'paid_intake_pending' THEN 0
                    WHEN 'payment_pending' THEN 1
                    ELSE 2 END, o.updated_at DESC
                LIMIT ?
            """, (limit,)).fetchall()
        results = []
        for row in rows:
            state = row["state"]
            paid = state == "paid_intake_pending"
            matched = paid and bool(row["lead_id"]) and bool(row["email"])
            if matched:
                next_action = "coordinate_secure_crm_intake"
                attribution = "matched_first_party_inquiry"
                buyer = {
                    "lead_id": row["lead_id"],
                    "company": row["company"],
                    "contact_name": row["contact_name"],
                    "email": row["email"],
                    "crm": row["crm"],
                    "marketing_consent": bool(row["marketing_consent"]),
                }
            elif paid:
                next_action = "reconcile_checkout_receipt_and_buyer"
                attribution = "missing_first_party_inquiry"
                buyer = None
            elif state == "payment_pending":
                next_action = "await_verified_payment"
                attribution = "not_evaluated_until_paid"
                buyer = None
            else:
                next_action = "do_not_fulfill_payment_failed"
                attribution = "not_evaluated_until_paid"
                buyer = None
            results.append({
                "checkout_session_id": row["session_id"],
                "offer": row["offer"],
                "quoted_amount_cents": row["amount_cents"],
                "paid_amount_cents": row["amount_cents"] if paid else None,
                "currency": row["currency"],
                "payment_state": state,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "attribution_status": attribution,
                "buyer": buyer,
                "next_action": next_action,
                "requires_manual_operator_action": True,
                "fulfillment_confirmation": "not_recorded",
                "independent_stripe_reconciliation": "not_performed",
            })
        return results


def require_operator(x_operator_token: str | None = Header(default=None, alias="X-Operator-Token")):
    expected = os.environ.get("GARCAR_OPERATOR_TOKEN", "")
    if len(expected.encode()) < 32:
        raise HTTPException(503, "Operator authentication not configured")
    if not x_operator_token or not hmac.compare_digest(x_operator_token, expected):
        raise HTTPException(401, "Operator authentication required")


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, stripe_sig: str | None = Header(default=None, alias="Stripe-Signature")):
    secret = os.environ.get("GARCAR_STRIPE_WEBHOOK_SECRET", "")
    if len(secret.encode()) < 32:
        raise HTTPException(503, "Stripe verification is not configured")
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > MAX_BYTES:
                raise HTTPException(413, "Stripe event too large")
        except ValueError:
            raise HTTPException(400, "invalid content length")
    body = await request.body()
    if len(body) > MAX_BYTES:
        raise HTTPException(413, "Stripe event too large")
    _verify(body, stripe_sig or "", secret)
    try:
        event = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(400, "Stripe event must be an object")
    result = Orders(_db_path()).record(event, hashlib.sha256(body).hexdigest())
    return {"received": True, **result}


@router.get("/commerce/readiness", dependencies=[Depends(require_operator)])
async def commerce_readiness():
    """Operator-only configuration evidence, never a claim of paid revenue.

    Local checks do not contact Stripe or attempt checkout. Readiness means the
    existing signing/authentication configuration and local storage directory
    are present; delivery, actual payments and payout capability remain
    separately unverified.
    """
    store = _db_path()
    checks = {
        "operator_auth_configured": len(os.getenv("GARCAR_OPERATOR_TOKEN", "").encode()) >= 32,
        "webhook_verification_configured": len(os.getenv("GARCAR_STRIPE_WEBHOOK_SECRET", "").encode()) >= 32,
        "acquisition_intake_configured": len(os.getenv("GARCAR_ACQUISITION_TOKEN", "").encode()) >= 32,
        "local_storage_directory_accessible": store.parent.is_dir() and os.access(store.parent, os.W_OK),
        "checkout_offer_registry_present": (
            OFFERS.get("plink_1UEcv4FKGbk21LK57hRic0dR") == ("lead_followup_review", 49700)
            and len(OFFERS) >= 3
        ),
    }
    return {
        "state": "configured_unverified" if all(checks.values()) else "not_ready",
        "checks": checks,
        "local_order_store_initialized": store.is_file(),
        "stripe_webhook_delivery": "not_verified_by_this_endpoint",
        "stripe_payment_and_payout": "not_checked",
        "acquisition_to_payment_receipt": "not_verified_by_this_endpoint",
        "fulfillment": "manual_intake_required",
        "synthetic_revenue": False,
    }


@router.get("/commerce/work-queue", dependencies=[Depends(require_operator)])
async def commerce_work_queue(
    response: Response,
    limit: int = Query(default=50, ge=1, le=100),
):
    # Contains buyer-owned contact data; never cache in a public proxy.
    response.headers["Cache-Control"] = "private, no-store"
    rows = Orders(_db_path()).work_queue(limit)
    return {
        "items": rows,
        "returned_count": len(rows),
        "scope": "returned_page_only",
        "source": "signed_checkout_webhook_receipts_plus_real_first_party_inquiries",
        "payment_verification": "webhook_signature_validated_not_independently_reconciled",
        "fulfillment": "manual_approval_and_secure_intake_required",
        "outbound_sent": False,
        "synthetic_data": False,
    }


@router.get("/commerce/orders", dependencies=[Depends(require_operator)])
async def commerce_orders():
    return {"orders": Orders(_db_path()).list(), "source": "verified_stripe_webhooks", "fulfillment": "manual_intake_required"}
