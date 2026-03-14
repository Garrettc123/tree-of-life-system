/**
 * Server integration tests for Tree of Life System
 * Tests all API endpoints and integration status checks
 */

const request = require('supertest');
const app = require('../server');

describe('Tree of Life System - Server Tests', () => {
  describe('Core Endpoints', () => {
    it('GET / returns service info', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('Tree of Life System');
      expect(res.body.version).toBe('2.4.0');
      expect(Array.isArray(res.body.integrations)).toBe(true);
    });

    it('GET /health returns health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /api/v1/status returns integration status', async () => {
      const res = await request(app).get('/api/v1/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('operational');
      expect(res.body.integrations).toBeDefined();
      expect(res.body.integrations.github).toBeDefined();
      expect(res.body.integrations.linear).toBeDefined();
      expect(res.body.integrations.notion).toBeDefined();
      expect(res.body.integrations.perplexity).toBeDefined();
    });

    it('GET /dashboard serves dashboard HTML', async () => {
      const res = await request(app).get('/dashboard');
      expect(res.status).toBe(200);
      expect(res.type).toMatch(/html/);
    });

    it('GET /nonexistent returns 404', async () => {
      const res = await request(app).get('/nonexistent-route-xyz');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });
  });

  describe('GitHub Integration Endpoints', () => {
    let savedToken;
    beforeEach(() => { savedToken = process.env.GITHUB_TOKEN; });
    afterEach(() => {
      if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken;
      else delete process.env.GITHUB_TOKEN;
    });

    it('GET /api/v1/github/status returns not_configured without token', async () => {
      delete process.env.GITHUB_TOKEN;
      const res = await request(app).get('/api/v1/github/status');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_configured');
    });

    it('POST /api/v1/github/webhook accepts webhook payload', async () => {
      const res = await request(app)
        .post('/api/v1/github/webhook')
        .set('X-GitHub-Event', 'push')
        .send({ ref: 'refs/heads/main', repository: { name: 'test' } });
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.event).toBe('push');
    });
  });

  describe('Linear Integration Endpoints', () => {
    let savedKey;
    beforeEach(() => { savedKey = process.env.LINEAR_API_KEY; });
    afterEach(() => {
      if (savedKey !== undefined) process.env.LINEAR_API_KEY = savedKey;
      else delete process.env.LINEAR_API_KEY;
    });

    it('GET /api/v1/linear/status returns not_configured without key', async () => {
      delete process.env.LINEAR_API_KEY;
      const res = await request(app).get('/api/v1/linear/status');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_configured');
    });

    it('POST /api/v1/linear/webhook accepts webhook payload', async () => {
      const res = await request(app)
        .post('/api/v1/linear/webhook')
        .send({ action: 'create', data: { type: 'Issue', id: 'test-id' } });
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe('Notion Integration Endpoints', () => {
    let savedToken;
    beforeEach(() => { savedToken = process.env.NOTION_TOKEN; });
    afterEach(() => {
      if (savedToken !== undefined) process.env.NOTION_TOKEN = savedToken;
      else delete process.env.NOTION_TOKEN;
    });

    it('GET /api/v1/notion/status returns not_configured without token', async () => {
      delete process.env.NOTION_TOKEN;
      const res = await request(app).get('/api/v1/notion/status');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_configured');
    });

    it('POST /api/v1/notion/webhook accepts webhook payload', async () => {
      const res = await request(app)
        .post('/api/v1/notion/webhook')
        .send({ type: 'page', id: 'test-page-id' });
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe('Perplexity Integration Endpoints', () => {
    let savedKey;
    beforeEach(() => { savedKey = process.env.PERPLEXITY_API_KEY; });
    afterEach(() => {
      if (savedKey !== undefined) process.env.PERPLEXITY_API_KEY = savedKey;
      else delete process.env.PERPLEXITY_API_KEY;
    });

    it('GET /api/v1/perplexity/status returns not_configured without key', async () => {
      delete process.env.PERPLEXITY_API_KEY;
      const res = await request(app).get('/api/v1/perplexity/status');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_configured');
    });

    it('POST /api/v1/perplexity/search returns error without query', async () => {
      process.env.PERPLEXITY_API_KEY = 'test-key';
      const res = await request(app)
        .post('/api/v1/perplexity/search')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('query is required');
    });
  });

  describe('Integration Status Object', () => {
    let savedTokens;
    beforeEach(() => {
      savedTokens = {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        LINEAR_API_KEY: process.env.LINEAR_API_KEY,
        NOTION_TOKEN: process.env.NOTION_TOKEN,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY
      };
    });
    afterEach(() => {
      Object.entries(savedTokens).forEach(([k, v]) => {
        if (v !== undefined) process.env[k] = v;
        else delete process.env[k];
      });
    });

    it('integration status reflects configured keys', async () => {
      process.env.GITHUB_TOKEN = 'test-gh-token';
      delete process.env.LINEAR_API_KEY;
      delete process.env.NOTION_TOKEN;
      delete process.env.PERPLEXITY_API_KEY;

      const res = await request(app).get('/api/v1/status');
      expect(res.status).toBe(200);
      expect(res.body.integrations.github.configured).toBe(true);
      expect(res.body.integrations.github.status).toBe('connected');
      expect(res.body.integrations.linear.configured).toBe(false);
      expect(res.body.integrations.notion.configured).toBe(false);
      expect(res.body.integrations.perplexity.configured).toBe(false);
    });
  });
});
