import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

from test_main import load_app, sign
from directives import DirectiveStore


def payload(**changes):
    return {"event_type": "business.directive", "directive_id": "directive-123", "action": "system_health", "issued_at": time.time(), "dry_run": True, **changes}


def submit(client, module, event, operator=True):
    body = json.dumps(event, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json", "X-Dispatch-Sig": sign(body, module.DISPATCH_SECRET)}
    if operator:
        headers["X-Operator-Token"] = module.OPERATOR_TOKEN
    return client.post('/directives', content=body, headers=headers)


def test_directives_require_operator_and_signature(tmp_path, monkeypatch):
    c, m = load_app(tmp_path, monkeypatch)
    assert submit(c, m, payload(), False).status_code == 401
    assert c.post('/directives', json=payload(), headers={'X-Operator-Token': m.OPERATOR_TOKEN}).status_code == 403
    assert c.get('/directives').status_code == 401
    assert c.get('/operator/status', headers={'X-Operator-Token': m.OPERATOR_TOKEN}).json()['external_writes_enabled'] is False


def test_dry_run_persists_receipt_without_probing(tmp_path, monkeypatch):
    c, m = load_app(tmp_path, monkeypatch)
    import directives
    async def must_not_probe(*args):
        raise AssertionError('dry run made a network request')
    monkeypatch.setattr(directives, 'probe', must_not_probe)
    r = submit(c, m, payload())
    assert r.status_code == 200
    receipt = r.json()['receipt']
    assert receipt['status'] == 'planned'
    stored = c.get(receipt['receipt_url'], headers={'X-Operator-Token': m.OPERATOR_TOKEN}).json()
    assert stored == receipt
    assert 'request_hash' not in receipt


def test_duplicate_returns_existing_receipt_and_modified_id_conflicts(tmp_path, monkeypatch):
    c, m = load_app(tmp_path, monkeypatch)
    event = payload()
    first = submit(c, m, event).json()
    repeat = submit(c, m, event).json()
    assert repeat['duplicate'] is True
    assert repeat['receipt'] == first['receipt']
    assert submit(c, m, {**event, 'dry_run': False}).status_code == 409


@pytest.mark.parametrize('change', [{'issued_at': 0}, {'issued_at': True}, {'issued_at': float('nan')}, {'issued_at': time.time()+3600}, {'dry_run': 'false'}, {'url': 'http://evil.invalid'}, {'directive_id': '../invalid'}])
def test_invalid_or_stale_signed_payload_rejected(tmp_path, monkeypatch, change):
    c, m = load_app(tmp_path, monkeypatch)
    assert submit(c, m, payload(**change)).status_code in (403, 422)


def test_execution_records_real_probe_outputs_and_blockers(tmp_path, monkeypatch):
    c, m = load_app(tmp_path, monkeypatch)
    import directives
    calls = []
    async def observed(name, url, kind):
        calls.append(name)
        return {'name': name, 'source': url, 'ok': False, 'error': 'ConnectError'}
    monkeypatch.setenv('GARCAR_WORKER_STATUS_URL', 'http://worker.railway.internal:3000/status')
    monkeypatch.setattr(directives, 'probe', observed)
    r = submit(c, m, payload(action='revenue_readiness', dry_run=False)).json()['receipt']
    assert set(calls) == {'worker', 'public_site', 'github'}
    assert r['status'] == 'completed'
    assert len(r['result']['observations']) == 3
    assert 'stripe_not_connected' in {b['code'] for b in r['result']['blockers']}
    assert r['result']['external_writes'] is False


def test_unsupported_write_stays_blocked(tmp_path, monkeypatch):
    c, m = load_app(tmp_path, monkeypatch)
    r = submit(c, m, payload(action='send_outreach', dry_run=False)).json()['receipt']
    assert r['status'] == 'blocked'
    assert r['result']['reason'] == 'unsupported_directive'


def test_receipt_survives_store_restart_and_inflight_is_interrupted(tmp_path):
    path = tmp_path / 'receipts.sqlite3'
    store = DirectiveStore(path)
    assert store.claim('restart-123', 'digest', 'system_health', False)
    recovered = DirectiveStore(path)
    assert recovered.get('restart-123')['status'] == 'interrupted'
    assert recovered.claim('restart-123', 'digest', 'system_health', False) is False


def test_concurrent_claim_executes_once(tmp_path):
    store = DirectiveStore(tmp_path / 'receipts.sqlite3')
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: store.claim('concurrent-123', 'digest', 'system_health', False), range(12)))
    assert results.count(True) == 1
