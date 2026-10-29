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
