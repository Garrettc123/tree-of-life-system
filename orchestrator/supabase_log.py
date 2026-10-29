"""Event persistence with Supabase support and a durable local SQLite fallback."""
import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
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
        default_path = Path(__file__).resolve().parent / "data" / "garcar-events.sqlite3"
        self.db_path = Path(os.getenv("GARCAR_EVENT_DB_PATH", str(default_path))).expanduser()
        self._init_local_db()

    def _ok(self) -> bool:
        return bool(self.url and self.key)

    def _connect_local(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self.db_path), timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=5000")
        return connection

    def _init_local_db(self) -> None:
        connection = self._connect_local()
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    source_system TEXT NOT NULL,
                    trace_id TEXT,
                    payload TEXT NOT NULL,
                    status TEXT NOT NULL,
                    error_detail TEXT
                )"""
            )
            connection.commit()
        finally:
            connection.close()

    def _write_local(self, event: dict, error_detail: str = "") -> str:
        event_id = f"local-{uuid.uuid4().hex}"
        created_at = datetime.now(timezone.utc).isoformat()
        connection = self._connect_local()
        try:
            connection.execute(
                """INSERT INTO events
                   (id, created_at, event_type, source_system, trace_id, payload, status, error_detail)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event_id,
                    created_at,
                    str(event.get("event_type", "unknown")),
                    str(event.get("source_system", "unknown")),
                    event.get("trace_id"),
                    json.dumps(event, sort_keys=True, separators=(",", ":")),
                    "pending",
                    error_detail[:500] or None,
                ),
            )
            connection.commit()
        finally:
            connection.close()
        return event_id

    async def write(self, event: dict) -> str:
        if not self._ok():
            return self._write_local(event, "Supabase is not configured; saved locally.")
        row = {
            "event_type": event.get("event_type"),
            "source_system": event.get("source_system", "unknown"),
            "trace_id": event.get("trace_id"),
            "payload": json.dumps(event, sort_keys=True, separators=(",", ":")),
            "status": "pending",
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{self.url}/rest/v1/garcar_events",
                    json=row,
                    headers=self._h,
                )
                response.raise_for_status()
                data = response.json()
                if data and data[0].get("id") is not None:
                    return str(data[0]["id"])
                log.warning("Supabase write returned no event identifier; saving locally")
                return self._write_local(event, "Supabase write returned no event identifier.")
        except Exception as exc:
            log.warning("Supabase write failed; saving locally (%s)", type(exc).__name__)
            return self._write_local(event, f"Supabase write failed: {type(exc).__name__}")

    def _update_local(self, event_id: str, status: str, error: str = "") -> None:
        connection = self._connect_local()
        try:
            connection.execute(
                "UPDATE events SET status = ?, error_detail = ? WHERE id = ?",
                (status, error[:500] or None, event_id),
            )
            connection.commit()
        finally:
            connection.close()

    async def mark_processed(self, event_id: str):
        if event_id.startswith("local-"):
            self._update_local(event_id, "processed")
            return
        if not self._ok():
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.patch(
                    f"{self.url}/rest/v1/garcar_events?id=eq.{event_id}",
                    json={"status": "processed"},
                    headers=self._h,
                )
                response.raise_for_status()
        except Exception as exc:
            log.warning("Supabase mark-processed failed (%s)", type(exc).__name__)

    async def mark_failed(self, event_id: str, error: str):
        if event_id.startswith("local-"):
            self._update_local(event_id, "failed", error)
            return
        if not self._ok():
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.patch(
                    f"{self.url}/rest/v1/garcar_events?id=eq.{event_id}",
                    json={"status": "failed", "error_detail": error[:500]},
                    headers=self._h,
                )
                response.raise_for_status()
        except Exception as exc:
            log.warning("Supabase mark-failed failed (%s)", type(exc).__name__)

    def _fetch_local(self, limit: int, source: Optional[str] = None) -> list[dict]:
        connection = self._connect_local()
        try:
            query = "SELECT * FROM events"
            params: list[object] = []
            if source:
                query += " WHERE source_system = ?"
                params.append(source)
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(max(1, min(int(limit), 200)))
            rows = connection.execute(query, params).fetchall()
            return [
                {
                    "id": row["id"],
                    "created_at": row["created_at"],
                    "event_type": row["event_type"],
                    "source_system": row["source_system"],
                    "trace_id": row["trace_id"],
                    "payload": row["payload"],
                    "status": row["status"],
                    "error_detail": row["error_detail"],
                    "local_fallback": True,
                }
                for row in rows
            ]
        finally:
            connection.close()

    async def fetch(self, limit: int = 50, source: Optional[str] = None) -> list[dict]:
        safe_limit = max(1, min(int(limit), 200))
        if not self._ok():
            return self._fetch_local(safe_limit, source)
        params: dict[str, object] = {"select": "*", "limit": safe_limit, "order": "created_at.desc"}
        if source:
            params["source_system"] = f"eq.{source}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.url}/rest/v1/garcar_events",
                    params=params,
                    headers={**self._h, "Prefer": ""},
                )
                response.raise_for_status()
                result = response.json()
                if isinstance(result, list):
                    # Keep local fallback records visible after the remote store recovers.
                    local_events = self._fetch_local(safe_limit, source)
                    combined = result + local_events
                    combined.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
                    seen: set[str] = set()
                    unique = []
                    for item in combined:
                        event_id = str(item.get("id", ""))
                        if event_id in seen:
                            continue
                        seen.add(event_id)
                        unique.append(item)
                    return unique[:safe_limit]
                log.warning("Supabase fetch returned an unexpected shape; using local events")
                return self._fetch_local(safe_limit, source)
        except Exception as exc:
            log.warning("Supabase fetch failed; using local events (%s)", type(exc).__name__)
            return self._fetch_local(safe_limit, source)
