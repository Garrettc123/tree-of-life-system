require('dotenv').config();
const MCPCoordinator = require('./core/mcp-coordinator');
const EventBus = require('./core/event-bus');
const PlanningAgent = require('./planning');
const PMAgent = require('./pm-agent');
const DevelopmentAgent = require('./development-agent');

class AutonomousSystemFull {
  constructor() {
    this.config = {
      githubToken: process.env.GITHUB_TOKEN,
      githubOwner: process.env.GITHUB_OWNER || 'Garrettc123',
      linearApiKey: process.env.LINEAR_API_KEY,
      autoExecute: true
    };
    
    this.mcp = new MCPCoordinator();
    this.eventBus = new EventBus();
    this.agents = new Map();
  }

  async initialize() {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  🤖 FULL AUTONOMOUS SYSTEM - EXECUTION MODE   ║');
    console.log('║        Planning → PM → Development              ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

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

    // Initialize Development Agent
    console.log('🔨 Initializing Development Agent...');
    const devAgent = new DevelopmentAgent(this.config, this.mcp, this.eventBus);
    await devAgent.initialize();
    this.agents.set('development', devAgent);
    console.log('✅ Development Agent ready\n');

    this.setupEventPipeline();
  }

  setupEventPipeline() {
    // Planning → PM
    this.eventBus.on('planning:tasks-generated', async (event) => {
      console.log('\n🎯 Planning Agent: Generated tasks');
      const planningAgent = this.agents.get('planning');
      const pmAgent = this.agents.get('pm');
      await pmAgent.executeTasks(planningAgent.taskGenerator.taskQueue);
    });

    // PM → Development
    this.eventBus.on('pm:issues-created', async (event) => {
      console.log('\n📋 PM Agent: Created Linear issues');
      // Development Agent auto-triggers here
    });

    // Development completion
    this.eventBus.on('development:task-completed', (event) => {
      console.log(`[Pipeline] ${event.data.issue} ✅`);
    });
  }

  async run() {
    console.log('═'.repeat(60));
    console.log('\n🚀 STARTING FULL AUTONOMOUS EXECUTION PIPELINE\n');
    console.log('═'.repeat(60));

    try {
      // Phase 1: Planning
      console.log('\n\n📋 PHASE 1: PLANNING\n' + '─'.repeat(60));
      const planningAgent = this.agents.get('planning');
      await planningAgent.execute();

      // Wait for pipeline to complete
      await this.delay(1000);

      // Display final status
      this.displayFinalStatus();

    } catch (error) {
      console.error('\n❌ System error:', error.message);
      process.exit(1);
    }
  }

  displayFinalStatus() {
    console.log('\n\n╔══════════════════════════════════════════════════╗');
    console.log('║  ✨ AUTONOMOUS EXECUTION COMPLETE              ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    for (const [name, agent] of this.agents) {
      const status = agent.getStatus();
      console.log(`\n🤖 ${status.agent}`);
      console.log(`   State: ${status.state}`);
      console.log(`   Capabilities: ${status.capabilities.length}`);
      if (status.tasksCompleted) {
        console.log(`   Tasks Completed: ${status.tasksCompleted}`);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n💾 Results:');
    console.log('   • Tasks analyzed and planned');
    console.log('   • Linear issues created');
    console.log('   • Development tasks executed');
    console.log('   • Files created and workflows setup\n');
    
    console.log('📊 View Results:');
    console.log('   Linear: https://linear.app/garrettc/team/GAR');
    console.log('   GitHub: https://github.com/Garrettc123\n');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const system = new AutonomousSystemFull();
  
  try {
    await system.initialize();
    await system.run();
  } catch (error) {
    console.error('\n❌ Critical error:', error.message);
    process.exit(1);
  }
}

main();
