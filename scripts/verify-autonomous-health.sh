#!/usr/bin/env bash
# Health proof is limited to explicitly configured, public, HTTPS endpoints.
# No inferred Railway hostnames and no success by default.
set -uo pipefail

if [[ -z "${GARCAR_HEALTH_URLS:-}" ]]; then
  echo 'BLOCKED: GARCAR_HEALTH_URLS is empty. Configure verified HTTPS health URLs in the GitHub Actions repository variable.' >&2
  exit 2
fi

healthy=0
unhealthy=0
total=0
while IFS= read -r url || [[ -n "$url" ]]; do
  url="${url%$'\r'}"
  [[ -z "$url" ]] && continue
  total=$((total + 1))
  # Only public HTTPS URLs. Reject embedded credentials and query parameters.
  if [[ ! "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]?\#@]*)?$ ]]; then
    echo "INVALID target #${total}: must be a public HTTPS URL without credentials or query parameters" >&2
    unhealthy=$((unhealthy + 1))
    continue
  fi
  code=$(curl --silent --show-error --location --connect-timeout 5 --max-time 15 --output /dev/null --write-out '%{http_code}' "$url")
  curl_rc=$?
  if (( curl_rc == 0 )) && [[ "$code" == "200" || "$code" == "204" ]]; then
    echo "HEALTHY: $url (HTTP $code)"
    healthy=$((healthy + 1))
  else
    echo "UNHEALTHY: $url (curl=$curl_rc, HTTP ${code:-000})" >&2
    unhealthy=$((unhealthy + 1))
  fi
done <<< "$GARCAR_HEALTH_URLS"

echo "Health summary: healthy=$healthy unhealthy=$unhealthy checked=$total"
if (( total == 0 )); then
  echo 'BLOCKED: No non-empty health targets were configured' >&2
  exit 2
fi
if (( unhealthy > 0 )); then
  echo 'FAILED: One or more configured health probes did not pass' >&2
  exit 1
fi
echo 'PASS: Every explicitly configured health probe passed'
