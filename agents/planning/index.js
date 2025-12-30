/**
 * Planning Agent - Strategic coordinator
 * Analyzes system state and generates execution plans
 */

const GapAnalyzer = require('./gap-analyzer');
const TaskGenerator = require('./task-generator');
const EventBus = require('../core/event-bus');

class PlanningAgent {
  constructor(config, mcpCoordinator, eventBus) {
    this.config = config;
    this.mcp = mcpCoordinator;
    this.eventBus = eventBus;
    
    this.gapAnalyzer = new GapAnalyzer(config);
    this.taskGenerator = new TaskGenerator(config);
    
    this.capabilities = [
      'gap-analysis',
      'task-generation',
      'priority-planning',
      'coordination'
    ];

    this.state = 'idle';
    this._registerEventListeners();
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    console.log('[PlanningAgent] Initializing...');
    
    // Register with MCP coordinator
    this.mcp.registerAgent('planning', this);
    
    // Subscribe to relevant events
    this.eventBus.subscribe(EventBus.Events.LINEAR_PROJECT_CREATED, 
      this._handleLinearProjectCreated.bind(this), 'planning');
    this.eventBus.subscribe(EventBus.Events.GITHUB_REPO_CREATED, 
      this._handleGithubRepoCreated.bind(this), 'planning');

    console.log('[PlanningAgent] Ready');
  }

  /**
   * Main execution loop
   */
  async execute() {
    console.log('[PlanningAgent] Starting execution cycle...');
    this.state = 'analyzing';

    try {
      // Step 1: Analyze system for gaps
      const gaps = await this.gapAnalyzer.analyzeSystem(
        this.config.githubOwner,
        this.config.linearTeamId
      );

      this.eventBus.publish('planning:analysis-complete', { 
        gapCount: gaps.length,
        gaps 
      }, 'planning');

      // Step 2: Generate tasks from gaps
      this.state = 'planning';
      const tasks = this.taskGenerator.generateTasks(gaps);

      this.eventBus.publish('planning:tasks-generated', {
        taskCount: tasks.length,
        tasks
      }, 'planning');

      // Step 3: Distribute tasks to agents
      this.state = 'coordinating';
      await this._distributeTasks(tasks);

      console.log('[PlanningAgent] Execution cycle complete');
      this.state = 'idle';

      return {
        success: true,
        gapsFound: gaps.length,
        tasksGenerated: tasks.length
      };

    } catch (error) {
      console.error('[PlanningAgent] Execution failed:', error);
      this.state = 'error';
      
      this.eventBus.publish('agent:error', {
        agent: 'planning',
        error: error.message
      }, 'planning');

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle messages from other agents via MCP
   */
  async handleMessage(envelope) {
    console.log(`[PlanningAgent] Received message from ${envelope.from}`);

    const { message } = envelope;

    switch (message.type) {
      case 'request-analysis':
        return await this.execute();
      
      case 'task-completed':
        this.taskGenerator.completeTask(message.taskId, message.result);
        return { acknowledged: true };
      
      case 'capability-request':
        if (message.capability === 'gap-analysis') {
          const gaps = await this.gapAnalyzer.analyzeSystem(
            message.params.owner,
            message.params.teamId
          );
          return { gaps };
        }
        break;
      
      default:
        console.warn(`[PlanningAgent] Unknown message type: ${message.type}`);
        return { error: 'Unknown message type' };
    }
  }

  /**
   * Distribute tasks to appropriate agents
   */
  async _distributeTasks(tasks) {
    const agentTasks = {
      development: [],
      'project-management': [],
      documentation: []
    };

    // Group tasks by agent
    for (const task of tasks) {
      if (agentTasks[task.agent]) {
        agentTasks[task.agent].push(task);
      }
    }

    // Send tasks to each agent
    for (const [agent, tasks] of Object.entries(agentTasks)) {
      if (tasks.length === 0) continue;

      try {
        await this.mcp.sendMessage('planning', agent, {
          type: 'task-assignment',
          tasks
        });
        
        console.log(`[PlanningAgent] Assigned ${tasks.length} tasks to ${agent}`);
      } catch (error) {
        console.error(`[PlanningAgent] Failed to assign tasks to ${agent}:`, error);
      }
    }
  }

  /**
   * Event listeners
   */
  _registerEventListeners() {
    // Listen for system changes that might create gaps
  }

  async _handleLinearProjectCreated(event) {
    console.log('[PlanningAgent] New Linear project detected, triggering analysis');
    // Trigger analysis for the new project
    await this.execute();
  }

  async _handleGithubRepoCreated(event) {
    console.log('[PlanningAgent] New GitHub repo detected, triggering analysis');
    // Trigger analysis for the new repo
    await this.execute();
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      agent: 'planning',
      state: this.state,
      capabilities: this.capabilities,
      pendingTasks: this.taskGenerator.taskQueue.filter(t => t.status !== 'completed').length
    };
  }
}

module.exports = PlanningAgent;
