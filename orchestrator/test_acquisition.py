"""Isolated regression fixtures, never production leads or Stripe activity."""
import json
import os
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from acquisition import AcquisitionStore, router
from revenue_webhook import Orders

SECRET = "a" * 48
OPERATOR = "b" * 48
PAYMENT_LINK = "plink_1UEcv4FKGbk21LK57hRic0dR"


@pytest.fixture
def context(tmp_path, monkeypatch):
    monkeypatch.setenv("GARCAR_EVENT_DB_PATH", str(tmp_path / "acquisition.sqlite3"))
    monkeypatch.setenv("GARCAR_ACQUISITION_TOKEN", SECRET)
    monkeypatch.setenv("GARCAR_OPERATOR_TOKEN", OPERATOR)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def inquiry(**updates):
    data = {
        "company": "Example Real Estate Team", "full_name": "Test Operator",
        "email": "inbox@example.test", "crm": "follow_up_boss",
        "contact_permission": True, "marketing_consent": False,
        "utm_source": "organic", "utm_medium": "website",
        "utm_campaign": "dfw_followup_497",
    }
    data.update(updates)
    return data


def submit(context, payload=None, authorized=True):
    headers = {"X-Acquisition-Token": SECRET} if authorized else {}
    return context.post("/acquisition/intake", headers=headers,
                        json=payload if payload is not None else inquiry())


def test_ingress_is_not_public(context):
    assert submit(context, authorized=False).status_code == 401
    assert context.get("/acquisition/leads").status_code == 401


def test_actual_inquiry_stored_privately_and_checkout_attributed(context):
    response = submit(context)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["lead_id"].startswith("lead_")
    assert data["checkout_url"].endswith("client_reference_id=" + data["lead_id"])
    assert data["outbound_sent"] is False
    lead = context.get("/acquisition/leads", headers={"X-Operator-Token": OPERATOR}).json()["leads"][0]
    assert lead["email"] == "inbox@example.test"
    assert lead["utm_source"] == "organic"
    assert lead["marketing_consent"] == 0


def test_repeat_inquiry_updates_current_consent_and_contact_without_new_lead(context):
    first = submit(context, inquiry(marketing_consent=True)).json()
    assert first["duplicate"] is False
    repeat = submit(context, inquiry(
        full_name="Updated Contact", crm="hubspot",
        marketing_consent=False, utm_source="referral"
    )).json()
    assert repeat["accepted"] is True
    assert repeat["duplicate"] is True
    assert repeat["lead_id"] == first["lead_id"]

    rows = context.get("/acquisition/leads",
        headers={"X-Operator-Token": OPERATOR}).json()["leads"]
    assert len(rows) == 1
    latest = rows[0]
    assert latest["full_name"] == "Updated Contact"
    assert latest["crm"] == "hubspot"
    assert latest["marketing_consent"] == 0
    assert latest["submissions"] == 2
    # Preserve original acquisition attribution (first touch), not a
    # newly claimed source or new revenue when one person resubmits.
    assert latest["utm_source"] == "organic"
    assert latest["state"] == "inquiry_received"
    assert AcquisitionStore(os.environ["GARCAR_EVENT_DB_PATH"]).summary()["attributed_paid_orders"] == 0


def test_latest_explicit_opt_in_does_not_create_a_new_person(context):
    lead = submit(context, inquiry(marketing_consent=False)).json()
    repeat = submit(context, inquiry(marketing_consent=True)).json()
    assert repeat["lead_id"] == lead["lead_id"]
    record = context.get("/acquisition/leads",
        headers={"X-Operator-Token": OPERATOR}).json()["leads"][0]
    assert record["marketing_consent"] == 1
    assert record["submissions"] == 2


def test_deduplication_and_no_synthetic_revenue(context):
    one = submit(context).json()
    two = submit(context).json()
    assert one["lead_id"] == two["lead_id"]
    assert two["duplicate"] is True
    metrics = context.get("/acquisition/metrics", headers={"X-Operator-Token": OPERATOR}).json()
    assert metrics["website_inquiries"] == 1
    assert metrics["attributed_paid_orders"] == 0
    assert metrics["outbound_messages_sent"] == 0


@pytest.mark.parametrize("bad", [
    {"contact_permission": False}, {"email": "bad"},
    {"company": ""}, {"crm": "unsupported"},
    {"marketing_consent": "yes"}, {"utm_source": "x" * 81},
])
def test_rejects_invalid_or_unconsented_inquiries(context, bad):
    assert submit(context, inquiry(**bad)).status_code == 422


def test_payment_proof_binds_only_existing_lead(context):
    lead_id = submit(context).json()["lead_id"]
    store = Orders(os.environ["GARCAR_EVENT_DB_PATH"])
    base = {"object": "checkout.session", "id": "cs_live_" + "a" * 24,
            "payment_link": PAYMENT_LINK, "amount_total": 49700,
            "currency": "usd", "mode": "payment", "payment_status": "paid",
            "client_reference_id": lead_id}
    result = store.record({"id": "evt_" + "a" * 18, "livemode": True,
                           "type": "checkout.session.completed", "data": {"object": base}},
                          "f" * 64)
    assert result["state"] == "paid_intake_pending"
    metrics = AcquisitionStore(os.environ["GARCAR_EVENT_DB_PATH"]).summary()
    assert metrics["attributed_paid_orders"] == 1
    assert metrics["attributed_paid_amount_cents"] == 49700
    bogus = {**base, "id": "cs_live_" + "b" * 24, "client_reference_id": "lead_" + "b" * 32}
    store.record({"id": "evt_" + "b" * 18, "livemode": True,
                  "type": "checkout.session.completed", "data": {"object": bogus}},
                 "b" * 64)
    assert AcquisitionStore(os.environ["GARCAR_EVENT_DB_PATH"]).summary()["attributed_paid_orders"] == 1
