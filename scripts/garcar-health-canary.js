#!/usr/bin/env node
'use strict';

// Read-only Railway cron canary. It performs HTTP GETs only and never calls
// business, payment, outreach, deployment, or repair operations.

const timeoutMs = Number.parseInt(process.env.GARCAR_CANARY_TIMEOUT_MS || '7000', 10);
const targets = [
  {
    name: 'web',
    url: process.env.GARCAR_WEB_HEALTH_URL,
    readinessRequired: false,
  },
  {
    name: 'worker',
    url: process.env.GARCAR_WORKER_READY_URL,
    readinessRequired: true,
  },
];

function safeResult(target, response, payload) {
  return {
    name: target.name,
    http_status: response.status,
    service_status: typeof payload.status === 'string' ? payload.status : 'unknown',
    ready: typeof payload.ready === 'boolean' ? payload.ready : null,
    startup_completed: typeof payload.startup_completed === 'boolean'
      ? payload.startup_completed : null,
  };
}

async function probe(target) {
  if (!target.url) {
    return { name: target.name, ok: false, error: 'target_not_configured' };
  }

  try {
    const response = await fetch(target.url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    const result = safeResult(target, response, payload);
    const readySatisfied = !target.readinessRequired || payload.ready === true;
    return {
      ...result,
      ok: response.ok && readySatisfied,
      ...(response.ok && readySatisfied ? {} : { error: 'health_check_failed' }),
    };
  } catch (error) {
    return {
      name: target.name,
      ok: false,
      error: error && error.name === 'TimeoutError' ? 'timeout' : 'connection_failed',
    };
  }
}

async function main() {
  const results = await Promise.all(targets.map(probe));
  const ok = results.every((result) => result.ok);
  process.stdout.write(JSON.stringify({
    event: 'garcar.read_only_health_canary',
    checked_at: new Date().toISOString(),
    ok,
    results,
  }) + '\n');
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({
    event: 'garcar.read_only_health_canary',
    ok: false,
    error: error && error.name ? error.name : 'unexpected_error',
  }) + '\n');
  process.exitCode = 1;
});
