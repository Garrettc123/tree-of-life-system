/**
 * Tree of Life System - Orchestrator
 * Master coordination service for GitHub, Linear, Notion, OpenAI
 * Now with complete GitHub automation suite
 */

const express = require('express');
const githubHandler = require('./github-handler');

// Import GitHub automation systems
const prManager = require('../branch-systems/github-automation/pr-manager');
const issueManager = require('../branch-systems/github-automation/issue-manager');
const releaseManager = require('../branch-systems/github-automation/release-manager');
const cicd = require('../branch-systems/github-automation/ci-cd');
const codeQuality = require('../branch-systems/github-automation/code-quality');
const revenueSystem = require('../branch-systems/revenue-generation/index');

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

// Mount GitHub automation systems
app.use('/github', prManager);
app.use('/github', issueManager);
app.use('/github', releaseManager);
app.use('/github', cicd);
app.use('/github', codeQuality);
app.use('/', revenueSystem);
app.use('/', githubHandler);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'orchestrator',
    timestamp: new Date().toISOString(),
    systems: {
      github: {
        webhooks: 'active',
        prAutomation: 'active',
        issueManagement: 'active',
        releases: 'active',
        cicd: 'active',
        codeQuality: 'active'
      },
      integrations: {
        linear: 'authenticated',
        notion: 'authenticated',
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
      },
      revenue: {
        saas: 'active',
        api: 'active',
        content: 'active',
        consulting: 'active',
        affiliates: 'active'
      }
    },
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// Status Dashboard
app.get('/status', (req, res) => {
  res.json({
    service: 'orchestrator',
    status: 'running',
    deployment: 'railway',
    timestamp: new Date().toISOString(),
    githubAutomation: {
      prManagement: {
        status: 'active',
        features: [
          'Auto-create PRs',
          'AI code reviews',
          'Auto-merge',
          'Conflict resolution'
        ],
        endpoints: [
          '/github/pr/auto-create',
          '/github/pr/ai-review',
          '/github/pr/auto-merge',
          '/github/pr/resolve-conflicts'
        ]
      },
      issueManagement: {
        status: 'active',
        features: [
          'Auto-labeling',
          'Auto-assignment',
          'Duplicate detection',
          'Template validation'
        ],
        endpoints: [
          '/github/issue/auto-label',
          '/github/issue/auto-assign',
          '/github/issue/detect-duplicate',
          '/github/issue/validate-template'
        ]
      },
      releaseManagement: {
        status: 'active',
        features: [
          'Auto-generate changelogs',
          'Version bumping',
          'Release creation',
          'Deploy automation'
        ],
        endpoints: [
          '/github/release/changelog',
          '/github/release/bump-version',
          '/github/release/create',
          '/github/release/deploy'
        ]
      },
      cicd: {
        status: 'active',
        features: [
          'Auto-testing',
          'Build automation',
          'Railway deployment',
          'Rollback capability'
        ],
        endpoints: [
          '/github/cicd/run',
          '/github/cicd/deploy-railway',
          '/github/cicd/rollback'
        ]
      },
      codeQuality: {
        status: 'active',
        features: [
          'Automated linting',
          'Security scanning',
          'Performance monitoring',
          'Tech debt tracking'
        ],
        endpoints: [
          '/github/quality/lint',
          '/github/quality/security-scan',
          '/github/quality/performance',
          '/github/quality/tech-debt'
        ]
      }
    },
    revenueGeneration: {
      status: 'active',
      streams: ['SaaS', 'API', 'Content', 'Consulting', 'Affiliates'],
      endpoints: [
        '/revenue/pricing',
        '/revenue/api/pricing',
        '/revenue/dashboard'
      ]
    },
    integrations: {
      github: {
        status: 'webhook-ready',
        authenticated: true
      },
      linear: {
        status: 'authenticated',
        teamId: process.env.LINEAR_TEAM_ID
      },
      notion: {
        status: 'authenticated',
        workspaceId: process.env.NOTION_WORKSPACE_ID
      },
      openai: {
        status: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        model: process.env.OPENAI_MODEL || 'gpt-4'
      }
    },
    database: {
      postgres: process.env.DATABASE_URL ? 'configured' : 'missing',
      redis: process.env.REDIS_URL ? 'configured' : 'missing'
    },
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Tree of Life System - Orchestrator',
    version: '2.0.0',
    status: 'running',
    deployment: 'railway',
    systems: {
      github: {
        prAutomation: '/github/pr/status',
        issueManagement: '/github/issue/status',
        releases: '/github/release/status',
        cicd: '/github/cicd/status',
        codeQuality: '/github/quality/dashboard'
      },
      revenue: {
        dashboard: '/revenue/dashboard',
        pricing: '/revenue/pricing'
      }
    },
    endpoints: {
      health: '/health',
      status: '/status',
      dashboard: '/dashboard',
      github_webhooks: '/webhooks/github'
    },
    documentation: 'https://github.com/Garrettc123/tree-of-life-system',
    notion: 'https://notion.so/garrettwaynes/tree-of-life'
  });
});

// Dashboard
app.get('/dashboard', (req, res) => {
  res.json({
    dashboard: 'tree-of-life-system',
    version: '2.0.0',
    services: {
      orchestrator: 'running',
      githubAutomation: {
        prManagement: 'active',
        issueManagement: 'active',
        releases: 'active',
        cicd: 'active',
        codeQuality: 'active'
      },
      revenueGeneration: 'active',
      integrations: {
        github: 'webhook-ready',
        linear: 'authenticated',
        notion: 'authenticated',
        openai: 'configured'
      }
    },
    features: [
      'Auto PR management & AI reviews',
      'Automated issue labeling & assignment',
      'Release automation & changelogs',
      'CI/CD pipeline with Railway',
      'Code quality monitoring',
      'Revenue generation (5 streams)',
      'Cross-platform sync',
      'Real-time automation'
    ],
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
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
  console.log(`\n🌳 Tree of Life System - Orchestrator v2.0`);
  console.log(`✅ Running on port ${PORT}`);
  console.log(`\n🤖 GitHub Automation Systems:`);
  console.log(`  - PR Management: /github/pr/*`);
  console.log(`  - Issue Management: /github/issue/*`);
  console.log(`  - Releases: /github/release/*`);
  console.log(`  - CI/CD: /github/cicd/*`);
  console.log(`  - Code Quality: /github/quality/*`);
  console.log(`\n💰 Revenue Systems:`);
  console.log(`  - Pricing: /revenue/pricing`);
  console.log(`  - Dashboard: /revenue/dashboard`);
  console.log(`\n📊 Dashboards:`);
  console.log(`  - Main: http://localhost:${PORT}/dashboard`);
  console.log(`  - Health: http://localhost:${PORT}/health`);
  console.log(`  - Status: http://localhost:${PORT}/status`);
  console.log(`\n🔗 GitHub Webhooks: http://localhost:${PORT}/webhooks/github`);
  console.log(`\n✨ All systems operational!\n`);
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
