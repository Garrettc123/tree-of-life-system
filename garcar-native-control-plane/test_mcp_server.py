import pytest
from mcp import Client

import mcp_server


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_status_tool_calls_authenticated_status_endpoint(monkeypatch):
    calls = []
    expected = {
        "control_plane": "available",
        "mode": "local_self_hosted",
        "database": "available",
        "spending_authorized": False,
    }

    async def fake_request(method, path, payload=None):
        calls.append((method, path, payload))
        return expected

    monkeypatch.setattr(mcp_server, "_request", fake_request)
    async with Client(mcp_server.mcp, raise_exceptions=True) as client:
        result = await client.call_tool("get_control_plane_status", {})

    assert result.structured_content == expected
    assert calls == [("GET", "/api/status", None)]


@pytest.mark.anyio
async def test_plan_tool_records_a_plan_but_never_executes_it(monkeypatch):
    calls = []
    plan = {
        "plan_id": "6e1d4d31-4d45-44ac-b28e-8e06c2b0e1d4",
        "action": "deploy_production",
        "status": "approval_required",
        "requires_approval": True,
        "executable_now": False,
        "external_side_effects": False,
    }

    async def fake_request(method, path, payload=None):
        calls.append((method, path, payload))
        return plan

    monkeypatch.setattr(mcp_server, "_request", fake_request)
    async with Client(mcp_server.mcp, raise_exceptions=True) as client:
        result = await client.call_tool(
            "create_work_plan",
            {
                "action": "deploy_production",
                "parameters_json": '{"environment":"production","api_key":"redaction-is-server-side"}',
            },
        )

    assert result.structured_content == plan
    assert calls == [(
        "POST",
        "/api/work/plan",
        {"action": "deploy_production", "parameters": {"environment": "production", "api_key": "redaction-is-server-side"}},
    )]
    assert not any(path == "/api/work/execute" for _, path, _ in calls)
    assert not any(path.endswith("/approve") for _, path, _ in calls)


def test_plan_parameter_parser_rejects_non_object_and_oversized_input():
    with pytest.raises(ValueError, match="JSON object"):
        mcp_server._parse_parameters_json("[]")
    with pytest.raises(ValueError, match="32 KB"):
        mcp_server._parse_parameters_json('{"padding":"' + ("x" * 33_000) + '"}')


def test_remote_http_control_plane_url_is_rejected(monkeypatch):
    monkeypatch.setenv("GARCAR_CONTROL_PLANE_URL", "http://control.example:8080")
    with pytest.raises(RuntimeError, match="must use HTTPS"):
        mcp_server._base_url()


def test_short_operator_token_is_rejected_before_request(monkeypatch):
    monkeypatch.setenv("GARCAR_OPERATOR_TOKEN", "short")
    with pytest.raises(RuntimeError, match="shorter than 32 bytes"):
        mcp_server._operator_token()



@pytest.mark.anyio
async def test_mcp_surface_has_no_approval_or_execution_tools():
    async with Client(mcp_server.mcp, raise_exceptions=True) as client:
        result = await client.list_tools()
    names = {tool.name for tool in result.tools}
    assert {
        "get_control_plane_health",
        "get_control_plane_status",
        "list_services",
        "get_recent_audit_events",
        "verify_audit_chain",
        "create_work_plan",
        "get_work_plan",
    } <= names
    assert "approve_plan" not in names
    assert "execute_work" not in names
