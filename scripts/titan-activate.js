#!/usr/bin/env node
/**
 * TITAN Activation Script
 * Activates all 17 systems and verifies operation
 */

const axios = require('axios');
const chalk = require('chalk');

const BASE_URL = process.env.RAILWAY_URL || 'http://localhost:3000';

const systems = [
  { name: 'PR Management', endpoint: '/github/pr/status' },
  { name: 'Issue Management', endpoint: '/github/issue/status' },
  { name: 'Release Management', endpoint: '/github/release/status' },
  { name: 'CI/CD Pipeline', endpoint: '/github/cicd/status' },
  { name: 'Code Quality', endpoint: '/github/quality/dashboard' },
  { name: 'GitHub Actions', endpoint: '/github/actions/status' },
  { name: 'GitHub Projects', endpoint: '/github/projects' },
  { name: 'GitHub Discussions', endpoint: '/github/discussions' },
  { name: 'GitHub Wiki', endpoint: '/github/wiki/pages' },
  { name: 'GitHub Packages', endpoint: '/github/packages' },
  { name: 'GitHub Security', endpoint: '/github/security/dashboard' },
  { name: 'GitHub Teams', endpoint: '/github/teams' },
  { name: 'Revenue SaaS', endpoint: '/revenue/pricing' },
  { name: 'Revenue API', endpoint: '/revenue/api/pricing' },
  { name: 'Revenue Dashboard', endpoint: '/revenue/dashboard' },
  { name: 'Main Dashboard', endpoint: '/dashboard' },
  { name: 'Health Check', endpoint: '/health' }
];

async function activateTITAN() {
  console.log(chalk.cyan('\n🚀 TITAN ACTIVATION SEQUENCE\n'));
  console.log(chalk.yellow('━'.repeat(50)));
  
  let activeCount = 0;
  let failedCount = 0;
  
  for (const system of systems) {
    try {
      const response = await axios.get(`${BASE_URL}${system.endpoint}`, {
        timeout: 5000,
        validateStatus: () => true
      });
      
      if (response.status === 200) {
        console.log(chalk.green(`✅ ${system.name.padEnd(25)} ACTIVE`));
        activeCount++;
      } else {
        console.log(chalk.red(`❌ ${system.name.padEnd(25)} FAILED (${response.status})`));
        failedCount++;
      }
    } catch (error) {
      console.log(chalk.red(`❌ ${system.name.padEnd(25)} ERROR`));
      failedCount++;
    }
    
    // Small delay between checks
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(chalk.yellow('\n' + '━'.repeat(50)));
  console.log(chalk.cyan(`\n📊 ACTIVATION SUMMARY:\n`));
  console.log(chalk.green(`✅ Active Systems:  ${activeCount}/${systems.length}`));
  console.log(chalk.red(`❌ Failed Systems:  ${failedCount}/${systems.length}`));
  
  const successRate = ((activeCount / systems.length) * 100).toFixed(1);
  console.log(chalk.cyan(`\n📈 Success Rate: ${successRate}%`));
  
  if (activeCount === systems.length) {
    console.log(chalk.green.bold('\n🎉 TITAN IS FULLY OPERATIONAL!\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.white('  1. Configure GitHub webhooks'));
    console.log(chalk.white('  2. Add Stripe API key'));
    console.log(chalk.white('  3. Test automation flows'));
    console.log(chalk.white('  4. Launch revenue streams\n'));
    process.exit(0);
  } else {
    console.log(chalk.yellow('\n⚠️  Some systems need attention\n'));
    process.exit(1);
  }
}

// Run activation
activateTITAN().catch(error => {
  console.error(chalk.red('\n❌ ACTIVATION FAILED:'), error.message);
  process.exit(1);
});
