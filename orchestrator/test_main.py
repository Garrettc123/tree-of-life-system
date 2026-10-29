import hashlib
import hmac
import importlib
import json

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch, dispatch_secret="test-dispatch-secret", operator_token="operator-test-token"):
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

    async def fake_write(event):
        captured.update(event)
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
        "payload": {"client_secret": "also-should-not-persist", "label": "safe"},
    }
    body = json.dumps(event, separators=(",", ":")).encode("utf-8")
    response = client.post(
        "/dispatch",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Dispatch-Sig": sign(body, "test-dispatch-secret"),
        },
    )
    assert response.status_code == 200
    assert response.json()["accepted"] is True
    assert captured["api_key"] == "[REDACTED]"
    assert captured["payload"]["client_secret"] == "[REDACTED]"
    assert captured["payload"]["label"] == "safe"


def test_signed_json_array_is_rejected_as_not_an_event_object(tmp_path, monkeypatch):
    client, _ = load_app(tmp_path, monkeypatch)
    body = b"[]"
    response = client.post(
        "/dispatch",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Dispatch-Sig": sign(body, "test-dispatch-secret"),
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
