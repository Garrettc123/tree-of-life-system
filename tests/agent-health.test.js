const http = require('http');
const { createHealthServer } = require('../agents/health-server');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: JSON.parse(body),
      }));
    }).on('error', reject);
  });
}

describe('agent runtime health endpoints', () => {
  let snapshot;
  let server;
  let baseUrl;

  beforeEach(async () => {
    snapshot = {
      service: 'tree-of-life-agent-runtime',
      status: 'degraded',
      startup_completed: true,
      grpc: { status: 'listening' },
      agents: { registered: 3, operational: 0, list: [] },
    };
    server = createHealthServer(() => snapshot);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('/health reports process liveness without claiming agents are ready', async () => {
    const result = await get(`${baseUrl}/health`);
    expect(result.statusCode).toBe(200);
    expect(result.body.live).toBe(true);
    expect(result.body.ready).toBe(false);
  });

  test('/ready blocks when no agent handler is configured', async () => {
    const result = await get(`${baseUrl}/ready`);
    expect(result.statusCode).toBe(503);
    expect(result.body.ready).toBe(false);
  });

  test('/ready succeeds only when the runtime and handlers are ready', async () => {
    snapshot.status = 'ready';
    snapshot.agents.operational = 3;
    const result = await get(`${baseUrl}/ready`);
    expect(result.statusCode).toBe(200);
    expect(result.body.ready).toBe(true);
  });

  test('/status remains inspectable during degraded operation', async () => {
    const result = await get(`${baseUrl}/status`);
    expect(result.statusCode).toBe(200);
    expect(result.body.agents.operational).toBe(0);
    expect(result.body.status).toBe('degraded');
  });
});
