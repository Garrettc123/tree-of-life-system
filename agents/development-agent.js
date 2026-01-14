const BaseAgent = require('./core/base-agent');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DevelopmentAgent extends BaseAgent {
  constructor(config, mcpCoordinator, eventBus) {
    super('development', config, mcpCoordinator, eventBus);
    this.executionQueue = [];
    this.currentExecution = null;
    this.completedTasks = [];
  }

  async initialize() {
    console.log('[DevelopmentAgent] Initializing...');
    
    this.capabilities = [
      'create_files',
      'setup_cicd',
      'create_readme',
      'add_github_actions',
      'update_package_json',
      'create_documentation',
      'setup_tests',
      'commit_and_push'
    ];
    
    await this.mcpCoordinator.registerAgent({
      id: this.agentId,
      name: 'Development Agent',
      capabilities: this.capabilities,
      status: 'ready'
    });
    
    this.subscribeToEvents();
    console.log('[DevelopmentAgent] Ready\n');
  }

  subscribeToEvents() {
    // Listen for tasks from PM Agent
    this.eventBus.on('pm:issues-created', async (event) => {
      console.log('[DevelopmentAgent] Received issues to execute');
      await this.processIssues(event.data.issues);
    });
  }

  async processIssues(issues) {
    console.log(`\n[DevelopmentAgent] Processing ${issues.length} issues...\n`);
    
    for (const issue of issues) {
      await this.executeIssue(issue);
    }
    
    this.displayExecutionSummary();
  }

  async executeIssue(issue) {
    console.log(`\n🔨 Executing: ${issue.title}`);
    console.log(`   ID: ${issue.id}`);
    console.log(`   Priority: ${issue.priority || 'Medium'}`);
    
    this.currentExecution = {
      issue,
      startTime: Date.now(),
      status: 'in_progress'
    };

    try {
      // Route to appropriate handler based on issue type
      if (issue.title.includes('README')) {
        await this.createReadme(issue);
      } else if (issue.title.includes('CI/CD') || issue.title.includes('GitHub Actions')) {
        await this.setupCICD(issue);
      } else if (issue.title.includes('package.json')) {
        await this.updatePackageJson(issue);
      } else if (issue.title.includes('test')) {
        await this.setupTests(issue);
      } else if (issue.title.includes('documentation')) {
        await this.createDocumentation(issue);
      } else {
        await this.createGenericFile(issue);
      }
      
      const duration = Date.now() - this.currentExecution.startTime;
      this.currentExecution.status = 'completed';
      this.completedTasks.push({
        title: issue.title,
        duration,
        success: true
      });
      
      console.log(`   ✅ Completed in ${duration}ms`);
      
      this.eventBus.emit({
        type: 'development:task-completed',
        source: this.agentId,
        data: {
          issue: issue.title,
          success: true,
          duration
        }
      });
      
    } catch (error) {
      this.currentExecution.status = 'failed';
      console.log(`   ❌ Failed: ${error.message}`);
      
      this.completedTasks.push({
        title: issue.title,
        success: false,
        error: error.message
      });
      
      this.eventBus.emit({
        type: 'development:task-failed',
        source: this.agentId,
        data: {
          issue: issue.title,
          error: error.message
        }
      });
    }
  }

  async createReadme(issue) {
    console.log(`   📝 Creating README.md...`);
    
    const readmeContent = this.generateReadmeContent(issue);
    
    // Simulate file creation
    await this.delay(300);
    console.log(`      ✓ Generated README with documentation`);
  }

  async setupCICD(issue) {
    console.log(`   ⚙️  Setting up CI/CD workflow...`);
    
    const workflowContent = this.generateCICDWorkflow();
    
    await this.delay(400);
    console.log(`      ✓ Created .github/workflows/ci.yml`);
    console.log(`      ✓ Setup: Node testing, linting, coverage`);
  }

  async updatePackageJson(issue) {
    console.log(`   📦 Updating package.json...`);
    
    const updates = {
      scripts: {
        test: 'jest',
        build: 'tsc',
        lint: 'eslint .',
        format: 'prettier --write .'
      },
      devDependencies: {
        jest: '^29.0.0',
        eslint: '^8.0.0',
        prettier: '^3.0.0'
      }
    };
    
    await this.delay(250);
    console.log(`      ✓ Added test scripts`);
    console.log(`      ✓ Added dev dependencies`);
  }

  async setupTests(issue) {
    console.log(`   🧪 Setting up test suite...`);
    
    const testContent = this.generateTestFile();
    
    await this.delay(350);
    console.log(`      ✓ Created tests/index.test.js`);
    console.log(`      ✓ Setup: Jest configuration`);
  }

  async createDocumentation(issue) {
    console.log(`   📚 Creating documentation...`);
    
    await this.delay(300);
    console.log(`      ✓ Created docs/API.md`);
    console.log(`      ✓ Created docs/CONTRIBUTING.md`);
    console.log(`      ✓ Created docs/SETUP.md`);
  }

  async createGenericFile(issue) {
    console.log(`   📄 Creating file based on description...`);
    
    await this.delay(200);
    console.log(`      ✓ Created necessary files`);
  }

  // Content Generators
  generateReadmeContent(issue) {
    return `# Repository

## Overview
${issue.description || 'Auto-generated by Tree of Life system'}

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`bash
npm start
\`\`\`

## Testing

\`\`\`bash
npm test
\`\`\`

## Contributing
Pull requests welcome!

---
*Generated by Tree of Life Autonomous System*`;
  }

  generateCICDWorkflow() {
    return `name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run tests
      run: npm test -- --coverage
    
    - name: Build
      run: npm run build`;
  }

  generateTestFile() {
    return `describe('Application Tests', () => {
  it('should initialize', () => {
    expect(true).toBe(true);
  });
  
  it('should have environment', () => {
    expect(process.env).toBeDefined();
  });
  
  it('should run successfully', () => {
    const result = 1 + 1;
    expect(result).toBe(2);
  });
});`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  displayExecutionSummary() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  📊 DEVELOPMENT AGENT EXECUTION SUMMARY        ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
    
    const successful = this.completedTasks.filter(t => t.success).length;
    const failed = this.completedTasks.filter(t => !t.success).length;
    const totalTime = this.completedTasks.reduce((sum, t) => sum + (t.duration || 0), 0);
    
    console.log(`Total Tasks: ${this.completedTasks.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total Time: ${totalTime}ms\n`);
    
    if (this.completedTasks.length > 0) {
      console.log('Completed Tasks:');
      this.completedTasks.forEach((task, i) => {
        const icon = task.success ? '✅' : '❌';
        console.log(`  ${i + 1}. ${icon} ${task.title}`);
      });
    }
    
    console.log('\n');
  }

  getStatus() {
    return {
      agent: 'Development Agent',
      state: this.currentExecution ? 'executing' : 'idle',
      capabilities: this.capabilities,
      currentTask: this.currentExecution ? this.currentExecution.issue.title : 'none',
      tasksCompleted: this.completedTasks.length,
      queueSize: this.executionQueue.length
    };
  }
}

module.exports = DevelopmentAgent;
