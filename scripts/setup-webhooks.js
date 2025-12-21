#!/usr/bin/env node
/**
 * GitHub Webhooks Setup Script
 * Automatically configures webhooks for TITAN
 */

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function setupWebhooks() {
  console.log('\n🔧 TITAN Webhook Configuration\n');
  console.log('This will set up GitHub webhooks for your TITAN platform.\n');
  
  const githubToken = process.env.GITHUB_TOKEN || await prompt('GitHub Personal Access Token: ');
  const owner = process.env.GITHUB_USERNAME || await prompt('GitHub Username/Org: ');
  const repo = await prompt('Repository Name: ');
  const webhookUrl = process.env.RAILWAY_URL 
    ? `${process.env.RAILWAY_URL}/webhooks/github`
    : await prompt('Webhook URL (Railway URL + /webhooks/github): ');
  const secret = process.env.GITHUB_WEBHOOK_SECRET || await prompt('Webhook Secret (generate a random string): ');
  
  rl.close();
  
  console.log('\n📡 Creating webhook...\n');
  
  try {
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        name: 'web',
        active: true,
        events: [
          'push',
          'pull_request',
          'pull_request_review',
          'issues',
          'issue_comment',
          'release',
          'workflow_run',
          'discussion',
          'discussion_comment',
          'create',
          'delete'
        ],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: secret,
          insecure_ssl: '0'
        }
      },
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log('✅ Webhook created successfully!\n');
    console.log('Webhook ID:', response.data.id);
    console.log('Webhook URL:', response.data.url);
    console.log('\n📋 Events configured:');
    response.data.events.forEach(event => {
      console.log(`   - ${event}`);
    });
    
    console.log('\n🎉 GitHub webhooks are now active!\n');
    console.log('TITAN will receive real-time notifications for all GitHub events.\n');
    
    console.log('⚙️  Environment Variables to Set:');
    console.log(`   GITHUB_WEBHOOK_SECRET=${secret}`);
    console.log(`   GITHUB_TOKEN=${githubToken}`);
    console.log(`   GITHUB_USERNAME=${owner}\n`);
    
  } catch (error) {
    console.error('❌ Failed to create webhook:', error.response?.data || error.message);
    process.exit(1);
  }
}

setupWebhooks();
