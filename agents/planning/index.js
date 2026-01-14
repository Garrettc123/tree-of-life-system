const BaseAgent = require('../core/base-agent');
const GapAnalyzer = require('./gap-analyzer');
const TaskGenerator = require('./task-generator');

class PlanningAgent extends BaseAgent {
  constructor(config, mcpCoordinator, eventBus) {
    super('planning', config, mcpCoordinator, eventBus);
    this.gapAnalyzer = new GapAnalyzer();
    this.taskGenerator = new TaskGenerator();
  }

  async initialize() {
    console.log('[PlanningAgent] Initializing...');
    
    this.capabilities = [
      'analyze_system',
      'identify_gaps',
      'generate_tasks',
      'prioritize_work'
    ];
    
    await this.mcpCoordinator.registerAgent({
      id: this.agentId,
      name: 'Planning Agent',
      capabilities: this.capabilities,
      status: 'ready'
    });
    
    console.log('[PlanningAgent] Ready');
  }

  async execute() {
    console.log('\n[PlanningAgent] Starting analysis...\n');
    
    // Analyze gaps
    console.log('🔍 Analyzing system gaps...');
    const gaps = await this.gapAnalyzer.analyze();
    console.log(`✅ Found ${gaps.length} gaps\n`);

    // Generate tasks
    console.log('📋 Generating tasks...');
    const tasks = await this.taskGenerator.generate(gaps);
    console.log(`✅ Generated ${tasks.length} tasks\n`);

    // Emit event for PM Agent
    this.eventBus.emit({
      type: 'planning:tasks-generated',
      source: this.agentId,
      data: { tasks, gaps }
    });

    return { tasks, gaps };
  }

  getStatus() {
    return {
      agent: 'Planning Agent',
      state: 'idle',
      capabilities: this.capabilities,
      gapsAnalyzed: this.gapAnalyzer.gaps?.length || 0,
      tasksGenerated: this.taskGenerator.taskQueue?.length || 0
    };
  }
}

module.exports = PlanningAgent;
