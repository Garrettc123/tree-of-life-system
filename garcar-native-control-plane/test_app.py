import importlib

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


def test_console_is_served_from_same_origin(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    response = client.get("/console")
    assert response.status_code == 200
    assert "Native Control Console" in response.text


def test_protected_api_fails_closed_without_token_configured(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch, token=None)
    response = client.get("/api/status")
    assert response.status_code == 503


def test_protected_api_rejects_wrong_token(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    response = client.get("/api/status", headers={"X-Operator-Token": "wrong"})
    assert response.status_code == 401


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


def test_plan_requires_confirmation_and_never_enables_mutation(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token"}
    plan = client.post(
        "/api/work/plan",
        json={"action": "deploy_production", "parameters": {"environment": "production"}},
        headers=headers,
    )
    assert plan.status_code == 200
    plan_id = plan.json()["plan_id"]
    assert plan.json()["requires_approval"] is True
    assert plan.json()["executable_now"] is False

    rejected = client.post(
        f"/api/work/{plan_id}/approve",
        json={"confirmation": "yes"},
        headers=headers,
    )
    assert rejected.status_code == 400

    approved = client.post(
        f"/api/work/{plan_id}/approve",
        json={"confirmation": f"APPROVE {plan_id}"},
        headers=headers,
    )
    assert approved.status_code == 200
    assert approved.json()["approval_recorded"] is True
    assert approved.json()["execution_enabled"] is False

    saved = client.get(f"/api/work/{plan_id}", headers=headers)
    assert saved.status_code == 200
    assert saved.json()["status"] == "approved_not_executable"
    assert saved.json()["execution_enabled"] is False

    execution = client.post(
        "/api/work/execute",
        json={"action": "deploy_production"},
        headers=headers,
    )
    assert execution.status_code == 403


def test_sensitive_plan_parameters_are_redacted_before_storage(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token"}
    plan = client.post(
        "/api/work/plan",
        json={
            "action": "send_customer_email",
            "parameters": {
                "recipient": "customer@example.com",
                "api_key": "never-store-this",
                "nested": {"client_secret": "also-secret"},
            },
        },
        headers=headers,
    )
    assert plan.status_code == 200
    payload = plan.json()
    assert payload["parameters"]["api_key"] == "[REDACTED]"
    assert payload["parameters"]["nested"]["client_secret"] == "[REDACTED]"
    assert "never-store-this" not in str(payload)
    assert "also-secret" not in str(payload)

    saved = client.get(f"/api/work/{payload['plan_id']}", headers=headers)
    assert saved.status_code == 200
    assert saved.json()["parameters"]["api_key"] == "[REDACTED]"


def test_status_reports_database_and_local_mode(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    response = client.get("/api/status", headers={"X-Operator-Token": "ci-test-token"})
    assert response.status_code == 200
    assert response.json()["database"] == "available"
    assert response.json()["mode"] == "local_self_hosted"
    assert response.json()["external_services_verified"] is False
