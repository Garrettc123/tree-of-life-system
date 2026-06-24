import logging
import os

import httpx

log = logging.getLogger("handler.github_ci")

LINEAR_API_KEY = os.getenv("LINEAR_API_KEY", "")
LINEAR_TEAM_ID = os.getenv("LINEAR_TEAM_ID", "")
GITHUB_TOKEN = os.getenv("GITHUB_PAT", "")
ALERT_REPO = os.getenv("ALERT_GITHUB_REPO", "Garrettc123/garcar-rhns-core")


async def handle(event: dict, event_id: str):
    status = event.get("status", "unknown")
    repo = event.get("repo", "unknown")
    branch = event.get("branch", "unknown")
    run_url = event.get("run_url", "")
    sha = (event.get("commit_sha") or "")[:8]
    trace = event.get("trace_id", event_id)

    log.info("github_ci repo=%s branch=%s status=%s trace=%s", repo, branch, status, trace)

    if status == "failure":
        if GITHUB_TOKEN:
            await _open_issue(repo, branch, run_url, sha, trace)
        if LINEAR_API_KEY and LINEAR_TEAM_ID:
            await _create_linear_incident(repo, branch, run_url, sha, trace)


async def _open_issue(repo: str, branch: str, run_url: str, sha: str, trace: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                f"https://api.github.com/repos/{ALERT_REPO}/issues",
                json={
                    "title": f"CI failure: {repo} @ {branch} ({sha})",
                    "body": f"**Run:** {run_url}\n**Trace:** `{trace}`\n\n*Auto-created by garcar-dispatch*",
                    "labels": ["ci-failure", "automated"],
                },
                headers={
                    "Authorization": f"Bearer {GITHUB_TOKEN}",
                    "Accept": "application/vnd.github+json",
                },
            )
            r.raise_for_status()
            log.info("gh_issue_created url=%s", r.json().get("html_url"))
    except Exception as e:
        log.warning("gh_issue_failed err=%s", e)


async def _create_linear_incident(
    repo: str, branch: str, run_url: str, sha: str, trace: str
):
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                "https://api.linear.app/graphql",
                json={
                    "query": "mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{identifier}}}",
                    "variables": {
                        "i": {
                            "teamId": LINEAR_TEAM_ID,
                            "title": f"CI failure: {repo} @ {branch} ({sha})",
                            "description": f"[View run]({run_url})\ntrace=`{trace}`",
                            "priority": 1,
                        }
                    },
                },
                headers={"Authorization": LINEAR_API_KEY},
            )
            r.raise_for_status()
    except Exception as e:
        log.warning("linear_incident_failed err=%s", e)
