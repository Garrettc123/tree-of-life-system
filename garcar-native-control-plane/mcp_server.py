"""Local MCP interface for the Garcar control plane.

This server communicates over stdio and delegates to the authenticated local REST API.
It exposes read/plan tools only: there is deliberately no approval or execution tool.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.parse import quote, urlsplit

import httpx
from mcp.server import MCPServer

DEFAULT_CONTROL_PLANE_URL = "http://127.0.0.1:8080"
MAX_PARAMETERS_JSON_BYTES = 32_768
PLAN_ID_PATTERN = re.compile(r"^[0-9a-fA-F-]{1,64}$")

mcp = MCPServer(
    name="Garcar Native Control Plane",
    version="0.1.0",
    instructions=(
        "Use these tools to inspect the local Garcar control plane and prepare governed work plans. "
        "Work-plan creation only records intent. This server intentionally has no tool that approves "
        "or executes a plan. Treat service inventory states marked unverified as unverified."
    ),
    log_level="WARNING",
)


def _base_url() -> str:
    raw = os.getenv("GARCAR_CONTROL_PLANE_URL", DEFAULT_CONTROL_PLANE_URL).strip().rstrip("/")
    try:
        parsed = urlsplit(raw)
        _ = parsed.port
    except ValueError:
        raise RuntimeError("GARCAR_CONTROL_PLANE_URL is not a valid URL") from None

    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("GARCAR_CONTROL_PLANE_URL must be a valid base URL without credentials, query, or fragment")

    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and parsed.hostname not in local_hosts:
        raise RuntimeError("Non-loopback control-plane URLs must use HTTPS")

    return raw


def _operator_token() -> str:
    token = os.getenv("GARCAR_OPERATOR_TOKEN", "")
    if len(token.encode("utf-8")) < 32:
        raise RuntimeError("GARCAR_OPERATOR_TOKEN is missing or shorter than 32 bytes")
    return token


async def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    base_url = _base_url()
    token = _operator_token()
    headers = {
        "Accept": "application/json",
        "X-Operator-Token": token,
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"

    # Do not let environment proxy variables forward the loopback request or operator token.
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
            response = await client.request(method, base_url + path, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Control-plane request failed ({type(exc).__name__})") from None

    if response.status_code >= 400:
        # Do not forward arbitrary upstream response text into the model context.
        raise RuntimeError(f"Control plane returned HTTP {response.status_code} for {path}")

    try:
        result = response.json()
    except ValueError:
        raise RuntimeError("Control plane returned a non-JSON response") from None
    if not isinstance(result, dict):
        raise RuntimeError("Control plane returned an unexpected response shape")
    return result


def _parse_parameters_json(parameters_json: str) -> dict[str, Any]:
    if len(parameters_json.encode("utf-8")) > MAX_PARAMETERS_JSON_BYTES:
        raise ValueError("parameters_json exceeds the 32 KB size limit")
    try:
        parsed = json.loads(parameters_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"parameters_json is not valid JSON at character {exc.pos}") from None
    if not isinstance(parsed, dict):
        raise ValueError("parameters_json must contain a JSON object")
    return parsed


@mcp.tool()
async def get_control_plane_health() -> dict[str, Any]:
    """Check control-plane process liveness. This does not prove external systems are online."""
    return await _request("GET", "/health")


@mcp.tool()
async def get_control_plane_status() -> dict[str, Any]:
    """Read authenticated control-plane and local database status."""
    return await _request("GET", "/api/status")


@mcp.tool()
async def list_services() -> dict[str, Any]:
    """Read service inventory and any configured local health probes; unverified states stay unverified."""
    return await _request("GET", "/api/services")


@mcp.tool()
async def get_recent_audit_events(limit: int = 25) -> dict[str, Any]:
    """Read recent audit events. Limit must be 1–200; details are subject to server-side redaction."""
    if not 1 <= limit <= 200:
        raise ValueError("limit must be between 1 and 200")
    return await _request("GET", f"/api/audit?limit={limit}")


@mcp.tool()
async def verify_audit_chain() -> dict[str, Any]:
    """Verify the local audit hash chain. A successful verification appends a verification audit record."""
    return await _request("GET", "/api/audit/verify")


@mcp.tool()
async def create_work_plan(action: str, parameters_json: str = "{}") -> dict[str, Any]:
    """Record a proposed work plan only; it does not approve, execute, deploy, email, or charge anything.

    Unknown or mutating actions remain approval-required in the control plane. This MCP server
    intentionally has no approval or execution tool.
    """
    action = action.strip()
    if not action or len(action) > 100:
        raise ValueError("action must contain 1–100 characters")
    parameters = _parse_parameters_json(parameters_json)
    return await _request(
        "POST",
        "/api/work/plan",
        {"action": action, "parameters": parameters},
    )


@mcp.tool()
async def get_work_plan(plan_id: str) -> dict[str, Any]:
    """Read a previously stored work plan and its approval/execution state."""
    if not PLAN_ID_PATTERN.fullmatch(plan_id):
        raise ValueError("plan_id has an invalid format")
    return await _request("GET", f"/api/work/{quote(plan_id, safe='')}")


if __name__ == "__main__":
    # MCP stdio owns stdin/stdout; diagnostics should go to stderr, never print to stdout here.
    mcp.run()
