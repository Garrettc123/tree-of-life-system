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
from acquisition import AcquisitionStore

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


def test_commerce_readiness_requires_operator_and_never_claims_payment(client, monkeypatch):
    assert client.get("/commerce/readiness").status_code == 401
    headers = {"X-Operator-Token": OP_TOKEN}
    monkeypatch.setenv("GARCAR_ACQUISITION_TOKEN", "a" * 48)
    response = client.get("/commerce/readiness", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["state"] == "configured_unverified"
    assert all(data["checks"].values())
    assert data["local_order_store_initialized"] is False
    assert data["stripe_webhook_delivery"] == "not_verified_by_this_endpoint"
    assert data["stripe_payment_and_payout"] == "not_checked"
    assert data["fulfillment"] == "manual_intake_required"
    assert TEST_SECRET not in response.text
    assert OP_TOKEN not in response.text

    monkeypatch.delenv("GARCAR_STRIPE_WEBHOOK_SECRET")
    missing = client.get("/commerce/readiness", headers=headers).json()
    assert missing["state"] == "not_ready"
    assert missing["checks"]["webhook_verification_configured"] is False
    assert missing["stripe_payment_and_payout"] == "not_checked"


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


def test_operator_paid_work_queue_matches_real_inquiry_only(client):
    assert client.get("/commerce/work-queue").status_code == 401
    assert client.get("/commerce/work-queue", headers={
        "X-Operator-Token": OP_TOKEN}, params={"limit": 101}).status_code == 422

    # Isolated TEST fixture: not connected to production lead or Stripe data.
    existing_lead = AcquisitionStore(os.environ["GARCAR_EVENT_DB_PATH"]).add({
        "company": "Fixture Roof Service",
        "full_name": "Fixture Buyer",
        "email": "fixture-buyer@example.test",
        "crm": "other",
        "utm_source": "referral",
        "utm_medium": "direct",
        "utm_campaign": "test",
        "marketing_consent": False,
    })
    receipt = event(client_reference_id=existing_lead["lead_id"])
    assert submit(client, receipt).json()["state"] == "paid_intake_pending"
    headers = {"X-Operator-Token": OP_TOKEN}
    response = client.get("/commerce/work-queue", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("cache-control") == "private, no-store"
    body = response.json()
    assert body["returned_count"] == 1
    assert body["synthetic_data"] is False
    assert body["outbound_sent"] is False
    assert body["payment_verification"] == "webhook_signature_validated_not_independently_reconciled"
    row = body["items"][0]
    assert row["payment_state"] == "paid_intake_pending"
    assert row["paid_amount_cents"] == 49700
    assert row["attribution_status"] == "matched_first_party_inquiry"
    assert row["buyer"]["lead_id"] == existing_lead["lead_id"]
    assert row["buyer"]["company"] == "Fixture Roof Service"
    assert row["buyer"]["email"] == "fixture-buyer@example.test"
    assert row["buyer"]["marketing_consent"] is False
    assert row["next_action"] == "coordinate_secure_crm_intake"
    assert row["requires_manual_operator_action"] is True
    assert row["fulfillment_confirmation"] == "not_recorded"
    assert row["independent_stripe_reconciliation"] == "not_performed"
    # Existing minimal /commerce/orders stays non-PII, backwards compatible.
    minimal = client.get("/commerce/orders", headers=headers).json()
    assert "fixture-buyer@example.test" not in json.dumps(minimal)


def test_work_queue_flags_unattributed_paid_and_unsettled_orders_without_buyers(client):
    h = {"X-Operator-Token": OP_TOKEN}
    paid = event(client_reference_id="lead_" + "b" * 32)
    assert submit(client, paid).json()["state"] == "paid_intake_pending"
    pending = event(event_id="evt_" + "p" * 18,
                    id="cs_live_" + "p" * 18, status="unpaid",
                    client_reference_id="lead_" + "c" * 32)
    assert submit(client, pending).json()["state"] == "payment_pending"
    failed = event(event_id="evt_" + "f" * 18,
                   id="cs_live_" + "f" * 18, status="unpaid",
                   etype="checkout.session.async_payment_failed")
    assert submit(client, failed).json()["state"] == "payment_failed"
    queue = client.get("/commerce/work-queue", headers=h).json()["items"]
    assert [r["payment_state"] for r in queue] == [
        "paid_intake_pending", "payment_pending", "payment_failed"]
    assert queue[0]["next_action"] == "reconcile_checkout_receipt_and_buyer"
    assert queue[0]["attribution_status"] == "missing_first_party_inquiry"
    assert queue[0]["buyer"] is None
    for row in queue[1:]:
        assert row["paid_amount_cents"] is None
        assert row["buyer"] is None
        assert row["requires_manual_operator_action"] is True
    assert queue[1]["next_action"] == "await_verified_payment"
    assert queue[2]["next_action"] == "do_not_fulfill_payment_failed"


def test_work_queue_handles_no_acquisition_table_or_receipts(client):
    h = {"X-Operator-Token": OP_TOKEN}
    empty = client.get("/commerce/work-queue", headers=h).json()
    assert empty["items"] == []
    assert empty["returned_count"] == 0
    assert submit(client, event()).json()["state"] == "paid_intake_pending"
    unmatched = client.get("/commerce/work-queue", headers=h).json()["items"][0]
    assert unmatched["buyer"] is None
    assert unmatched["attribution_status"] == "missing_first_party_inquiry"



def test_payment_status_promotion_does_not_downgrade(client):
    assert submit(client, event(status="unpaid")).json()["state"] == "payment_pending"
    assert submit(client, event(event_id="evt_1234567891", etype="checkout.session.async_payment_succeeded")).json()["state"] == "paid_intake_pending"
    assert submit(client, event(event_id="evt_1234567892", etype="checkout.session.async_payment_failed", status="unpaid")).json()["state"] == "paid_intake_pending"


def test_unknown_link_or_wrong_amount_never_counts_as_sale(client):
    assert submit(client, event(payment_link="plink_1NOTOURPRODUCT000")).json()["tracked"] is False
    assert submit(client, event(amount_total=500)).json()["tracked"] is False
    assert client.get("/commerce/orders", headers={"X-Operator-Token": OP_TOKEN}).json()["orders"] == []



@pytest.mark.parametrize(("payment_link","amount_cents"), [
    ("plink_1UEcv4FKGbk21LK57hRic0dR", 49700),
    ("plink_1UGpMIFKGbk21LK5RHl8asRI", 250000),
    ("plink_1UExqpFKGbk21LK5PHxGbDRd", 250000),
])
def test_verified_active_stripe_payment_links_are_tracked(client, payment_link, amount_cents):
    """Regression: both active installation links must reach verified fulfillment."""
    response = submit(client, event(payment_link=payment_link, amount_total=amount_cents))
    assert response.status_code == 200, response.text
    assert response.json()["tracked"] is True
    assert response.json()["state"] == "paid_intake_pending"
    orders = client.get("/commerce/orders", headers={"X-Operator-Token": OP_TOKEN}).json()["orders"]
    assert len(orders) == 1
    assert orders[0]["payment_link"] == payment_link
    assert orders[0]["amount_cents"] == amount_cents
    assert submit(client, event(event_id="evt_1234567891",
                                payment_link=payment_link,
                                amount_total=amount_cents + 1)).json()["tracked"] is False


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
