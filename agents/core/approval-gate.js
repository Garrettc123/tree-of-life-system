const { randomUUID } = require('crypto');
const { canonicalHash } = require('./contracts');

/**
 * Exact-action approval gate. The supplied store must provide durable,
 * atomic compare-and-consume semantics for production deployments.
 */
class ApprovalGate {
  constructor({ store, clock = () => Date.now(), ttlMs = 15 * 60 * 1000 } = {}) {
    if (!store || typeof store.create !== 'function'
      || typeof store.get !== 'function'
      || typeof store.update !== 'function'
      || typeof store.consumeIfMatches !== 'function') {
      throw new TypeError('ApprovalGate requires a store with create/get/consumeIfMatches methods');
    }
    this.store = store;
    this.clock = clock;
    this.ttlMs = ttlMs;
  }

  async requestApproval(action, requester) {
    if (!requester || requester.authenticated !== true || !requester.id || !requester.tenantId) {
      throw new Error('Authenticated requester with tenant scope is required');
    }
    if (!action || typeof action !== 'object' || !action.toolId || !action.target || !action.arguments) {
      throw new Error('Exact action requires toolId, target, and arguments');
    }
    const actionHash = canonicalHash({
      tenantId: requester.tenantId,
      toolId: action.toolId,
      toolVersion: action.toolVersion || '1',
      target: action.target,
      arguments: action.arguments,
      artifactHash: action.artifactHash || null,
    });
    const record = {
      id: randomUUID(),
      tenantId: requester.tenantId,
      requestedBy: requester.id,
      actionHash,
      action: JSON.parse(JSON.stringify(action)),
      state: 'pending',
      createdAt: this.clock(),
      expiresAt: this.clock() + this.ttlMs,
      consumedAt: null,
      approvedBy: null,
    };
    await this.store.create(record);
    return { approvalId: record.id, actionHash, state: record.state, expiresAt: record.expiresAt };
  }

  async approve(approvalId, approver) {
    if (!approver || approver.authenticated !== true || !approver.id
      || !Array.isArray(approver.roles) || !approver.roles.includes('operator')) {
      throw new Error('Authenticated operator approval is required');
    }
    const record = await this.store.get(approvalId);
    if (!record || record.state !== 'pending') throw new Error('Approval is missing or not pending');
    if (record.tenantId !== approver.tenantId) throw new Error('Cross-tenant approval denied');
    if (record.expiresAt <= this.clock()) throw new Error('Approval expired');
    const updated = { ...record, state: 'approved', approvedBy: approver.id, approvedAt: this.clock() };
    await this.store.update(approvalId, updated);
    return { approvalId, state: 'approved', actionHash: record.actionHash };
  }

  async consume(approvalId, action, principal) {
    if (!principal || principal.authenticated !== true || !principal.id || !principal.tenantId) {
      throw new Error('Authenticated principal is required to consume approval');
    }
    const record = await this.store.get(approvalId);
    if (!record || record.state !== 'approved') throw new Error('Approval is not approved or was already consumed');
    if (record.tenantId !== principal.tenantId) throw new Error('Cross-tenant action denied');
    if (record.expiresAt <= this.clock()) throw new Error('Approval expired');
    const actionHash = canonicalHash({
      tenantId: principal.tenantId,
      toolId: action.toolId,
      toolVersion: action.toolVersion || '1',
      target: action.target,
      arguments: action.arguments,
      artifactHash: action.artifactHash || null,
    });
    if (actionHash !== record.actionHash) throw new Error('Action does not match approved target and arguments');
    const consumed = await this.store.consumeIfMatches(approvalId, record.actionHash, this.clock());
    if (!consumed) throw new Error('Approval could not be consumed; it may have been used concurrently');
    return { approvalId, state: 'consumed', actionHash };
  }
}

module.exports = ApprovalGate;
