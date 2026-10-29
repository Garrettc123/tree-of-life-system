import importlib
import os

from fastapi.testclient import TestClient


def build_client(tmp_path, monkeypatch, token="ci-test-token"):
    monkeypatch.setenv("GARCAR_DB_PATH", str(tmp_path / "test.sqlite3"))
    if token is None:
        monkeypatch.delenv("GARCAR_OPERATOR_TOKEN", raising=False)
    else:
        monkeypatch.setenv("GARCAR_OPERATOR_TOKEN", token)
    import app as app_module
    importlib.reload(app_module)
    return TestClient(app_module.app), app_module


def test_health_is_public_and_reports_identity(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "garcar-native-control-plane"


def test_protected_api_fails_closed_without_token_configured(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch, token=None)
    response = client.get("/api/status")
    assert response.status_code == 503


def test_read_only_action_can_execute_and_is_audited(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token"}
    response = client.post("/api/work/execute", json={"action": "health_check"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["executed"] is True
    audit = client.get("/api/audit", headers=headers)
    assert audit.status_code == 200
    assert any(event["event_type"] == "read_only_work_executed" for event in audit.json()["events"])


def test_mutating_or_unknown_action_is_blocked(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/work/execute",
        json={"action": "deploy_production"},
        headers={"X-Operator-Token": "ci-test-token"},
    )
    assert response.status_code == 403
    assert "no action was executed" in response.json()["detail"]


def test_plan_marks_unknown_actions_as_approval_required(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/work/plan",
        json={"action": "send_customer_email"},
        headers={"X-Operator-Token": "ci-test-token"},
    )
    assert response.status_code == 200
    assert response.json()["requires_approval"] is True
    assert response.json()["executable_now"] is False
