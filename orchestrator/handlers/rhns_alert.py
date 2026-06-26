import logging
import os

import httpx

log = logging.getLogger("handler.rhns_alert")

GITHUB_TOKEN = os.getenv("GITHUB_PAT", "")
ALERT_REPO = os.getenv("ALERT_GITHUB_REPO", "Garrettc123/garcar-rhns-core")
LINEAR_API_KEY = os.getenv("LINEAR_API_KEY", "")
LINEAR_TEAM_ID = os.getenv("LINEAR_TEAM_ID", "")


async def handle(event: dict, event_id: str):
    service = event.get("service", "unknown")
    error = event.get("error", "no details")
    severity = event.get("severity", "warning")
    trace = event.get("trace_id", event_id)

    log.info("rhns_alert service=%s severity=%s trace=%s", service, severity, trace)

    if severity in ("critical", "error"):
        if GITHUB_TOKEN:
            await _open_issue(service, error, trace)
        if LINEAR_API_KEY and LINEAR_TEAM_ID:
            await _create_p0(service, error, trace)


async def _open_issue(service: str, error: str, trace: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                f"https://api.github.com/repos/{ALERT_REPO}/issues",
                json={
                    "title": f"[ALERT] {service} degraded",
                    "body": f"**Error:** {error}\n**Trace:** `{trace}`\n\n*Auto-created by garcar-dispatch*",
                    "labels": ["incident", "automated"],
                },
                headers={
                    "Authorization": f"Bearer {GITHUB_TOKEN}",
                    "Accept": "application/vnd.github+json",
                },
            )
            r.raise_for_status()
    except Exception as e:
        log.warning("gh_issue_failed err=%s", e)


async def _create_p0(service: str, error: str, trace: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                "https://api.linear.app/graphql",
                json={
                    "query": "mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{identifier}}}",
                    "variables": {
                        "i": {
                            "teamId": LINEAR_TEAM_ID,
                            "title": f"P0 — {service} degraded",
                            "description": f"{error}\n\ntrace=`{trace}`",
                            "priority": 1,
                        }
                    },
                },
                headers={"Authorization": LINEAR_API_KEY},
            )
            r.raise_for_status()
    except Exception as e:
        log.warning("linear_p0_failed err=%s", e)
