"""First-party, consent-aware acquisition inbox for Garcar's real $497 review.

No lead is invented, emailed, or promoted to a customer. Only requests signed
with the commerce site's private shared token can be stored. All state is
durably stored on the existing Railway /data volume.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

router = APIRouter()
DB_PATH = "/data/garcar-events.sqlite3"
CHECKOUT_URL = "https://buy.stripe.com/8x2eVddjf0hQ86Tf0f43S2h"
MAX_BODY_BYTES = 4096
EMAIL_PATTERN = re.compile(r"^[^@\s\x00-\x1f]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
ATTR_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{0,80}$")
LEAD_PATTERN = re.compile(r"^lead_[a-f0-9]{32}$")
VALID_CRM = {"follow_up_boss", "kvcore", "hubspot", "other", "unsure"}


def now():
    return datetime.now(timezone.utc).isoformat()


def db_path():
    return Path(os.getenv("GARCAR_EVENT_DB_PATH") or DB_PATH)


class AcquisitionStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS acquisition_leads (
                id TEXT PRIMARY KEY,
                identity_hash TEXT NOT NULL UNIQUE,
                company TEXT NOT NULL,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                crm TEXT NOT NULL,
                source TEXT NOT NULL,
                utm_source TEXT NOT NULL,
                utm_medium TEXT NOT NULL,
                utm_campaign TEXT NOT NULL,
                marketing_consent INTEGER NOT NULL,
                state TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                submissions INTEGER NOT NULL DEFAULT 1
            )""")
            db.execute("""CREATE TABLE IF NOT EXISTS acquisition_attribution (
                session_id TEXT PRIMARY KEY, lead_id TEXT NOT NULL,
                attached_at TEXT NOT NULL,
                FOREIGN KEY(lead_id) REFERENCES acquisition_leads(id)
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

    def add(self, item):
        unique = hashlib.sha256((item["email"] + "|" + item["company"].casefold()).encode()).hexdigest()
        timestamp = now()
        with self.connect() as db:
            row = db.execute("SELECT id FROM acquisition_leads WHERE identity_hash=?", (unique,)).fetchone()
            if row:
                db.execute("UPDATE acquisition_leads SET updated_at=?, submissions=submissions+1 WHERE id=?",
                           (timestamp, row["id"]))
                lead_id, duplicate = row["id"], True
            else:
                lead_id, duplicate = "lead_" + secrets.token_hex(16), False
                db.execute("""INSERT INTO acquisition_leads
                    (id, identity_hash, company, full_name, email, crm, source,
                     utm_source, utm_medium, utm_campaign, marketing_consent,
                     state, created_at, updated_at, submissions)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)""",
                    (lead_id, unique, item["company"], item["full_name"], item["email"],
                     item["crm"], "first_party_website", item["utm_source"],
                     item["utm_medium"], item["utm_campaign"],
                     int(item["marketing_consent"]), "inquiry_received", timestamp, timestamp))
        return {"accepted": True, "lead_id": lead_id, "duplicate": duplicate,
                "checkout_url": CHECKOUT_URL + "?client_reference_id=" + lead_id,
                "next_step": "optional_stripe_checkout", "outbound_sent": False}

    def list_leads(self, limit):
        with self.connect() as db:
            rows = db.execute("""SELECT id, company, full_name, email, crm,
                source, utm_source, utm_medium, utm_campaign,
                marketing_consent, state, created_at, updated_at, submissions
                FROM acquisition_leads ORDER BY created_at DESC LIMIT ?""", (limit,)).fetchall()
        return [dict(x) for x in rows]

    def summary(self):
        with self.connect() as db:
            total = db.execute("SELECT COUNT(*) FROM acquisition_leads").fetchone()[0]
            row = db.execute("""SELECT COUNT(DISTINCT a.lead_id), COUNT(*),
                       COALESCE(SUM(o.amount_cents), 0)
                FROM acquisition_attribution a
                JOIN verified_checkout_orders o ON o.session_id=a.session_id
                WHERE o.state='paid_intake_pending'""").fetchone() if self._has_table(db, "verified_checkout_orders") else (0, 0, 0)
        return {"website_inquiries": total, "attributed_buyers": row[0],
                "attributed_paid_orders": row[1], "attributed_paid_amount_cents": row[2],
                "currency": "usd", "source": "verified_first_party_intake_and_stripe_receipts",
                "outbound_messages_sent": 0, "autonomous_outbound_enabled": False}

    @staticmethod
    def _has_table(db, name):
        return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone())


def _validate(raw):
    if not isinstance(raw, dict):
        raise HTTPException(422, "inquiry must be a JSON object")
    fields = ("company", "full_name", "email", "crm", "utm_source", "utm_medium", "utm_campaign")
    if any(not isinstance(raw.get(k, ""), str) for k in fields):
        raise HTTPException(422, "invalid field types")
    company = raw.get("company", "").strip()
    full_name = raw.get("full_name", "").strip()
    email = raw.get("email", "").strip().lower()
    crm = raw.get("crm", "").strip()
    if not 2 <= len(company) <= 120 or not 2 <= len(full_name) <= 100:
        raise HTTPException(422, "invalid contact or company")
    if len(email) > 180 or not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(422, "invalid business email")
    if crm not in VALID_CRM:
        raise HTTPException(422, "unsupported CRM option")
    if raw.get("contact_permission") is not True:
        raise HTTPException(422, "permission to reply to inquiry is required")
    if type(raw.get("marketing_consent", False)) is not bool:
        raise HTTPException(422, "invalid marketing consent")
    out = {"company": company, "full_name": full_name, "email": email, "crm": crm,
           "marketing_consent": raw.get("marketing_consent", False)}
    for field in ("utm_source", "utm_medium", "utm_campaign"):
        value = raw.get(field, "").strip()
        if not ATTR_PATTERN.fullmatch(value):
            raise HTTPException(422, "invalid attribution field")
        out[field] = value
    return out


def _auth(raw_token, env_var, error_msg):
    expected = os.getenv(env_var, "")
    if len(expected.encode()) < 32:
        raise HTTPException(503, error_msg + " is not configured")
    if not raw_token or not hmac.compare_digest(str(raw_token), expected):
        raise HTTPException(401, "authentication required")


def require_operator(x_operator_token: str | None = Header(default=None, alias="X-Operator-Token")):
    _auth(x_operator_token, "GARCAR_OPERATOR_TOKEN", "Operator authentication")


@router.post("/acquisition/intake")
async def intake(request: Request, x_acquisition_token: str | None = Header(default=None, alias="X-Acquisition-Token")):
    _auth(x_acquisition_token, "GARCAR_ACQUISITION_TOKEN", "Acquisition ingress")
    length = request.headers.get("content-length", "")
    if length:
        try:
            if int(length) > MAX_BODY_BYTES:
                raise HTTPException(413, "inquiry too large")
        except ValueError:
            raise HTTPException(400, "invalid content length")
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(413, "inquiry too large")
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "invalid JSON")
    return AcquisitionStore(db_path()).add(_validate(data))


@router.get("/acquisition/leads", dependencies=[Depends(require_operator)])
async def leads(limit: int = Query(default=50, ge=1, le=100)):
    return {"leads": AcquisitionStore(db_path()).list_leads(limit),
            "source": "real_first_party_submissions", "synthetic_data": False}


@router.get("/acquisition/metrics", dependencies=[Depends(require_operator)])
async def metrics():
    return AcquisitionStore(db_path()).summary()
