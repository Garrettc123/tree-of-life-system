'use strict';

const { canonicalHash } = require('./contracts');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPROVAL_COLUMNS = 'id,tenant_id,requested_by,action_hash,action,state,created_at_ms,expires_at_ms,consumed_at_ms,approved_by,approved_at_ms';

function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new TypeError(field + ' must be a UUID');
  }
}

function assertSafePayload(value, path = 'payload') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafePayload(item, path + '[' + index + ']'));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/(secret|password|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|credential)/i.test(key)) {
      throw new Error('Sensitive field is not permitted in durable RHNS payload: ' + path + '.' + key);
    }
    assertSafePayload(item, path + '.' + key);
  }
}

function mapApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    requestedBy: row.requested_by,
    actionHash: row.action_hash,
    action: row.action,
    state: row.state,
    createdAt: Number(row.created_at_ms),
    expiresAt: Number(row.expires_at_ms),
    consumedAt: row.consumed_at_ms == null ? null : Number(row.consumed_at_ms),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at_ms == null ? null : Number(row.approved_at_ms),
  };
}

class SupabaseRhnsStore {
  constructor({ url, serviceRoleKey, fetchImpl = global.fetch } = {}) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new TypeError('Supabase URL is required');
    }
    if (typeof serviceRoleKey !== 'string' || !serviceRoleKey.trim()) {
      throw new TypeError('Supabase service-role key is required');
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('A fetch implementation is required');
    }
    const parsed = new URL(url);
    this.url = parsed.origin;
    this.serviceRoleKey = serviceRoleKey;
    this.fetchImpl = fetchImpl;
  }

  async _request(path, { method = 'GET', query = {}, body, prefer } = {}) {
    const endpoint = new URL(path, this.url + '/rest/v1/');
    for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, String(value));
    const headers = {
      apikey: this.serviceRoleKey,
      Authorization: 'Bearer ' + this.serviceRoleKey,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;

    const response = await this.fetchImpl(endpoint.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!response.ok) {
      const code = data && typeof data.code === 'string' ? ' (' + data.code + ')' : '';
      throw new Error('Supabase RHNS storage request failed: ' + method + ' ' + path + ' returned HTTP ' + response.status + code);
    }
    return data;
  }

  async healthCheck() {
    await this._request('rhns_action_approvals', { query: { select: 'id', limit: '1' } });
    await this._request('rhns_proposals', { query: { select: 'proposal_id', limit: '1' } });
    return { ok: true, storage: 'supabase-rest', tables: ['rhns_action_approvals', 'rhns_proposals'] };
  }

  async createRun(run) {
    requireUuid(run && run.id, 'run id');
    requireUuid(run && run.tenantId, 'run tenantId');
    if (typeof run.runKey !== 'string' || !run.runKey.trim()) throw new TypeError('runKey is required');
    if (typeof run.actorId !== 'string' || !run.actorId.trim()) throw new TypeError('actorId is required');
    if (!['read_only_observation', 'proposal_only'].includes(run.executionMode)) {
      throw new TypeError('Unsupported RHNS execution mode');
    }
    if (run.status !== 'created') throw new TypeError('New RHNS runs must start in created state');
    const goal = run.goal === undefined ? {} : run.goal;
    const metadata = run.metadata === undefined ? {} : run.metadata;
    assertSafePayload(goal, 'goal');
    assertSafePayload(metadata, 'metadata');

    const rows = await this._request('rhns_runs', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        id: run.id,
        tenant_id: run.tenantId,
        run_key: run.runKey,
        actor_id: run.actorId,
        execution_mode: run.executionMode,
        status: 'created',
        goal,
        metadata,
      },
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Durable RHNS run insert did not return exactly one row');
    return rows[0];
  }

  async transitionRun(id, tenantId, expectedStatus, nextStatus, patch = {}) {
    requireUuid(id, 'run id');
    requireUuid(tenantId, 'run tenantId');
    const transitions = {
      created: new Set(['planning', 'failed', 'cancelled']),
      planning: new Set(['awaiting_approval', 'executing', 'rejected', 'failed', 'cancelled', 'unknown_outcome']),
      awaiting_approval: new Set(['executing', 'rejected', 'failed', 'cancelled']),
      executing: new Set(['verifying', 'failed', 'cancelled', 'unknown_outcome']),
      verifying: new Set(['succeeded', 'failed', 'cancelled', 'unknown_outcome']),
    };
    if (!transitions[expectedStatus] || !transitions[expectedStatus].has(nextStatus)) {
      throw new Error('Invalid RHNS run state transition: ' + expectedStatus + ' -> ' + nextStatus);
    }

    const update = { status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === 'planning') update.started_at = patch.startedAt || new Date().toISOString();
    if (['succeeded', 'rejected', 'failed', 'cancelled', 'unknown_outcome'].includes(nextStatus)) {
      update.completed_at = patch.completedAt || new Date().toISOString();
    }
    for (const key of ['output', 'error', 'metadata']) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        assertSafePayload(patch[key], key);
        update[key] = patch[key];
      }
    }

    const rows = await this._request('rhns_runs', {
      method: 'PATCH',
      query: {
        id: 'eq.' + id,
        tenant_id: 'eq.' + tenantId,
        status: 'eq.' + expectedStatus,
        select: 'id,status,started_at,completed_at,updated_at',
      },
      prefer: 'return=representation',
      body: update,
    });
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : false;
  }

  async getRun(id, tenantId) {
    requireUuid(id, 'run id');
    requireUuid(tenantId, 'run tenantId');
    const rows = await this._request('rhns_runs', {
      query: {
        id: 'eq.' + id,
        tenant_id: 'eq.' + tenantId,
        select: 'id,tenant_id,run_key,actor_id,execution_mode,status,goal,output,error,metadata,started_at,completed_at,created_at,updated_at',
        limit: '1',
      },
    });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async createTask(task) {
    requireUuid(task && task.id, 'task record id');
    requireUuid(task && task.tenantId, 'task tenantId');
    requireUuid(task && task.runId, 'task runId');
    if (typeof task.taskKey !== 'string' || !task.taskKey.trim()) throw new TypeError('taskKey is required');
    if (typeof task.agentId !== 'string' || !task.agentId.trim()) throw new TypeError('agentId is required');
    if (typeof task.taskType !== 'string' || !task.taskType.trim()) throw new TypeError('taskType is required');
    if (task.status !== 'proposed') throw new TypeError('New RHNS tasks must start in proposed state');
    const input = task.input === undefined ? {} : task.input;
    assertSafePayload(input, 'task.input');

    const rows = await this._request('rhns_tasks', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        id: task.id,
        tenant_id: task.tenantId,
        run_id: task.runId,
        task_key: task.taskKey,
        agent_id: task.agentId,
        task_type: task.taskType,
        status: 'proposed',
        input,
      },
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Durable RHNS task insert did not return exactly one row');
    return rows[0];
  }

  async transitionTask(id, tenantId, expectedStatus, nextStatus, patch = {}) {
    requireUuid(id, 'task record id');
    requireUuid(tenantId, 'task tenantId');
    const transitions = {
      proposed: new Set(['approved', 'executing', 'failed', 'rejected', 'cancelled']),
      approved: new Set(['executing', 'failed', 'rejected', 'cancelled']),
      executing: new Set(['confirmed', 'failed', 'unknown_outcome', 'cancelled']),
    };
    if (!transitions[expectedStatus] || !transitions[expectedStatus].has(nextStatus)) {
      throw new Error('Invalid RHNS task state transition: ' + expectedStatus + ' -> ' + nextStatus);
    }

    const update = { status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === 'executing') update.started_at = patch.startedAt || new Date().toISOString();
    if (['confirmed', 'failed', 'unknown_outcome', 'cancelled', 'rejected'].includes(nextStatus)) {
      update.completed_at = patch.completedAt || new Date().toISOString();
    }
    for (const key of ['output', 'error']) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        assertSafePayload(patch[key], key);
        update[key] = patch[key];
      }
    }

    const rows = await this._request('rhns_tasks', {
      method: 'PATCH',
      query: {
        id: 'eq.' + id,
        tenant_id: 'eq.' + tenantId,
        status: 'eq.' + expectedStatus,
        select: 'id,status,started_at,completed_at,updated_at',
      },
      prefer: 'return=representation',
      body: update,
    });
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : false;
  }

  async create(record) {
    requireUuid(record && record.id, 'approval id');
    requireUuid(record && record.tenantId, 'approval tenantId');
    assertSafePayload(record.action, 'action');
    await this._request('rhns_action_approvals', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        id: record.id,
        tenant_id: record.tenantId,
        requested_by: record.requestedBy,
        action_hash: record.actionHash,
        action: record.action,
        state: record.state,
        created_at_ms: record.createdAt,
        expires_at_ms: record.expiresAt,
        consumed_at_ms: record.consumedAt,
        approved_by: record.approvedBy,
        approved_at_ms: record.approvedAt,
      },
    });
  }

  async get(id) {
    requireUuid(id, 'approval id');
    const rows = await this._request('rhns_action_approvals', {
      query: { id: 'eq.' + id, select: APPROVAL_COLUMNS, limit: '1' },
    });
    return Array.isArray(rows) && rows.length ? mapApproval(rows[0]) : null;
  }

  async compareAndSet(id, expectedState, updated) {
    requireUuid(id, 'approval id');
    requireUuid(updated && updated.tenantId, 'approval tenantId');
    if (expectedState !== 'pending' || !updated || updated.state !== 'approved') return false;
    const rows = await this._request('rhns_action_approvals', {
      method: 'PATCH',
      query: {
        id: 'eq.' + id,
        tenant_id: 'eq.' + updated.tenantId,
        action_hash: 'eq.' + updated.actionHash,
        state: 'eq.pending',
        expires_at_ms: 'gt.' + updated.approvedAt,
        select: 'id',
      },
      prefer: 'return=representation',
      body: { state: 'approved', approved_by: updated.approvedBy, approved_at_ms: updated.approvedAt },
    });
    return Array.isArray(rows) && rows.length === 1;
  }

  async consumeIfMatches(id, actionHash, consumedAt) {
    requireUuid(id, 'approval id');
    const rows = await this._request('rhns_action_approvals', {
      method: 'PATCH',
      query: {
        id: 'eq.' + id,
        action_hash: 'eq.' + actionHash,
        state: 'eq.approved',
        expires_at_ms: 'gt.' + consumedAt,
        select: 'id',
      },
      prefer: 'return=representation',
      body: { state: 'consumed', consumed_at_ms: consumedAt },
    });
    return Array.isArray(rows) && rows.length === 1;
  }

  async listProposals(tenantId, { state = 'draft_pending_review', limit = 100, offset = 0 } = {}) {
    requireUuid(tenantId, 'proposal tenantId');
    const allowedStates = new Set(['draft_pending_review', 'approved', 'rejected', 'cancelled']);
    if (!allowedStates.has(state)) throw new TypeError('Unsupported proposal state');
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Proposal limit must be an integer from 1 to 500');
    if (!Number.isInteger(offset) || offset < 0) throw new TypeError('Proposal offset must be a non-negative integer');
    const rows = await this._request('rhns_proposals', {
      query: {
        tenant_id: 'eq.' + tenantId,
        state: 'eq.' + state,
        select: 'proposal_id,proposal_hash,proposal,created_at',
        order: 'created_at.desc,proposal_id.asc',
        limit,
        offset,
      },
    });
    return Array.isArray(rows) ? rows.map((row) => ({
      ...row.proposal,
      durableRecord: {
        tenantId,
        proposalId: row.proposal_id,
        proposalHash: row.proposal_hash,
        createdAt: row.created_at,
      },
    })) : [];
  }

  async getProposal(tenantId, proposalId) {
    requireUuid(tenantId, 'proposal tenantId');
    if (typeof proposalId !== 'string' || !proposalId.trim()) throw new TypeError('proposalId is required');
    const rows = await this._request('rhns_proposals', {
      query: {
        tenant_id: 'eq.' + tenantId,
        proposal_id: 'eq.' + proposalId,
        select: 'proposal_id,proposal_hash,proposal,created_at',
        limit: '1',
      },
    });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row.proposal,
      durableRecord: {
        tenantId,
        proposalId: row.proposal_id,
        proposalHash: row.proposal_hash,
        createdAt: row.created_at,
      },
    };
  }

  async recordProposals(proposals, tenantId) {
    requireUuid(tenantId, 'proposal tenantId');
    if (!Array.isArray(proposals) || proposals.length === 0) {
      throw new TypeError('At least one proposal is required');
    }

    const rowsToInsert = [];
    const expectedHashes = new Map();
    for (const proposal of proposals) {
      if (!proposal || typeof proposal.proposalId !== 'string' || !proposal.proposalId
        || typeof proposal.taskId !== 'string' || !proposal.taskId
        || typeof proposal.agentId !== 'string' || !proposal.agentId
        || typeof proposal.taskType !== 'string' || !proposal.taskType) {
        throw new TypeError('Proposal is missing a required identity field');
      }
      assertSafePayload(proposal, 'proposal');
      const hashable = { ...proposal };
      delete hashable.createdAt;
      const proposalHash = canonicalHash(hashable);
      expectedHashes.set(proposal.proposalId, proposalHash);

      const existing = await this._request('rhns_proposals', {
        query: {
          tenant_id: 'eq.' + tenantId,
          proposal_id: 'eq.' + proposal.proposalId,
          select: 'proposal_hash',
          limit: '1',
        },
      });
      if (Array.isArray(existing) && existing.length) {
        if (existing[0].proposal_hash !== proposalHash) {
          throw new Error('Proposal ID collision: stored proposal content differs for ' + proposal.proposalId);
        }
        continue;
      }
      rowsToInsert.push({
        tenant_id: tenantId,
        proposal_id: proposal.proposalId,
        task_id: proposal.taskId,
        agent_id: proposal.agentId,
        task_type: proposal.taskType,
        state: proposal.state || 'draft_pending_review',
        execution_mode: proposal.executionMode || 'proposal_only',
        proposal_hash: proposalHash,
        proposal,
        created_at: proposal.createdAt || new Date().toISOString(),
      });
    }

    if (rowsToInsert.length) {
      try {
        await this._request('rhns_proposals', {
          method: 'POST',
          prefer: 'return=minimal',
          body: rowsToInsert,
        });
      } catch (error) {
        // A concurrent identical insert can win after the preflight read. Verify
        // the existing records once; never overwrite a conflicting proposal.
        if (!/HTTP 409/.test(error.message)) throw error;
        for (const proposal of proposals) {
          const existing = await this._request('rhns_proposals', {
            query: {
              tenant_id: 'eq.' + tenantId,
              proposal_id: 'eq.' + proposal.proposalId,
              select: 'proposal_hash',
              limit: '1',
            },
          });
          if (!Array.isArray(existing) || !existing.length
            || existing[0].proposal_hash !== expectedHashes.get(proposal.proposalId)) {
            throw new Error('Concurrent proposal insert could not be reconciled safely');
          }
        }
        return { recorded: 0, alreadyPresent: proposals.length };
      }
    }
    return { recorded: rowsToInsert.length, alreadyPresent: proposals.length - rowsToInsert.length };
  }

  async appendEvent(event, tenantId) {
    requireUuid(tenantId, 'event tenantId');
    if (!event || typeof (event.type || event.event_type) !== 'string') {
      throw new TypeError('event type is required');
    }
    const payload = event.data || event.payload || {};
    assertSafePayload(payload);
    const rows = await this._request('crf_events', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        tenant_id: tenantId,
        event_type: event.type || event.event_type,
        severity: event.severity || 'info',
        fingerprint: event.fingerprint || canonicalHash({ type: event.type || event.event_type, payload }),
        occurred_at: event.timestamp || new Date().toISOString(),
        source: event.source || 'rhns-agent-runtime',
        correlation_id: event.correlationId || event.correlation_id || null,
        payload,
      },
    });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async appendEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object') throw new TypeError('evidence is required');
    requireUuid(evidence.tenantId, 'evidence tenantId');
    requireUuid(evidence.entityId, 'evidence entityId');
    if (!evidence.entityType || !evidence.evidenceType) throw new TypeError('evidence entityType and evidenceType are required');
    const content = evidence.content || {};
    assertSafePayload(content);
    const rows = await this._request('crf_evidence', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        tenant_id: evidence.tenantId,
        entity_type: evidence.entityType,
        entity_id: evidence.entityId,
        evidence_type: evidence.evidenceType,
        source: evidence.source || 'rhns-agent-runtime',
        content_hash: evidence.contentHash || canonicalHash(content),
        content,
        collected_at: evidence.collectedAt || new Date().toISOString(),
      },
    });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
}

module.exports = SupabaseRhnsStore;
