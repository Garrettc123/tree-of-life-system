const SupabaseRhnsStore = require('../agents/core/supabase-rhns-store');
const { canonicalHash } = require('../agents/core/contracts');

const tenantId = '11111111-1111-4111-8111-111111111111';
const approvalId = '22222222-2222-4222-8222-222222222222';
const action = { toolId: 'github.create_branch', target: { repo: 'sample/repo', branch: 'fix/test' }, arguments: { from: 'main' } };

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === undefined || body === null ? '' : JSON.stringify(body),
  };
}

function makeStore(fetchImpl) {
  return new SupabaseRhnsStore({
    url: 'https://example.supabase.co',
    serviceRoleKey: 'server-only-test-key',
    fetchImpl,
  });
}

describe('SupabaseRhnsStore', () => {
  test('requires a server URL and service-role key', () => {
    expect(() => new SupabaseRhnsStore({ url: 'https://example.supabase.co' })).toThrow(/service-role key/);
    expect(() => new SupabaseRhnsStore({ url: 'not-a-url', serviceRoleKey: 'secret' })).toThrow(/Supabase URL/);
  });

  test('stores approval requests using tenant-scoped durable rows', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(null, 201));
    const store = makeStore(fetchImpl);
    await store.create({
      id: approvalId,
      tenantId,
      requestedBy: 'operator-requester',
      actionHash: canonicalHash({ tenantId, toolId: action.toolId, toolVersion: '1', target: action.target, arguments: action.arguments, artifactHash: null }),
      action,
      state: 'pending',
      createdAt: 100,
      expiresAt: 1000,
      consumedAt: null,
      approvedBy: null,
      approvedAt: null,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/rest/v1/rhns_action_approvals');
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBe('server-only-test-key');
    expect(JSON.parse(init.body).tenant_id).toBe(tenantId);
    expect(init.headers.Prefer).toBe('return=minimal');
  });

  test('rejects non-UUID tenant IDs and secret-bearing action fields before network calls', async () => {
    const fetchImpl = jest.fn();
    const store = makeStore(fetchImpl);
    await expect(store.create({ id: approvalId, tenantId: 'tenant-1', action })).rejects.toThrow(/tenantId must be a UUID/);
    await expect(store.create({ id: approvalId, tenantId, action: { api_key: 'not-persistable' } })).rejects.toThrow(/Sensitive field/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('reads and maps persistent approval state', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response([{
      id: approvalId,
      tenant_id: tenantId,
      requested_by: 'operator-requester',
      action_hash: 'a'.repeat(64),
      action,
      state: 'approved',
      created_at_ms: '100',
      expires_at_ms: '1000',
      consumed_at_ms: null,
      approved_by: 'operator-1',
      approved_at_ms: '200',
    }]));
    const store = makeStore(fetchImpl);
    const record = await store.get(approvalId);
    expect(record.tenantId).toBe(tenantId);
    expect(record.createdAt).toBe(100);
    expect(record.approvedBy).toBe('operator-1');
    expect(record.state).toBe('approved');
    expect(fetchImpl.mock.calls[0][0]).toContain('id=eq.' + approvalId);
  });

  test('uses one conditional PATCH for compare-and-set approval', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response([{ id: approvalId }]));
    const store = makeStore(fetchImpl);
    const changed = await store.compareAndSet(approvalId, 'pending', {
      tenantId, actionHash: 'a'.repeat(64), state: 'approved', approvedBy: 'operator-1', approvedAt: 200,
    });
    expect(changed).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(url).toContain('state=eq.pending');
    expect(url).toContain('expires_at_ms=gt.200');
    expect(JSON.parse(init.body).state).toBe('approved');
    expect(init.headers.Prefer).toBe('return=representation');
    expect(await store.compareAndSet(approvalId, 'approved', { state: 'consumed' })).toBe(false);
  });

  test('consumes only once through a conditional state-and-expiry update', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(response([{ id: approvalId }])).mockResolvedValueOnce(response([]));
    const store = makeStore(fetchImpl);
    expect(await store.consumeIfMatches(approvalId, 'b'.repeat(64), 300)).toBe(true);
    expect(await store.consumeIfMatches(approvalId, 'b'.repeat(64), 301)).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(url).toContain('state=eq.approved');
    expect(url).toContain('expires_at_ms=gt.300');
    expect(JSON.parse(init.body)).toEqual({ state: 'consumed', consumed_at_ms: 300 });
  });

  test('persists a batch of proposals after idempotency preflight', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(null, 201));
    const store = makeStore(fetchImpl);
    const proposals = [
      { proposalId: 'proposal:development:task-1', taskId: 'task-1', agentId: 'development', taskType: 'create_file', state: 'draft_pending_review', executionMode: 'proposal_only', createdAt: '2026-01-01T00:00:00.000Z', sideEffectsPerformed: false },
      { proposalId: 'proposal:documentation:task-2', taskId: 'task-2', agentId: 'documentation', taskType: 'enhance_description', state: 'draft_pending_review', executionMode: 'proposal_only', createdAt: '2026-01-01T00:00:00.000Z', sideEffectsPerformed: false },
    ];
    const result = await store.recordProposals(proposals, tenantId);
    expect(result).toEqual({ recorded: 2, alreadyPresent: 0 });
    const [url, init] = fetchImpl.mock.calls[2];
    expect(url).toContain('/rest/v1/rhns_proposals');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toHaveLength(2);
    expect(JSON.parse(init.body)[0].tenant_id).toBe(tenantId);
  });

  test('does not persist event or evidence payloads containing credential-like keys', async () => {
    const fetchImpl = jest.fn();
    const store = makeStore(fetchImpl);
    await expect(store.appendEvent({ type: 'agent:test', data: { nested: { access_token: 'x' } } }, tenantId)).rejects.toThrow(/Sensitive field/);
    await expect(store.appendEvidence({ tenantId, entityId: approvalId, entityType: 'task', evidenceType: 'test', content: { password: 'x' } })).rejects.toThrow(/Sensitive field/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
