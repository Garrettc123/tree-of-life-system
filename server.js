/**
 * Main server entrypoint for tree-of-life-system
 * Multiplex AI Business Platform integrating GitHub, Linear, Notion & Perplexity
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

// ─── Health & Status ────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Tree of Life System',
    version: '2.4.0',
    description: 'Multiplex AI Business Platform',
    integrations: ['GitHub', 'Linear', 'Notion', 'Perplexity'],
    dashboard: '/dashboard',
    docs: '/api/v1/status'
  });
});

// Serve static dashboard (after API routes so / returns JSON)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '2.4.0'
  });
});

app.get('/api/v1/status', (req, res) => {
  res.json({
    status: 'operational',
    integrations: {
      github: {
        configured: !!process.env.GITHUB_TOKEN,
        status: process.env.GITHUB_TOKEN ? 'connected' : 'not_configured'
      },
      linear: {
        configured: !!process.env.LINEAR_API_KEY,
        status: process.env.LINEAR_API_KEY ? 'connected' : 'not_configured'
      },
      notion: {
        configured: !!process.env.NOTION_TOKEN,
        status: process.env.NOTION_TOKEN ? 'connected' : 'not_configured'
      },
      perplexity: {
        configured: !!process.env.PERPLEXITY_API_KEY,
        status: process.env.PERPLEXITY_API_KEY ? 'connected' : 'not_configured'
      }
    }
  });
});

app.get('/dashboard', apiLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ─── GitHub Integration ──────────────────────────────────────────────────────

app.get('/api/v1/github/status', async (req, res) => {
  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ status: 'not_configured', message: 'GITHUB_TOKEN not set' });
  }
  try {
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    res.json({ status: 'connected', user: response.data.login, scopes: response.headers['x-oauth-scopes'] });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/v1/github/repos', async (req, res) => {
  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'GITHUB_TOKEN not set' });
  }
  try {
    const owner = process.env.GITHUB_OWNER || 'Garrettc123';
    const response = await axios.get(`https://api.github.com/users/${owner}/repos`, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
      params: { per_page: 30, sort: 'updated' }
    });
    res.json({ repos: response.data.map(r => ({ name: r.name, url: r.html_url, updated_at: r.updated_at })) });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post('/api/v1/github/webhook', express.json({ type: '*/*' }), (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;
  console.log(`[GitHub Webhook] Event: ${event}`, JSON.stringify(payload).slice(0, 200));
  res.json({ received: true, event });
});

// ─── Linear Integration ──────────────────────────────────────────────────────

app.get('/api/v1/linear/status', async (req, res) => {
  if (!process.env.LINEAR_API_KEY) {
    return res.status(503).json({ status: 'not_configured', message: 'LINEAR_API_KEY not set' });
  }
  try {
    const response = await axios.post(
      'https://api.linear.app/graphql',
      { query: '{ viewer { id name email } }' },
      { headers: { Authorization: process.env.LINEAR_API_KEY, 'Content-Type': 'application/json' } }
    );
    const viewer = response.data.data && response.data.data.viewer;
    res.json({ status: 'connected', user: viewer });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/v1/linear/issues', async (req, res) => {
  if (!process.env.LINEAR_API_KEY) {
    return res.status(503).json({ error: 'LINEAR_API_KEY not set' });
  }
  try {
    const teamFilter = process.env.LINEAR_TEAM_ID ? `(filter: { team: { id: { eq: "${process.env.LINEAR_TEAM_ID}" } } })` : '';
    const response = await axios.post(
      'https://api.linear.app/graphql',
      { query: `{ issues${teamFilter} { nodes { id title state { name } priority createdAt } } }` },
      { headers: { Authorization: process.env.LINEAR_API_KEY, 'Content-Type': 'application/json' } }
    );
    res.json(response.data.data || {});
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post('/api/v1/linear/webhook', express.json({ type: '*/*' }), (req, res) => {
  const payload = req.body;
  console.log('[Linear Webhook]', JSON.stringify(payload).slice(0, 200));
  res.json({ received: true });
});

// ─── Notion Integration ──────────────────────────────────────────────────────

app.get('/api/v1/notion/status', async (req, res) => {
  if (!process.env.NOTION_TOKEN) {
    return res.status(503).json({ status: 'not_configured', message: 'NOTION_TOKEN not set' });
  }
  try {
    const response = await axios.get('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28'
      }
    });
    res.json({ status: 'connected', user: response.data });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/v1/notion/pages', async (req, res) => {
  if (!process.env.NOTION_TOKEN) {
    return res.status(503).json({ error: 'NOTION_TOKEN not set' });
  }
  try {
    const response = await axios.post(
      'https://api.notion.com/v1/search',
      { filter: { property: 'object', value: 'page' }, page_size: 20 },
      {
        headers: {
          Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post('/api/v1/notion/webhook', express.json({ type: '*/*' }), (req, res) => {
  const payload = req.body;
  console.log('[Notion Webhook]', JSON.stringify(payload).slice(0, 200));
  res.json({ received: true });
});

// ─── Perplexity Integration ──────────────────────────────────────────────────

app.get('/api/v1/perplexity/status', (req, res) => {
  if (!process.env.PERPLEXITY_API_KEY) {
    return res.status(503).json({ status: 'not_configured', message: 'PERPLEXITY_API_KEY not set' });
  }
  res.json({ status: 'configured', model: process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-small-128k-online' });
});

app.post('/api/v1/perplexity/search', async (req, res) => {
  if (!process.env.PERPLEXITY_API_KEY) {
    return res.status(503).json({ error: 'PERPLEXITY_API_KEY not set' });
  }
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }
  try {
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: query }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// ─── Error handling ──────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tree of Life System API listening on port ${PORT}`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`Dashboard:    http://0.0.0.0:${PORT}/dashboard`);
    console.log(`Status:       http://0.0.0.0:${PORT}/api/v1/status`);
  });
}

module.exports = app;
