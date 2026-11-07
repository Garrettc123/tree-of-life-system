"""Security and idempotency regressions for live Stripe checkout intake."""
import hashlib
import hmac
import json
import os
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from revenue_webhook import Orders, router

TEST_SECRET = "whsec_" + "a" * 64
OP_TOKEN = "operator-token-minimum-32-character-secret"
LINK = "plink_1UEcv4FKGbk21LK57hRic0dR"
SESSION = "cs_live_1234567890abcdefgh"


def event(event_id="evt_1234567890", status="paid",
          etype="checkout.session.completed", **updates):
    obj = {"id": SESSION, "object": "checkout.session", "payment_link": LINK,
           "amount_total": 49700, "currency": "usd", "mode": "payment",
           "payment_status": status,
           "customer_details": {"email": "never-store@private.test"}}
    obj.update(updates)
    return {"id": event_id, "type": etype, "livemode": True, "data": {"object": obj}}


def signed(raw, stamp=None):
    stamp = stamp or int(time.time())
    digest = hmac.new(TEST_SECRET.encode(), f"{stamp}.".encode() + raw, hashlib.sha256).hexdigest()
    return f"t={stamp},v1={digest}"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GARCAR_EVENT_DB_PATH", str(tmp_path / "orders.sqlite3"))
    monkeypatch.setenv("GARCAR_STRIPE_WEBHOOK_SECRET", TEST_SECRET)
    monkeypatch.setenv("GARCAR_OPERATOR_TOKEN", OP_TOKEN)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def submit(client, data, signature=None):
    raw = json.dumps(data, separators=(",", ":")).encode()
    return client.post("/webhooks/stripe", content=raw,
                       headers={"Stripe-Signature": signature or signed(raw)})


def test_unsigned_and_invalid_signatures_fail_closed(client):
    assert client.post("/webhooks/stripe", json=event()).status_code == 403
    assert submit(client, event(), signature="t=123,v1=" + "0" * 64).status_code == 403


def test_valid_paid_session_creates_minimal_durable_receipt(client):
    r = submit(client, event())
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "paid_intake_pending"
    assert client.get("/commerce/orders").status_code == 401
    reply = client.get("/commerce/orders", headers={"X-Operator-Token": OP_TOKEN})
    assert reply.status_code == 200
    assert "never-store@private.test" not in json.dumps(reply.json())
    assert len(reply.json()["orders"]) == 1
    assert submit(client, event()).json()["duplicate"] is True
    assert len(Orders(Path(os.environ["GARCAR_EVENT_DB_PATH"])).list()) == 1


def test_payment_status_promotion_does_not_downgrade(client):
    assert submit(client, event(status="unpaid")).json()["state"] == "payment_pending"
    assert submit(client, event(event_id="evt_1234567891", etype="checkout.session.async_payment_succeeded")).json()["state"] == "paid_intake_pending"
    assert submit(client, event(event_id="evt_1234567892", etype="checkout.session.async_payment_failed", status="unpaid")).json()["state"] == "paid_intake_pending"


def test_unknown_link_or_wrong_amount_never_counts_as_sale(client):
    assert submit(client, event(payment_link="plink_1NOTOURPRODUCT000")).json()["tracked"] is False
    assert submit(client, event(amount_total=500)).json()["tracked"] is False
    assert client.get("/commerce/orders", headers={"X-Operator-Token": OP_TOKEN}).json()["orders"] == []


def test_rejects_expired_signature(client):
    raw = json.dumps(event()).encode()
    r = client.post("/webhooks/stripe", content=raw,
                    headers={"Stripe-Signature": signed(raw, stamp=int(time.time()) - 900)})
    assert r.status_code == 403


def test_testmode_never_counts_as_live_sale(client):
    data = event()
    data["livemode"] = False
    assert submit(client, data).json()["tracked"] is False


def test_missing_secret_is_not_an_open_webhook(client, monkeypatch):
    monkeypatch.delenv("GARCAR_STRIPE_WEBHOOK_SECRET")
    assert submit(client, event()).status_code == 503


def test_large_body_is_rejected(client):
    assert client.post("/webhooks/stripe", content="a" * 256001).status_code == 413
