/**
 * Main entry point for autonomous agent system
 */

require('dotenv').config();

const MCPCoordinator = require('./core/mcp-coordinator');
const EventBus = require('./core/event-bus');
const PlanningAgent = require('./planning');

class AgentSystem {
  constructor() {
    this.config = {
      githubToken: process.env.GITHUB_TOKEN,
      githubOwner: process.env.GITHUB_OWNER || 'Garrettc123',
      linearApiKey: process.env.LINEAR_API_KEY,
      linearTeamId: process.env.LINEAR_TEAM_ID,
      notionToken: process.env.NOTION_TOKEN,
      mode: process.env.AGENT_MODE || 'development',
      autoExecute: process.env.AGENT_AUTO_EXECUTE === 'true'
    };

    this.mcp = new MCPCoordinator();
    this.eventBus = new EventBus();
    this.agents = new Map();
  }

  async initialize() {
    console.log('\n┌────────────────────────────────────────────────┐');
    console.log('│  🤖 Tree of Life Autonomous Agent System  │');
    console.log('└────────────────────────────────────────────────┘\n');

    // Validate configuration
    if (!this.config.githubToken) {
      console.error('❌ GITHUB_TOKEN not configured');
      console.log('\nPlease set up your environment variables:');
      console.log('1. Copy .env.example to .env');
      console.log('2. Add your API keys');
      console.log('3. Run the system again\n');
      process.exit(1);
    }

    console.log('✅ Configuration loaded');
    console.log(`   Mode: ${this.config.mode}`);
    console.log(`   Owner: ${this.config.githubOwner}\n`);

    // Initialize Planning Agent
    console.log('Initializing Planning Agent...');
    const planningAgent = new PlanningAgent(this.config, this.mcp, this.eventBus);
    await planningAgent.initialize();
    this.agents.set('planning', planningAgent);
    console.log('✅ Planning Agent ready\n');

    // TODO: Initialize other agents
    // const devAgent = new DevelopmentAgent(...);
    // const pmAgent = new ProjectManagementAgent(...);
    // const docAgent = new DocumentationAgent(...);

    console.log('✨ Agent system initialized\n');
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
