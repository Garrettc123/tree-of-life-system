import logging
import os

import httpx

log = logging.getLogger("handler.stripe_payment")

LINEAR_API_KEY = os.getenv("LINEAR_API_KEY", "")
LINEAR_REVENUE_ISSUE_ID = os.getenv("LINEAR_REVENUE_ISSUE_ID", "")
NOTION_API_KEY = os.getenv("NOTION_API_KEY", "")
NOTION_REVENUE_DB_ID = os.getenv("NOTION_REVENUE_DB_ID", "")


async def handle(event: dict, event_id: str):
    payload = event.get("payload", event)
    amount = payload.get("amount_total", 0) or 0
    currency = (payload.get("currency") or "usd").upper()
    email = payload.get("customer_email", "unknown")
    trace = event.get("trace_id", event_id)

    log.info(
        "stripe_payment amount=%s %s email=%s trace=%s",
        amount, currency, email, trace,
    )

    if LINEAR_API_KEY and LINEAR_REVENUE_ISSUE_ID:
        await _comment_linear(amount, currency, email, trace)
    if NOTION_API_KEY and NOTION_REVENUE_DB_ID:
        await _log_notion(amount, currency, email, trace)


async def _comment_linear(amount: int, currency: str, email: str, trace: str):
    body = f"\U0001f4b3 Payment · ${amount / 100:.2f} {currency} · {email} · `{trace}`"
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                "https://api.linear.app/graphql",
                json={
                    "query": "mutation($i:String!,$b:String!){commentCreate(input:{issueId:$i,body:$b}){success}}",
                    "variables": {"i": LINEAR_REVENUE_ISSUE_ID, "b": body},
                },
                headers={"Authorization": LINEAR_API_KEY},
            )
            r.raise_for_status()
    except Exception as e:
        log.warning("linear_comment_failed err=%s", e)


async def _log_notion(amount: int, currency: str, email: str, trace: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                "https://api.notion.com/v1/pages",
                headers={
                    "Authorization": f"Bearer {NOTION_API_KEY}",
                    "Notion-Version": "2022-06-28",
                },
                json={
                    "parent": {"database_id": NOTION_REVENUE_DB_ID},
                    "properties": {
                        "Name": {"title": [{"text": {"content": trace}}]},
                        "Amount": {"number": amount / 100},
                        "Currency": {"select": {"name": currency}},
                        "Customer": {"rich_text": [{"text": {"content": email}}]},
                        "Status": {"select": {"name": "Completed"}},
                    },
                },
            )
            r.raise_for_status()
    except Exception as e:
        log.warning("notion_log_failed err=%s", e)
