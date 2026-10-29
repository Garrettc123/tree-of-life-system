import hashlib
import hmac
import importlib
import json

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch, dispatch_secret="test-dispatch-secret-that-is-long-enough-32chars", operator_token="operator-test-token-that-is-long-enough-32chars"):
    monkeypatch.setenv("GARCAR_EVENT_DB_PATH", str(tmp_path / "events.sqlite3"))
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    if dispatch_secret is None:
        monkeypatch.delenv("DISPATCH_SECRET", raising=False)
    else:
        monkeypatch.setenv("DISPATCH_SECRET", dispatch_secret)
    if operator_token is None:
        monkeypatch.delenv("GARCAR_OPERATOR_TOKEN", raising=False)
    else:
        monkeypatch.setenv("GARCAR_OPERATOR_TOKEN", operator_token)
    import main as main_module
    importlib.reload(main_module)
    return TestClient(main_module.app), main_module


def sign(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return "sha256=" + digest


def test_health_is_public_and_liveness_only(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "garcar-dispatch"
    assert response.json()["status"] == "ok"


def test_dispatch_fails_closed_when_secret_is_missing(tmp_path, monkeypatch):
    client, module = load_app(tmp_path, monkeypatch, dispatch_secret=None)
    response = client.post("/dispatch", json={"event_type": "rhns.brief"})
    assert response.status_code == 503
    assert module._verify_sig(b"{}", None) is False


def test_invalid_dispatch_signature_is_rejected(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch)
    response = client.post(
        "/dispatch",
        content=b'{"event_type":"rhns.brief"}',
        headers={"Content-Type": "application/json", "X-Dispatch-Sig": "sha256=invalid"},
    )
    assert response.status_code == 403


def test_valid_signed_event_is_queued_and_secrets_are_redacted_for_storage(tmp_path, monkeypatch):
    client, module = load_app(tmp_path, monkeypatch)
    captured = {}
    writes = []

    async def fake_write(event):
        captured.update(event)
        writes.append(event)
        return "local-test-event-id"

    async def fake_route_event(event, event_id, event_log):
        return None

    monkeypatch.setattr(module.event_log, "write", fake_write)
    monkeypatch.setattr(module, "route_event", fake_route_event)

    event = {
        "event_type": "rhns.brief",
        "source_system": "unit_test",
        "trace_id": "trace-123",
        "api_key": "should-not-persist",
        "customer_email": "private@example.com",
        "payload": {
            "client_secret": "also-should-not-persist",
            "email": "nested@example.com",
            "label": "safe",
        },
    }
    body = json.dumps(event, separators=(",", ":")).encode("utf-8")
    response = client.post(
        "/dispatch",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Dispatch-Sig": sign(body, "test-dispatch-secret-that-is-long-enough-32chars"),
        },
    )
    assert response.status_code == 200
    assert response.json()["accepted"] is True
    assert captured["api_key"] == "[REDACTED]"
    assert captured["customer_email"] == "[REDACTED]"
    assert captured["payload"]["client_secret"] == "[REDACTED]"
    assert captured["payload"]["email"] == "[REDACTED]"
    assert captured["payload"]["label"] == "safe"

    replay = client.post(
        "/dispatch",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Dispatch-Sig": sign(body, "test-dispatch-secret-that-is-long-enough-32chars"),
        },
    )
    assert replay.status_code == 409
    assert len(writes) == 1


def test_signed_json_array_is_rejected_as_not_an_event_object(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch)
    body = b"[]"
    response = client.post(
        "/dispatch",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Dispatch-Sig": sign(body, "test-dispatch-secret-that-is-long-enough-32chars"),
        },
    )
    assert response.status_code == 400


def test_event_history_requires_operator_token(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch, operator_token=None)
    assert client.get("/events").status_code == 503


def test_event_history_rejects_wrong_operator_token(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch)
    assert client.get("/events", headers={"X-Operator-Token": "wrong"}).status_code == 401


def test_local_event_log_persists_and_updates_status(tmp_path, monkeypatch):
    import asyncio
    from supabase_log import EventLog

    monkeypatch.setenv("GARCAR_EVENT_DB_PATH", str(tmp_path / "local-log.sqlite3"))
    log = EventLog("", "")
    event_id = asyncio.run(log.write({
        "event_type": "rhns.brief",
        "source_system": "test",
        "trace_id": "trace-local",
    }))
    assert event_id.startswith("local-")
    asyncio.run(log.mark_processed(event_id))
    events = asyncio.run(log.fetch(limit=10))
    assert len(events) == 1
    assert events[0]["id"] == event_id
    assert events[0]["status"] == "processed"



def test_dispatch_rejects_weak_configured_secret(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch, dispatch_secret="weak-secret")
    response = client.post("/dispatch", json={"event_type": "rhns.brief"})
    assert response.status_code == 503


def test_event_history_rejects_weak_configured_operator_token(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch, operator_token="short-token")
    response = client.get("/events", headers={"X-Operator-Token": "short-token"})
    assert response.status_code == 503


def test_external_handlers_remain_disabled_with_credentials_present_by_default(tmp_path, monkeypatch):
    import asyncio

    monkeypatch.delenv("GARCAR_ENABLE_EXTERNAL_HANDLERS", raising=False)
    for key, value in {
        "LINEAR_API_KEY": "test-linear-key",
        "LINEAR_REVENUE_ISSUE_ID": "test-linear-issue",
        "NOTION_API_KEY": "test-notion-key",
        "NOTION_REVENUE_DB_ID": "test-notion-database",
        "GITHUB_PAT": "test-github-token",
        "LINEAR_TEAM_ID": "test-linear-team",
    }.items():
        monkeypatch.setenv(key, value)

    import handlers.stripe_payment as stripe_module
    import handlers.github_ci as github_module
    import handlers.rhns_alert as alert_module

    importlib.reload(stripe_module)
    importlib.reload(github_module)
    importlib.reload(alert_module)

    calls = []

    async def record_call(name, *args, **kwargs):
        calls.append(name)

    monkeypatch.setattr(stripe_module, "_comment_linear", lambda *args, **kwargs: record_call("linear"))
    monkeypatch.setattr(stripe_module, "_log_notion", lambda *args, **kwargs: record_call("notion"))
    monkeypatch.setattr(github_module, "_open_issue", lambda *args, **kwargs: record_call("github_issue"))
    monkeypatch.setattr(github_module, "_create_linear_incident", lambda *args, **kwargs: record_call("linear_incident"))
    monkeypatch.setattr(alert_module, "_open_issue", lambda *args, **kwargs: record_call("alert_issue"))
    monkeypatch.setattr(alert_module, "_create_p0", lambda *args, **kwargs: record_call("alert_linear"))

    asyncio.run(stripe_module.handle({
        "event_type": "stripe.payment_intent_succeeded",
        "payload": {"amount_total": 500, "currency": "usd", "customer_email": "private@example.com"},
        "trace_id": "trace-stripe",
    }, "event-stripe"))
    asyncio.run(github_module.handle({
        "status": "failure", "repo": "demo/repo", "branch": "main", "trace_id": "trace-ci"
    }, "event-ci"))
    asyncio.run(alert_module.handle({
        "service": "demo", "error": "synthetic", "severity": "critical", "trace_id": "trace-alert"
    }, "event-alert"))

    assert calls == []
