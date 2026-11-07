'use strict';
const crypto = require('crypto');
const ACTIONS = new Set(['runtime_health_check', 'agent_inventory', 'readiness_check']);

function createDirectiveHttp(executeTask, { secret = process.env.GARCAR_WORKER_DISPATCH_SECRET || '' } = {}) {
  const receipts = new Map();
  let busy = false;
  return async function handle(request, response) {
    const reply = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (Buffer.byteLength(secret) < 32) return reply(503, { error: 'worker_signing_not_configured' });
    const chunks = [];
    let size = 0;
    try {
      request.setTimeout(5000, () => request.destroy());
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4096) return reply(413, { error: 'payload_too_large' });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex'));
      const actual = Buffer.from(String(request.headers['x-dispatch-sig'] || ''));
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return reply(403, { error: 'invalid_signature' });
      const data = JSON.parse(body.toString('utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !['directive_id', 'action', 'issued_at'].includes(k))) return reply(422, { error: 'invalid_fields' });
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(data.directive_id || '') || !ACTIONS.has(data.action)) return reply(422, { error: 'unsupported_directive' });
      if (typeof data.issued_at !== 'number' || !Number.isFinite(data.issued_at) || Math.abs(Date.now()/1000-data.issued_at)>300) return reply(403, { error: 'expired_signature' });
      const digest = crypto.createHash('sha256').update(body).digest('hex');
      const existing = receipts.get(data.directive_id);
      if (existing) {
        if (existing.digest !== digest) return reply(409, { error: 'directive_conflict' });
        return reply(existing.result ? 200 : 202, existing.result || { status: 'running', directive_id: data.directive_id });
      }
      if (busy) return reply(429, { error: 'worker_busy' });
      // Bounded cache; dispatcher owns durable idempotency and recovery.
      if (receipts.size >= 1000) return reply(503, { error: 'worker_receipt_capacity' });
      busy = true;
      const record = { digest, result: null };
      receipts.set(data.directive_id, record);
      try {
        const result = await executeTask({ action: data.action, taskId: data.directive_id });
        record.result = { directive_id: data.directive_id, status: result?.success === true ? 'completed' : 'failed', checked_at: new Date().toISOString(), read_only: true, result };
        return reply(200, record.result);
      } catch (error) {
        record.result = { directive_id: data.directive_id, status: 'failed', error: 'worker_execution_failed', read_only: true };
        return reply(200, record.result);
      } finally { busy = false; }
    } catch (error) { return reply(400, { error: 'invalid_request' }); }
  };
}
module.exports = { createDirectiveHttp };
