const ApprovalGate = require('../agents/core/approval-gate');

function makeStore() {
  const records = new Map();
  return {
    records,
    async create(record) { records.set(record.id, { ...record }); },
    async get(id) { const record = records.get(id); return record ? { ...record } : null; },
    async compareAndSet(id, expectedState, record) {
      const current = records.get(id);
      if (!current || current.state !== expectedState) return false;
      records.set(id, { ...record });
      return true;
    },
    async consumeIfMatches(id, actionHash, consumedAt) {
      const record = records.get(id);
      if (!record || record.state !== 'approved' || record.actionHash !== actionHash) return false;
      records.set(id, { ...record, state: 'consumed', consumedAt });
      return true;
    },
  };
}

const requester = { id: 'owner-1', tenantId: 'tenant-1', authenticated: true };
const operator = { id: 'operator-1', tenantId: 'tenant-1', authenticated: true, roles: ['operator'] };
const action = { toolId: 'github.create_branch', toolVersion: '1', target: { repo: 'sample/repo', branch: 'fix/example' }, arguments: { from: 'main' } };

describe('exact-action approval gate', () => {
  test('requires an authenticated requester and operator', async () => {
    const gate = new ApprovalGate({ store: makeStore() });
    await expect(gate.requestApproval(action, { id: 'x', tenantId: 'tenant-1' })).rejects.toThrow(/Authenticated requester/);
    const request = await gate.requestApproval(action, requester);
    await expect(gate.approve(request.approvalId, { ...operator, roles: ['viewer'] })).rejects.toThrow(/operator approval/);
  });

  test('binds approval to exact target and arguments and consumes once', async () => {
    const gate = new ApprovalGate({ store: makeStore() });
    const request = await gate.requestApproval(action, requester);
    await gate.approve(request.approvalId, operator);
    await expect(gate.consume(request.approvalId, { ...action, target: { repo: 'other/repo', branch: 'fix/example' } }, requester)).rejects.toThrow(/does not match/);
    const consumed = await gate.consume(request.approvalId, action, requester);
    expect(consumed.state).toBe('consumed');
    await expect(gate.consume(request.approvalId, action, requester)).rejects.toThrow(/not approved or was already consumed/);
  });

  test('rejects cross-tenant approval and expired approvals', async () => {
    let now = 1000;
    const gate = new ApprovalGate({ store: makeStore(), clock: () => now, ttlMs: 10 });
    const request = await gate.requestApproval(action, requester);
    await expect(gate.approve(request.approvalId, { ...operator, tenantId: 'tenant-2' })).rejects.toThrow(/Cross-tenant/);
    now = 2000;
    await expect(gate.approve(request.approvalId, operator)).rejects.toThrow(/expired/);
  });
});
