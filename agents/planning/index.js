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

      const analysisStatus = this.gapAnalyzer.getStatus();

      this.eventBus.publish('planning:analysis-complete', {
        gapCount: gaps.length,
        coverage: analysisStatus,
        gaps,
      }, 'planning');

      // Step 2: Generate tasks from gaps
      this.state = 'planning';
      const tasks = this.taskGenerator.generateTasks(gaps);

      this.eventBus.publish('planning:tasks-generated', {
        taskCount: tasks.length,
        tasks
      }, 'planning');

      // Step 3: Distribute tasks to registered agents.
      this.state = 'coordinating';
      const distribution = await this._distributeTasks(tasks);
      const blocked = distribution.filter((item) => item.status !== 'assigned');
      const tasksAssigned = distribution
        .filter((item) => item.status === 'assigned')
        .reduce((count, item) => count + item.taskIds.length, 0);

      if (blocked.length > 0) {
        const errorMessage = `${blocked.length} task group(s) could not be assigned to a registered agent`;
        this.state = 'error';
        this.eventBus.publish('agent:error', {
          agent: 'planning',
          error: errorMessage,
          blockedAssignments: blocked,
        }, 'planning');
        return {
          success: false,
          error: errorMessage,
          gapsFound: gaps.length,
          tasksGenerated: tasks.length,
          tasksAssigned,
          distribution,
        };
      }

      console.log('[PlanningAgent] Execution cycle complete');
      this.state = 'idle';

      return {
        success: true,
        complete: !analysisStatus.partial,
        partial: analysisStatus.partial,
        analysisStatus,
        gapsFound: gaps.length,
        tasksGenerated: tasks.length,
        tasksAssigned,
        distribution,
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
        complete: false,
        partial: true,
        error: error.message,
        analysisStatus: typeof this.gapAnalyzer.getStatus === 'function'
          ? this.gapAnalyzer.getStatus()
          : undefined,
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
    const grouped = new Map();
    const outcomes = [];
    const registered = new Set(
      typeof this.mcp.getAgentStatus === 'function'
        ? this.mcp.getAgentStatus().filter((agent) => agent.status === 'active').map((agent) => agent.id)
        : [],
    );

    for (const task of tasks) {
      if (!task || typeof task.agent !== 'string' || !task.agent.trim()) {
        outcomes.push({
          agent: null,
          status: 'blocked',
          taskIds: task && task.id ? [task.id] : [],
          reason: 'task_missing_target_agent',
        });
        continue;
      }

      if (!grouped.has(task.agent)) grouped.set(task.agent, []);
      grouped.get(task.agent).push(task);
    }

    for (const [agent, agentTasks] of grouped.entries()) {
      const taskIds = agentTasks.map((task) => task.id).filter(Boolean);

      if (agent === 'planning') {
        outcomes.push({
          agent,
          status: 'blocked',
          taskIds,
          reason: 'planning_agent_has_no_self-execution_adapter',
        });
        continue;
      }

      if (registered.size > 0 && !registered.has(agent)) {
        outcomes.push({
          agent,
          status: 'blocked',
          taskIds,
          reason: 'target_agent_not_registered',
        });
        console.warn(`[PlanningAgent] Cannot assign ${agentTasks.length} task(s): agent is not registered`);
        continue;
      }

      try {
        const response = await this.mcp.sendMessage('planning', agent, {
          type: 'task-assignment',
          tasks: agentTasks,
        });

        outcomes.push({
          agent,
          status: 'assigned',
          taskIds,
          response,
        });
        console.log(`[PlanningAgent] Assigned ${agentTasks.length} task(s) to ${agent}`);
      } catch (error) {
        outcomes.push({
          agent,
          status: 'failed',
          taskIds,
          reason: error instanceof Error ? error.message : 'Unknown assignment failure',
        });
        console.error(`[PlanningAgent] Failed to assign tasks to ${agent}:`, error);
      }
    }

    return outcomes;
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
