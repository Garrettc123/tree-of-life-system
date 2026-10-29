#!/usr/bin/env python3
"""Create and validate a standalone SQLite backup of the local audit ledger."""
from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data" / "garcar-control-plane.sqlite3"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=os.environ.get("GARCAR_DB_PATH", str(DEFAULT_SOURCE)),
        help="SQLite database path (defaults to GARCAR_DB_PATH or the local data directory).",
    )
    parser.add_argument(
        "--output",
        help="Destination path; defaults to backups/garcar-control-plane-<UTC timestamp>.sqlite3.",
    )
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    if not source.is_file():
        parser.error(f"source database does not exist: {source}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = Path(args.output).expanduser() if args.output else ROOT / "backups" / f"garcar-control-plane-{stamp}.sqlite3"
    destination = destination.resolve()
    if source == destination:
        parser.error("source and destination must be different files")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.exists():
        parser.error(f"refusing to overwrite an existing backup: {destination}")

    try:
        with sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True, timeout=5) as source_db:
            with sqlite3.connect(str(destination), timeout=5) as backup_db:
                source_db.backup(backup_db)
                result = backup_db.execute("PRAGMA integrity_check").fetchone()[0]
                if result != "ok":
                    raise RuntimeError(f"backup integrity check failed: {result}")
        os.chmod(destination, 0o600)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    print(f"SQLite integrity check: ok")
    print(f"Backup created: {destination}")
    print("This verifies SQLite file integrity; run /api/audit/verify to check the event hash chain.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
