"""Small helper for deterministic HMAC signing of JSON dispatch payloads."""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any


def sign_json_payload(payload: dict[str, Any], secret: str) -> tuple[bytes, str]:
    """Serialize once and return the exact request bytes plus its HMAC header value."""
    if len(secret.encode("utf-8")) < 32:
        raise ValueError("Dispatch signing secret must be at least 32 bytes")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    signature = "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return body, signature
