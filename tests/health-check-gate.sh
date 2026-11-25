#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mock_dir="$(mktemp -d)"
trap 'rm -rf "$mock_dir"' EXIT
cat > "$mock_dir/curl" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  *fail.example*) printf '404' ;;
  *network.example*) exit 7 ;;
  *) printf '200' ;;
esac
MOCK
chmod +x "$mock_dir/curl"
run_case() {
  local expected="$1" targets="$2" actual
  set +e
  GARCAR_HEALTH_URLS="$targets" PATH="$mock_dir:$PATH" bash scripts/verify-autonomous-health.sh >/dev/null 2>&1
  actual=$?
  set -e
  if [[ "$actual" -ne "$expected" ]]; then
    echo "Health gate expected exit $expected, got $actual" >&2
    exit 1
  fi
}
run_case 2 ''
run_case 0 'https://ok.example/health'
run_case 1 'https://fail.example/health'
run_case 1 $'https://ok.example/health\nhttps://fail.example/health'
run_case 1 'https://network.example/health'
run_case 1 'http://unsafe.example/health'
run_case 1 'https://user:pass@ok.example/health'
echo 'Health gate tests passed (unconfigured, pass, failed HTTP, mixed, transport, invalid targets)'
