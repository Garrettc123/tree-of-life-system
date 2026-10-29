/**
 * Main entry point for autonomous agent system
 */

require('dotenv').config();

const MCPCoordinator = require('./core/mcp-coordinator');
const EventBus = require('./core/event-bus');
const PlanningAgent = require('./planning');
const ProposalAgent = require('./planning/proposal-agent');
const SupabaseRhnsStore = require('./core/supabase-rhns-store');
const ApprovalGate = require('./core/approval-gate');

class AgentSystem {
  constructor() {
    this.config = {
      githubToken: process.env.GITHUB_TOKEN,
      githubOwner: process.env.GITHUB_OWNER || 'Garrettc123',
      linearApiKey: process.env.LINEAR_API_KEY,
      linearTeamId: process.env.LINEAR_TEAM_ID,
      notionToken: process.env.NOTION_TOKEN || process.env.NOTION_API_KEY,
      mode: process.env.AGENT_MODE || 'development',
      autoExecute: process.env.AGENT_AUTO_EXECUTE === 'true'
    };

    this.mcp = new MCPCoordinator();
    this.eventBus = new EventBus();
    this.agents = new Map();
    this.durableStore = null;
    this.approvalGate = null;
    this.tenantId = process.env.RHNS_TENANT_ID || null;
  }

  async initialize() {
    console.log('\n┌────────────────────────────────────────────────┐');
    console.log('│  🤖 Tree of Life Autonomous Agent System  │');
    console.log('└────────────────────────────────────────────────┘\n');

    // Missing integration credentials should degrade planning, not terminate
    // the whole workforce or prevent proposal-only agents from registering.
    this.configWarnings = [];
    if (process.env.RHNS_DURABLE_STORE_ENABLED === 'true') {
      const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RHNS_TENANT_ID']
        .filter((name) => !process.env[name]);
      if (missing.length) {
        throw new Error('RHNS durable storage is enabled but required server environment is missing: ' + missing.join(', '));
      }
      this.durableStore = new SupabaseRhnsStore({
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
      await this.durableStore.healthCheck();
      this.approvalGate = new ApprovalGate({ store: this.durableStore });
      console.log('Durable RHNS storage verified; exact-action approval gate initialized (no write adapter attached).');
    }
    if (!this.config.githubToken) {
      const warning = 'GITHUB_TOKEN is not configured; repository analysis will remain unavailable.';
      this.configWarnings.push(warning);
      console.warn(`⚠️ ${warning}`);
    }
    if (!this.config.linearApiKey || !this.config.linearTeamId) {
      const warning = 'Linear integration is not fully configured; Linear analysis will be marked incomplete.';
      this.configWarnings.push(warning);
      console.warn(`⚠️ ${warning}`);
    }

    console.log(`✅ Configuration loaded with ${this.configWarnings.length} warning(s)`);
    console.log(`   Mode: ${this.config.mode}`);
    console.log(`   Owner: ${this.config.githubOwner}\n`);

    // Initialize Planning Agent
    console.log('Initializing Planning Agent...');
    const planningAgent = new PlanningAgent(this.config, this.mcp, this.eventBus);
    await planningAgent.initialize();
    this.agents.set('planning', planningAgent);
    console.log('✅ Planning Agent ready\n');

    // These handlers intentionally prepare proposals only. They do not write
    // files, create issues, change descriptions, send messages, or deploy.
    const proposalAgents = [
      {
        id: 'development',
        name: 'Development Proposal Agent',
        capabilities: ['file-change-proposal', 'cicd-proposal'],
      },
      {
        id: 'project-management',
        name: 'Project Management Proposal Agent',
        capabilities: ['issue-outline-proposal'],
      },
      {
        id: 'documentation',
        name: 'Documentation Proposal Agent',
        capabilities: ['documentation-draft-proposal'],
      },
      {
        id: 'integration',
        name: 'Integration Proposal Agent',
        capabilities: ['integration-audit-proposal', 'integration-sync-plan'],
      },
    ];

    for (const definition of proposalAgents) {
      const agent = new ProposalAgent(definition, this.mcp, {
        store: this.durableStore,
        tenantId: this.tenantId,
      });
      this.agents.set(definition.id, agent);
      console.log(`✅ ${definition.name} ready (proposal-only; approval required)`);
    }

    console.log('✨ Agent system initialized with one planner and four proposal-only agents.\n');
  }

  async start() {
    console.log('Starting agent system...\n');

    // Subscribe to global events
    this.eventBus.on('*', (event) => {
      console.log(`[EventBus] ${event.type} from ${event.source}`);
    });

    if (this.config.autoExecute) {
      console.log('Auto-execute enabled. Running Planning Agent...\n');
      const planningAgent = this.agents.get('planning');
      const result = await planningAgent.execute();
      console.log('\nPlanning Agent Result:', result);
    } else {
      console.log('💡 Auto-execute disabled. Agents are ready for manual execution.');
      console.log('\nTo run Planning Agent manually:');
      console.log('  const agent = require("./planning");');
      console.log('  await agent.execute();\n');
    }

    this.displayStatus();
  }

  displayStatus() {
    console.log('\n┌──────────────────────────┐');
    console.log('│   Agent System Status   │');
    console.log('└──────────────────────────┘\n');

    for (const [name, agent] of this.agents) {
      const status = agent.getStatus();
      console.log(`• ${status.agent}: ${status.state}`);
      console.log(`  Capabilities: ${status.capabilities.join(', ')}`);
      if (status.pendingTasks) {
        console.log(`  Pending tasks: ${status.pendingTasks}`);
      }
      console.log('');
    }

    const mcpStatus = this.mcp.getAgentStatus();
    console.log(`MCP Agents: ${mcpStatus.length} registered`);
    
    const eventStats = this.eventBus.getStats();
    console.log(`Event Bus: ${eventStats.totalEvents} events, ${eventStats.subscribers} subscribers\n`);
  }
}

// Main execution
if (require.main === module) {
  const system = new AgentSystem();
  
  system.initialize()
    .then(() => system.start())
    .catch(error => {
      console.error('\n❌ System error:', error);
      process.exit(1);
    });
}

module.exports = AgentSystem;
