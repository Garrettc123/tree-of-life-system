require('dotenv').config();
const MCPCoordinator = require('./core/mcp-coordinator');
const EventBus = require('./core/event-bus');
const PlanningAgent = require('./planning');
const PMAgent = require('./pm-agent');

async function run() {
  console.log("\n🤖 Running Planning + PM Agent Pipeline...\n");
  
  const config = {
    githubToken: process.env.GITHUB_TOKEN,
    githubOwner: process.env.GITHUB_OWNER || 'Garrettc123',
    linearApiKey: process.env.LINEAR_API_KEY,
    linearTeamId: process.env.LINEAR_TEAM_ID
  };
  
  const mcp = new MCPCoordinator();
  const eventBus = new EventBus();
  
  // Run Planning Agent
  console.log("📋 Step 1: Running Planning Agent...");
  const planningAgent = new PlanningAgent(config, mcp, eventBus);
  await planningAgent.initialize();
  await planningAgent.execute();
  
  // Get generated tasks
  const tasks = planningAgent.taskGenerator.taskQueue;
  console.log(`\n✅ Planning complete: ${tasks.length} tasks generated\n`);
  
  // Run PM Agent to create Linear issues
  console.log("📝 Step 2: Creating Linear issues...");
  const pmAgent = new PMAgent(config, mcp, eventBus);
  await pmAgent.initialize();
  
  const results = await pmAgent.executeTasks(tasks);
  
  console.log("\n🎉 Pipeline Complete!");
  console.log(`   Tasks Generated: ${tasks.length}`);
  console.log(`   Issues Created: ${results.filter(r => r.success).length}`);
  console.log(`\n   View in Linear: https://linear.app/garrettc/team/GAR\n`);
}

run().catch(console.error);
