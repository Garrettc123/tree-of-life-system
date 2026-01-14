require('dotenv').config();
const MCPCoordinator = require('./core/mcp-coordinator');
const EventBus = require('./core/event-bus');
const PlanningAgent = require('./planning');

async function run() {
  console.log("\n🔍 Running Planning Agent and showing generated tasks...\n");
  
  const config = {
    githubToken: process.env.GITHUB_TOKEN,
    githubOwner: process.env.GITHUB_OWNER || 'Garrettc123',
    linearApiKey: process.env.LINEAR_API_KEY,
    linearTeamId: process.env.LINEAR_TEAM_ID,
    notionToken: process.env.NOTION_TOKEN
  };
  
  const mcp = new MCPCoordinator();
  const eventBus = new EventBus();
  
  const agent = new PlanningAgent(config, mcp, eventBus);
  await agent.initialize();
  
  const result = await agent.execute();
  
  // Access the task queue
  const taskGenerator = agent.taskGenerator;
  const tasks = taskGenerator.taskQueue;
  
  console.log(`\n📋 Generated Tasks Breakdown:\n`);
  console.log('='.repeat(70));
  
  // Group by agent
  const byAgent = {};
  tasks.forEach(task => {
    if (!byAgent[task.agent]) byAgent[task.agent] = [];
    byAgent[task.agent].push(task);
  });
  
  for (const [agentName, agentTasks] of Object.entries(byAgent)) {
    console.log(`\n🤖 ${agentName.toUpperCase()} (${agentTasks.length} tasks):`);
    console.log('-'.repeat(70));
    
    agentTasks.slice(0, 5).forEach((task, idx) => {
      console.log(`\n${idx + 1}. ${task.title}`);
      console.log(`   Priority: ${task.priority}`);
      console.log(`   Type: ${task.type}`);
      console.log(`   Duration: ${task.estimatedDuration}`);
    });
    
    if (agentTasks.length > 5) {
      console.log(`\n   ... and ${agentTasks.length - 5} more tasks`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Summary:`);
  console.log(`   Total Tasks: ${tasks.length}`);
  console.log(`   By Priority:`);
  console.log(`     High: ${tasks.filter(t => t.priority === 'high').length}`);
  console.log(`     Medium: ${tasks.filter(t => t.priority === 'medium').length}`);
  console.log(`     Low: ${tasks.filter(t => t.priority === 'low').length}`);
  console.log(`\n✅ Tasks generated but waiting for execution agents!\n`);
}

run().catch(console.error);
