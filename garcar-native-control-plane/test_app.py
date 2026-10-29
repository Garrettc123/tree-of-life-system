import importlib

import pytest
from fastapi.testclient import TestClient


def build_client(tmp_path, monkeypatch, token="ci-test-token-that-is-at-least-32-chars"):
    monkeypatch.setenv("GARCAR_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.delenv("GARCAR_ORCHESTRATOR_HEALTH_URL", raising=False)
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
    headers = {"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"}
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
        headers={"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"},
    )
    assert response.status_code == 403
    assert "no action was executed" in response.json()["detail"]


def test_plan_requires_confirmation_and_never_enables_mutation(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"}
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
    headers = {"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"}
    plan = client.post(
        "/api/work/plan",
        json={
            "action": "send_customer_email",
            "parameters": {
                "recipient": "customer@example.com",
                "customer_email": "private@example.com",
                "phone": "+1-555-0100",
                "api_key": "never-store-this",
                "nested": {"client_secret": "also-secret", "email": "nested@example.com"},
            },
        },
        headers=headers,
    )
    assert plan.status_code == 200
    payload = plan.json()
    assert payload["parameters"]["api_key"] == "[REDACTED]"
    assert payload["parameters"]["customer_email"] == "[REDACTED]"
    assert payload["parameters"]["phone"] == "[REDACTED]"
    assert payload["parameters"]["nested"]["client_secret"] == "[REDACTED]"
    assert payload["parameters"]["nested"]["email"] == "[REDACTED]"
    assert "never-store-this" not in str(payload)
    assert "also-secret" not in str(payload)

    saved = client.get(f"/api/work/{payload['plan_id']}", headers=headers)
    assert saved.status_code == 200
    assert saved.json()["parameters"]["api_key"] == "[REDACTED]"


def test_status_reports_database_and_local_mode(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    response = client.get("/api/status", headers={"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"})
    assert response.status_code == 200
    assert response.json()["database"] == "available"
    assert response.json()["mode"] == "local_self_hosted"
    assert response.json()["external_services_checked_by_this_endpoint"] is False



def test_audit_hash_chain_verifies(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"}
    assert client.get("/api/status", headers=headers).status_code == 200
    response = client.get("/api/audit/verify", headers=headers)
    assert response.status_code == 200
    assert response.json()["valid"] is True
    assert response.json()["events_checked"] >= 2


def test_audit_hash_chain_detects_record_tampering(tmp_path, monkeypatch):
    client, app_module = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"}
    assert client.get("/api/status", headers=headers).status_code == 200

    with app_module.connect_db() as db:
        db.execute(
            "UPDATE audit_events SET detail_json = ? WHERE rowid = (SELECT MIN(rowid) FROM audit_events)",
            ('{"tampered":true}',),
        )

    response = client.get("/api/audit/verify", headers=headers)
    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert response.json()["failed_event_id"]



def test_service_inventory_does_not_probe_unapproved_external_url(tmp_path, monkeypatch):
    client, app_module = build_client(tmp_path, monkeypatch)
    monkeypatch.setenv("GARCAR_ORCHESTRATOR_HEALTH_URL", "https://example.com/health")
    importlib.reload(app_module)
    client = TestClient(app_module.app)
    response = client.get("/api/services", headers={"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"})
    assert response.status_code == 200
    services = {item["name"]: item for item in response.json()["services"]}
    assert services["orchestrator"]["status"] == "invalid_health_url_config"



def test_audit_verifier_does_not_repair_a_deleted_hash(tmp_path, monkeypatch):
    client, app_module = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"}
    assert client.get("/api/status", headers=headers).status_code == 200

    with app_module.connect_db() as db:
        db.execute(
            "UPDATE audit_events SET event_hash = NULL WHERE rowid = (SELECT MAX(rowid) FROM audit_events)"
        )

    response = client.get("/api/audit/verify", headers=headers)
    assert response.status_code == 200
    assert response.json()["valid"] is False



def test_protected_api_rejects_weak_configured_operator_token(tmp_path, monkeypatch):
    client, _ = build_client(tmp_path, monkeypatch, token="short-token")
    response = client.get(
        "/api/status",
        headers={"X-Operator-Token": "short-token"},
    )
    assert response.status_code == 503



def test_audit_append_refuses_to_extend_a_corrupted_earlier_record(tmp_path, monkeypatch):
    client, app_module = build_client(tmp_path, monkeypatch)
    headers = {"X-Operator-Token": "ci-test-token-that-is-at-least-32-chars"}
    assert client.get("/api/status", headers=headers).status_code == 200

    with app_module.connect_db() as db:
        db.execute(
            "UPDATE audit_events SET detail_json = ? WHERE rowid = (SELECT MIN(rowid) FROM audit_events)",
            ('{"changed":true}',),
        )

    with pytest.raises(RuntimeError, match="Audit chain fails verification"):
        app_module.audit("operator", "must_not_append", {})
