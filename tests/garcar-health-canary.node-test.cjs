'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const script = path.join(__dirname, '..', 'scripts', 'garcar-health-canary.js');

async function probeCase(workerReady) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') {
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.url === '/ready') {
      res.statusCode = workerReady ? 200 : 503;
      res.end(JSON.stringify({ status: workerReady ? 'ready' : 'degraded', ready: workerReady }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port;
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], {
        env: {
          ...process.env,
          GARCAR_WEB_HEALTH_URL: base + '/health',
          GARCAR_WORKER_READY_URL: base + '/ready',
          GARCAR_CANARY_TIMEOUT_MS: '2000'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', code => resolve({ code, stdout, stderr }));
    });
    return result;
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('passes only when web and worker are healthy', async () => {
  const result = await probeCase(true);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test('fails closed when worker is not ready', async () => {
  const result = await probeCase(false);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});
