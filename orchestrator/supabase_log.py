import json
import logging
import time
from typing import Optional

import httpx

log = logging.getLogger("supabase_log")

_HEADERS_BASE = {
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


class EventLog:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/") if url else ""
        self.key = key
        self._h = {**_HEADERS_BASE, "apikey": key, "Authorization": f"Bearer {key}"}

    def _ok(self) -> bool:
        return bool(self.url and self.key)

    async def write(self, event: dict) -> str:
        if not self._ok():
            return f"local-{int(time.time() * 1000)}"
        row = {
            "event_type": event.get("event_type"),
            "source_system": event.get("source_system", "unknown"),
            "trace_id": event.get("trace_id"),
            "payload": json.dumps(event),
            "status": "pending",
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                r = await c.post(
                    f"{self.url}/rest/v1/garcar_events",
                    json=row,
                    headers=self._h,
                )
                r.raise_for_status()
                data = r.json()
                return data[0]["id"] if data else f"local-{int(time.time())}"
        except Exception as e:
            log.warning("write_failed err=%s", e)
            return f"local-{int(time.time())}"

    async def mark_processed(self, event_id: str):
        if not self._ok() or event_id.startswith("local-"):
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                await c.patch(
                    f"{self.url}/rest/v1/garcar_events?id=eq.{event_id}",
                    json={"status": "processed"},
                    headers=self._h,
                )
        except Exception as e:
            log.warning("mark_processed_failed err=%s", e)

    async def mark_failed(self, event_id: str, error: str):
        if not self._ok() or event_id.startswith("local-"):
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                await c.patch(
                    f"{self.url}/rest/v1/garcar_events?id=eq.{event_id}",
                    json={"status": "failed", "error_detail": error[:500]},
                    headers=self._h,
                )
        except Exception as e:
            log.warning("mark_failed_err err=%s", e)

    async def fetch(self, limit: int = 50, source: Optional[str] = None) -> list:
        if not self._ok():
            return []
        params = f"select=*&limit={limit}&order=created_at.desc"
        if source:
            params += f"&source_system=eq.{source}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                r = await c.get(
                    f"{self.url}/rest/v1/garcar_events?{params}",
                    headers={**self._h, "Prefer": ""},
                )
                r.raise_for_status()
                return r.json()
        except Exception as e:
            log.warning("fetch_failed err=%s", e)
            return []
