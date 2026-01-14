require('dotenv').config();
const MCPCoordinator = require('./core/mcp-coordinator');
const EventBus = require('./core/event-bus');
const PlanningAgent = require('./planning');
const PMAgent = require('./pm-agent');

class AutonomousSystem {
  constructor() {
    this.config = {
      githubToken: process.env.GITHUB_TOKEN,
      githubOwner: process.env.GITHUB_OWNER || 'Garrettc123',
      linearApiKey: process.env.LINEAR_API_KEY,
      linearTeamId: process.env.LINEAR_TEAM_ID,
      notionToken: process.env.NOTION_TOKEN,
      autoExecute: process.env.AGENT_AUTO_EXECUTE === 'true'
    };
    
    this.mcp = new MCPCoordinator();
    this.eventBus = new EventBus();
    this.agents = new Map();
  }

  async initialize() {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  🤖 AUTONOMOUS TREE OF LIFE SYSTEM - ACTIVE   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log(`Mode: ${this.config.autoExecute ? '🚀 FULL AUTO' : '⏸️  MANUAL'}\n`);

    // Initialize Planning Agent
    console.log('🧠 Initializing Planning Agent...');
    const planningAgent = new PlanningAgent(this.config, this.mcp, this.eventBus);
    await planningAgent.initialize();
    this.agents.set('planning', planningAgent);
    console.log('✅ Planning Agent ready\n');

    // Initialize PM Agent
    console.log('📝 Initializing PM Agent...');
    const pmAgent = new PMAgent(this.config, this.mcp, this.eventBus);
    await pmAgent.initialize();
    this.agents.set('pm', pmAgent);
    console.log('✅ PM Agent ready\n');

    // Subscribe to events
    this.setupEventListeners();

    console.log('✨ All agents initialized\n');
  }

  setupEventListeners() {
    // Listen to planning events
    this.eventBus.on('planning:tasks-generated', async (event) => {
      console.log('\n🎯 Planning Agent generated tasks!');
      
      if (this.config.autoExecute) {
        console.log('🚀 Auto-executing task creation in Linear...\n');
        
        const planningAgent = this.agents.get('planning');
        const tasks = planningAgent.taskGenerator.taskQueue;
        
        const pmAgent = this.agents.get('pm');
        await pmAgent.executeTasks(tasks);
      }
    });

    // Listen to all events for logging
    this.eventBus.on('*', (event) => {
      console.log(`[Event] ${event.type} from ${event.source}`);
    });
  }

  async run() {
    console.log('Starting autonomous execution cycle...\n');
    console.log('═'.repeat(60));

    if (this.config.autoExecute) {
      console.log('\n🔄 Running Planning Agent...\n');
      
      const planningAgent = this.agents.get('planning');
      await planningAgent.execute();
      
      console.log('\n✅ Autonomous cycle complete!');
      console.log('\nView results: https://linear.app/garrettc/team/GAR\n');
    } else {
      console.log('\n⏸️  Auto-execute disabled');
      console.log('Run manually with: node run-pm-agent.js\n');
    }

    this.displayStatus();
  }

  displayStatus() {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║          🌳 SYSTEM STATUS                  ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    for (const [name, agent] of this.agents) {
      const status = agent.getStatus();
      console.log(`🤖 ${status.agent}`);
      console.log(`   State: ${status.state}`);
      console.log(`   Capabilities: ${status.capabilities.join(', ')}`);
      console.log('');
    }

    const mcpStatus = this.mcp.getAgentStatus();
    console.log(`📡 MCP: ${mcpStatus.length} agents registered`);
    
    const eventStats = this.eventBus.getStats();
    console.log(`🔔 Events: ${eventStats.totalEvents} processed, ${eventStats.subscribers} subscribers\n`);
    
    console.log('═'.repeat(60));
    console.log('\n💡 Commands:');
    console.log('   node autonomous-system.js  - Run full cycle');
    console.log('   node run-planning.js       - Planning only');
    console.log('   node run-pm-agent.js       - Full pipeline\n');
  }
}

// Main execution
async function main() {
  const system = new AutonomousSystem();
  
  try {
    await system.initialize();
    await system.run();
  } catch (error) {
    console.error('\n❌ System error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
