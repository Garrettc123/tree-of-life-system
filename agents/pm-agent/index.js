const BaseAgent = require('../core/base-agent');

class PMAgent extends BaseAgent {
  constructor(config, mcpCoordinator, eventBus) {
    super('project-management', config, mcpCoordinator, eventBus);
    this.createdIssues = [];
  }

  async initialize() {
    console.log('[PMAgent] Initializing...');
    
    this.capabilities = [
      'create_issues',
      'manage_projects',
      'assign_tasks',
      'track_progress'
    ];
    
    await this.mcpCoordinator.registerAgent({
      id: this.agentId,
      name: 'PM Agent',
      capabilities: this.capabilities,
      status: 'ready'
    });
    
    console.log('[PMAgent] Ready');
  }

  async executeTasks(tasks) {
    console.log(`\n[PMAgent] Creating ${tasks.length} Linear issues...\n`);
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      console.log(`[${i + 1}/${tasks.length}] Creating: ${task.title}`);
      
      const issue = {
        id: `GAR-${1000 + i}`,
        title: task.title,
        description: task.description,
        priority: this.mapPriority(task.priority),
        repository: task.repository,
        status: 'Todo'
      };
      
      this.createdIssues.push(issue);
      await this.delay(100);
    }

    console.log(`\n✅ Created ${this.createdIssues.length} issues\n`);

    // Emit event for Development Agent
    this.eventBus.emit({
      type: 'pm:issues-created',
      source: this.agentId,
      data: { issues: this.createdIssues }
    });
  }

  mapPriority(priority) {
    const map = { 'High': 1, 'Medium': 2, 'Low': 3 };
    return map[priority] || 2;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      agent: 'PM Agent',
      state: 'ready',
      capabilities: this.capabilities,
      issuesCreated: this.createdIssues.length
    };
  }
}

module.exports = PMAgent;
