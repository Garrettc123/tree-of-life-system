const http = require('http');

function createHealthServer(getSnapshot) {
  return http.createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { 'content-type': 'application/json; charset=utf-8', allow: 'GET' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    const snapshot = getSnapshot();

    if (pathname === '/status') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(snapshot));
      return;
    }

    if (pathname !== '/health' && pathname !== '/ready') {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const serverStarted = snapshot.startup_completed === true && snapshot.grpc?.status === 'listening';
    const handlersConfigured = snapshot.agents?.registered > 0
      && snapshot.agents.operational === snapshot.agents.registered;
    const ready = serverStarted && handlersConfigured;
    const live = serverStarted;
    const ok = pathname === '/health' ? live : ready;

    response.writeHead(ok ? 200 : 503, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify({
      ...snapshot,
      live,
      ready,
      health_path: pathname,
    }));
  });
}

module.exports = { createHealthServer };
