"""Create and validate a standalone SQLite backup of the local event store."""
from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT / "data" / "garcar-events.sqlite3"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=os.environ.get("GARCAR_EVENT_DB_PATH", str(DEFAULT_SOURCE)),
        help="Event database path (defaults to GARCAR_EVENT_DB_PATH or local data directory).",
    )
    parser.add_argument(
        "--output",
        help="Destination path; defaults to backups/garcar-events-<UTC timestamp>.sqlite3.",
    )
    args = parser.parse_args()
    source = Path(args.source).expanduser().resolve()
    if not source.is_file():
        parser.error(f"source database does not exist: {source}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = Path(args.output).expanduser() if args.output else ROOT / "backups" / f"garcar-events-{stamp}.sqlite3"
    destination = destination.resolve()
    if source == destination:
        parser.error("source and destination must be different files")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.exists():
        parser.error(f"refusing to overwrite an existing backup: {destination}")

    source_db = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True, timeout=5)
    backup_db = sqlite3.connect(str(destination), timeout=5)
    try:
        source_db.backup(backup_db)
        result = backup_db.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise RuntimeError(f"backup integrity check failed: {result}")
    except Exception:
        backup_db.close()
        source_db.close()
        destination.unlink(missing_ok=True)
        raise
    else:
        backup_db.close()
        source_db.close()
    os.chmod(destination, 0o600)
    print("SQLite integrity check: ok")
    print(f"Backup created: {destination}")
    print("This confirms file integrity, not application-level event correctness.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
