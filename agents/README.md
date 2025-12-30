# 🤖 Autonomous Multi-Agent System

Self-building, self-organizing agent orchestration for the Tree of Life enterprise platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│           MCP Coordination Layer                     │
│  (Model Context Protocol - Agent Communication)      │
└─────────────────────────────────────────────────────┘
                       ↓
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼────────┐           ┌───────▼────────┐
│ Planning Agent │           │  Dev Agent     │
│ ─────────────  │           │  ─────────     │
│ • Gap Analysis │           │ • Code Gen     │
│ • Task Gen     │           │ • Repo Mgmt    │
│ • Coordination │           │ • PR Handling  │
└───────┬────────┘           └───────┬────────┘
        │                             │
┌───────▼────────┐           ┌───────▼────────┐
│ PM Agent       │           │  Doc Agent     │
│ ─────────      │           │  ─────────     │
│ • Linear Sync  │           │ • Notion Sync  │
│ • Issue Mgmt   │           │ • Wiki Updates │
│ • Workflow     │           │ • API Docs     │
└────────────────┘           └────────────────┘
```

## Agent Specifications

### 1. Planning Agent (`planning/`)
- **Purpose**: Strategic coordination and system state analysis
- **Capabilities**:
  - Monitors all Linear projects and Notion pages
  - Identifies missing implementations or documentation gaps
  - Generates execution plans for other agents
  - Prioritizes tasks based on dependencies
- **Triggers**: Scheduled (hourly) + Manual + Event-driven

### 2. Development Agent (`development/`)
- **Purpose**: Autonomous code generation and repository management
- **Capabilities**:
  - Creates GitHub repositories from Linear project specs
  - Generates boilerplate code following system architecture
  - Manages branches, commits, and pull requests
  - Runs tests and integrates with CI/CD
- **Triggers**: Planning agent tasks + Linear issue creation

### 3. Project Management Agent (`project-management/`)
- **Purpose**: Linear workflow automation
- **Capabilities**:
  - Creates issues from system requirements
  - Updates issue status based on GitHub activity
  - Manages project lifecycles and cycles
  - Assigns tasks based on dependencies and availability
- **Triggers**: GitHub events + Planning agent + Time-based

### 4. Documentation Agent (`documentation/`)
- **Purpose**: Notion knowledge base maintenance
- **Capabilities**:
  - Generates documentation from code and issues
  - Updates architecture diagrams automatically
  - Maintains integration guides and API references
  - Synchronizes information across platforms
- **Triggers**: Code commits + Issue updates + Manual

## Technical Stack

- **Orchestration**: Model Context Protocol (MCP)
- **Workflow Engine**: AFlow-inspired dynamic workflow generation
- **AI Models**: Perplexity API, OpenAI GPT-4, Claude 3.5
- **Event Bus**: GitHub Webhooks + Linear API + Notion API
- **Infrastructure**: Node.js, Python, Docker, Kubernetes
- **Observability**: Prometheus, Grafana, custom telemetry

## Directory Structure

```
agents/
├── README.md (this file)
├── core/
│   ├── mcp-coordinator.js      # MCP protocol implementation
│   ├── event-bus.js            # Event-driven coordination
│   ├── agent-registry.js       # Agent discovery and management
│   └── telemetry.js            # Observability layer
├── planning/
│   ├── gap-analyzer.js         # System state analysis
│   ├── task-generator.js       # Execution plan creation
│   └── prioritizer.js          # Dependency-based prioritization
├── development/
│   ├── repo-creator.js         # GitHub repo automation
│   ├── code-generator.js       # AI-powered code generation
│   └── pr-manager.js           # Pull request automation
├── project-management/
│   ├── issue-sync.js           # Linear issue management
│   ├── workflow-automator.js   # Automated workflows
│   └── status-tracker.js       # Progress monitoring
├── documentation/
│   ├── doc-generator.js        # Auto-documentation
│   ├── notion-sync.js          # Notion integration
│   └── diagram-updater.js      # Architecture diagrams
├── config/
│   ├── agents.config.js        # Agent configuration
│   ├── mcp.config.js           # MCP settings
│   └── integrations.config.js  # API credentials
└── tests/
    ├── unit/                   # Unit tests for agents
    ├── integration/            # Integration tests
    └── e2e/                    # End-to-end workflows
```

## Getting Started

### Prerequisites
```bash
# Node.js 18+
node --version

# Environment variables
cp .env.example .env
# Add: GITHUB_TOKEN, LINEAR_API_KEY, NOTION_TOKEN, PERPLEXITY_API_KEY
```

### Installation
```bash
cd agents
npm install
```

### Running Agents

```bash
# Start all agents in development mode
npm run dev

# Start specific agent
npm run agent:planning
npm run agent:development
npm run agent:pm
npm run agent:documentation

# Start in production mode
npm start
```

### Configuration

Edit `config/agents.config.js`:

```javascript
module.exports = {
  agents: {
    planning: {
      enabled: true,
      schedule: '0 * * * *', // Every hour
      aiModel: 'gpt-4-turbo'
    },
    development: {
      enabled: true,
      autoCommit: true,
      requiresApproval: false
    },
    projectManagement: {
      enabled: true,
      autoAssign: true,
      syncInterval: 300000 // 5 minutes
    },
    documentation: {
      enabled: true,
      autoGenerate: true,
      notionSync: true
    }
  }
};
```

## Self-Healing Architecture

### Observability Layer
- Collects comprehensive telemetry from all agents
- Monitors GitHub API rate limits, Linear sync status, Notion updates
- Tracks agent performance metrics and execution times

### Intelligence Layer
- Detects anomalies using ML-based pattern recognition
- Predicts potential failures before they occur
- Analyzes trends in agent behavior

### Decision Layer
- Evaluates remediation strategies
- Calculates impact assessments
- Selects optimal recovery actions

### Execution Layer
- Implements automated fixes
- Restarts failed agents
- Adjusts workflow parameters dynamically

## Event-Driven Workflows

### GitHub → Linear → Notion Flow
```
1. Code pushed to GitHub
2. Development Agent detects commit
3. PM Agent updates Linear issue status
4. Documentation Agent updates Notion page
5. Planning Agent analyzes impact on roadmap
```

### Linear → GitHub → Notion Flow
```
1. New Linear issue created
2. Planning Agent analyzes requirements
3. Development Agent creates repo/branch
4. PM Agent tracks progress
5. Documentation Agent generates specs in Notion
```

### Notion → Linear → GitHub Flow
```
1. New project added to Notion database
2. Planning Agent creates execution plan
3. PM Agent creates Linear project + issues
4. Development Agent scaffolds repositories
5. Documentation Agent links everything
```

## Security & Governance

- **Authentication**: OAuth2 + JWT for all API access
- **Authorization**: Behavior-centric trust enforcement (A-JWT)
- **Audit Trail**: Complete provenance tracking
- **Rate Limiting**: Intelligent throttling to prevent API abuse
- **Human Override**: Emergency stop for critical operations

## Monitoring & Observability

```bash
# View agent status
npm run status

# View logs
npm run logs:planning
npm run logs:development
npm run logs:pm
npm run logs:documentation

# Health check
curl http://localhost:3000/agents/health
```

## Development Workflow

1. **Create feature branch**: Agent automatically creates branch from Linear issue
2. **Generate code**: Development Agent scaffolds implementation
3. **Run tests**: Automated test execution and reporting
4. **Create PR**: Automatic pull request with description
5. **Update documentation**: Documentation Agent syncs to Notion
6. **Deploy**: CI/CD pipeline triggered on merge

## Roadmap

- [x] MCP Coordinator implementation
- [x] Event bus architecture
- [ ] Planning Agent MVP
- [ ] Development Agent MVP
- [ ] PM Agent MVP
- [ ] Documentation Agent MVP
- [ ] Self-healing capabilities
- [ ] Advanced AI reasoning (o4-mini integration)
- [ ] Multi-agent collaboration protocols
- [ ] Performance optimization

## Links

- **Linear Issue**: [GAR-45: Autonomous Self-Building System](https://linear.app/garrettc/issue/GAR-45)
- **Notion Hub**: [Autonomous System Integration Hub](https://www.notion.so/2d9024e8799b817ea73fdb88ac4225c8)
- **Tree of Life Master**: [GitHub Repo](https://github.com/Garrettc123/tree-of-life-system)

## Contributing

Agents are autonomous but improvements are welcome! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../LICENSE) for details.
