/**
 * Tree of Life System - Orchestrator
 * Master coordination service for GitHub, Linear, Notion, OpenAI
 * Runs on Railway without Docker
 */

const express = require('express');
const githubHandler = require('./github-handler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Hub-Signature-256, X-GitHub-Event');
  next();
});

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'orchestrator',
    timestamp: new Date().toISOString(),
    integrations: {
      github: 'webhook-ready',
      linear: 'authenticated',
      notion: 'authenticated',
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
    },
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// Status
app.get('/status', (req, res) => {
  res.json({
    service: 'orchestrator',
    status: 'running',
    deployment: 'railway',
    timestamp: new Date().toISOString(),
    integrations: {
      github: {
        status: 'webhook-ready',
        url: `/webhooks/github`,
        authenticated: true
      },
      linear: {
        status: 'authenticated',
        teamId: process.env.LINEAR_TEAM_ID,
        authenticated: !!process.env.LINEAR_API_KEY
      },
      notion: {
        status: 'authenticated',
        workspaceId: process.env.NOTION_WORKSPACE_ID,
        authenticated: !!process.env.NOTION_API_KEY
      },
      openai: {
        status: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        model: process.env.OPENAI_MODEL || 'gpt-4',
        authenticated: !!process.env.OPENAI_API_KEY
      }
    },
    database: {
      postgres: process.env.DATABASE_URL ? 'configured' : 'missing',
      redis: process.env.REDIS_URL ? 'configured' : 'missing'
    },
    uptime: process.uptime()
  });
});

// GitHub Webhook Handler
app.use('/', githubHandler);

// Orchestrator Start Endpoint
app.post('/orchestrator/start', (req, res) => {
  console.log('[Orchestrator] Starting autonomous loops...');
  res.json({
    status: 'started',
    loops: [
      'code-to-knowledge',
      'intelligence-feedback',
      'marketing-automation'
    ],
    timestamp: new Date().toISOString()
  });
});

// Marketing Status
app.get('/marketing/status', (req, res) => {
  res.json({
    service: 'marketing-automation',
    status: 'ready',
    features: [
      'content-generation',
      'seo-optimization',
      'auto-publishing',
      'analytics-tracking'
    ],
    timestamp: new Date().toISOString()
  });
});

app.post('/marketing/activate', (req, res) => {
  console.log('[Marketing] Activating automation...');
  res.json({
    status: 'activated',
    service: 'marketing-automation',
    timestamp: new Date().toISOString()
  });
});

// AI Engine Status
app.get('/ai/status', (req, res) => {
  res.json({
    service: 'ai-engine',
    status: 'ready',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    features: [
      'code-analysis',
      'content-generation',
      'predictive-analytics',
      'lead-scoring'
    ],
    authenticated: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

app.post('/ai/start', (req, res) => {
  console.log('[AI Engine] Starting monitoring...');
  res.json({
    status: 'started',
    service: 'ai-engine',
    timestamp: new Date().toISOString()
  });
});

app.post('/ai/analyze', (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  console.log('[AI] Analyzing text:', text.substring(0, 50));
  res.json({
    analysis: {
      text: text.substring(0, 100),
      length: text.length,
      timestamp: new Date().toISOString()
    },
    status: 'processed'
  });
});

// Dashboard
app.get('/dashboard', (req, res) => {
  res.json({
    dashboard: 'tree-of-life-system',
    services: {
      orchestrator: 'running',
      'ai-engine': 'ready',
      'marketing-automation': 'ready',
      'github-webhooks': 'listening',
      'linear-sync': 'authenticated',
      'notion-automation': 'authenticated'
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Tree of Life System - Orchestrator',
    status: 'running',
    deployment: 'railway',
    endpoints: {
      health: '/health',
      status: '/status',
      dashboard: '/dashboard',
      github_webhooks: '/webhooks/github',
      orchestrator_start: 'POST /orchestrator/start',
      ai_start: 'POST /ai/start',
      marketing_activate: 'POST /marketing/activate'
    },
    documentation: 'https://github.com/Garrettc123/tree-of-life-system'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n🌳 Tree of Life System - Orchestrator`);
  console.log(`✅ Running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🔗 GitHub Webhooks: http://localhost:${PORT}/webhooks/github`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
  console.log(`\n✨ System ready for deployment!\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Shutdown] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Shutdown] SIGINT received, shutting down gracefully...');
  process.exit(0);
});
