require('dotenv').config();

const MCPCoordinator = require('./core/mcp-coordinator');
const EventBus = require('./core/event-bus');
const PlanningAgent = require('./planning');

async function run() {
  console.log("\n🤖 Executing Planning Agent...\n");
  
  // Load config
  const config = {
    githubToken: process.env.GITHUB_TOKEN,
    githubOwner: process.env.GITHUB_OWNER || 'Garrettc123',
    linearApiKey: process.env.LINEAR_API_KEY,
    linearTeamId: process.env.LINEAR_TEAM_ID,
    notionToken: process.env.NOTION_TOKEN
  };
  
  // Check if tokens are configured
  if (!config.githubToken || config.githubToken === 'your_github_token_here') {
    console.error('❌ GITHUB_TOKEN not configured in .env');
    console.log('\nEdit your .env file and add:');
    console.log('  GITHUB_TOKEN=ghp_your_token_here\n');
    process.exit(1);
  }
  
  if (!config.linearApiKey || config.linearApiKey === 'your_linear_api_key_here') {
    console.error('❌ LINEAR_API_KEY not configured in .env');
    console.log('\nEdit your .env file and add:');
    console.log('  LINEAR_API_KEY=lin_api_your_key_here\n');
    process.exit(1);
  }
  
  console.log("📦 Config loaded");
  console.log(`   GitHub: ${config.githubOwner}`);
  console.log(`   Linear Team: ${config.linearTeamId}\n`);
  
  // Create MCP coordinator and event bus
  const mcp = new MCPCoordinator();
  const eventBus = new EventBus();
  
  // Create and initialize agent
  console.log("🔧 Initializing Planning Agent...");
  const agent = new PlanningAgent(config, mcp, eventBus);
  await agent.initialize();
  console.log("✅ Agent initialized\n");
  
  // Execute
  console.log("📋 Running gap analysis and task generation...\n");
  const result = await agent.execute();
  
  console.log("\n✅ Planning Agent complete");
  console.log("\nResult:", JSON.stringify(result, null, 2));
}

run().catch(error => {
  console.error("\n❌ Error:", error.message);
  console.error(error.stack);
  process.exit(1);
});
