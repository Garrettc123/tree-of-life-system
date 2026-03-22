/**
 * ReWOO Orchestration Executor
 * Reasoning Without Observation - 3-stage agent orchestration
 * 
 * Stages:
 * 1. Planning: MCP Coordinator creates execution blueprint (no tool calls)
 * 2. Execution: Agents call tools with plan constraints
 * 3. Synthesis: Reflexion agents critique and refine outputs
 * 
 * Benefits:
 * - Better reasoning quality (multi-stage planning)
 * - Autonomous error correction
 * - Full decision transparency
 * - Improved scalability without central bottleneck
 */

const EventEmitter = require('events');
const uuid = require('uuid');

class ReWOOExecutor extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxIterations: config.maxIterations || 3,
      planningTimeout: config.planningTimeout || 30000,
      executionTimeout: config.executionTimeout || 60000,
      synthesisTimeout: config.synthesisTimeout || 30000,
      executionTTL: config.executionTTL || 3600000, // 1 hour default TTL
      maxExecutions: config.maxExecutions || 1000, // Max executions to keep in memory
      ...config,
    };

    this.executions = new Map();
    this.agents = new Map();

    // Periodically clean up old executions to prevent memory leak
    this.cleanupInterval = setInterval(() => this.cleanupOldExecutions(), 300000); // Every 5 minutes
  }

  /**
   * Clean up old executions to prevent unbounded memory growth
   */
  cleanupOldExecutions() {
    const now = Date.now();
    const executions = Array.from(this.executions.entries());

    // Remove executions older than TTL
    let removedCount = 0;
    for (const [id, execution] of executions) {
      const age = now - new Date(execution.timestamp).getTime();
      if (age > this.config.executionTTL) {
        this.executions.delete(id);
        removedCount++;
      }
    }

    // If still over limit, remove oldest executions
    if (this.executions.size > this.config.maxExecutions) {
      const sortedExecutions = Array.from(this.executions.entries())
        .sort((a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp));

      const toRemove = this.executions.size - this.config.maxExecutions;
      for (let i = 0; i < toRemove; i++) {
        this.executions.delete(sortedExecutions[i][0]);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[ReWOOExecutor] Cleaned up ${removedCount} old executions. Current size: ${this.executions.size}`);
    }
  }

  /**
   * Clean up resources on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.executions.clear();
    console.log('[ReWOOExecutor] Resources cleaned up');
  }

  registerAgent(agentId, agent) {
    this.agents.set(agentId, agent);
    console.log(`[ReWOOExecutor] Registered agent: ${agentId}`);
  }

  async execute(task, context = {}) {
    const executionId = uuid.v4();
    const execution = {
      id: executionId,
      task,
      context,
      stages: {},
      timestamp: new Date().toISOString(),
      status: 'initiated',
    };

    this.executions.set(executionId, execution);

    try {
      // STAGE 1: PLANNING
      console.log(`[ReWOOExecutor] Stage 1 - Planning (${executionId})`);
      execution.stages.planning = await this.stagePlanning(task, context, executionId);
      
      if (!execution.stages.planning.success) {
        throw new Error(`Planning failed: ${execution.stages.planning.error}`);
      }

      // STAGE 2: EXECUTION
      console.log(`[ReWOOExecutor] Stage 2 - Execution (${executionId})`);
      execution.stages.execution = await this.stageExecution(
        execution.stages.planning.plan,
        context,
        executionId
      );

      if (!execution.stages.execution.success) {
        throw new Error(`Execution failed: ${execution.stages.execution.error}`);
      }

      // STAGE 3: SYNTHESIS
      console.log(`[ReWOOExecutor] Stage 3 - Synthesis (${executionId})`);
      execution.stages.synthesis = await this.stageSynthesis(
        execution.stages.execution.outputs,
        execution.stages.planning.plan,
        context,
        executionId
      );

      execution.status = 'completed';
      this.emit('execution:completed', execution);

      return {
        success: true,
        executionId,
        result: execution.stages.synthesis.result,
        stages: execution.stages,
      };
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      this.emit('execution:failed', execution);

      console.error(`[ReWOOExecutor] Execution failed (${executionId}):`, error.message);
      return {
        success: false,
        executionId,
        error: error.message,
        stages: execution.stages,
      };
    }
  }

  async stagePlanning(task, context, executionId) {
    const startTime = Date.now();
    
    try {
      // Get planning agent
      const planningAgent = this.agents.get('planning-agent');
      if (!planningAgent) {
        throw new Error('Planning agent not found');
      }

      // Create execution plan WITHOUT making tool calls
      const plan = await Promise.race([
        planningAgent.createPlan(task, context),
        this.timeout(this.config.planningTimeout),
      ]);

      const duration = Date.now() - startTime;

      this.emit('stage:planning:completed', {
        executionId,
        planSteps: plan.steps.length,
        duration,
      });

      return {
        success: true,
        plan,
        duration,
        stepsCount: plan.steps.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  async stageExecution(plan, context, executionId) {
    const startTime = Date.now();
    const outputs = [];

    try {
      for (const step of plan.steps) {
        console.log(`[ReWOOExecutor] Executing step: ${step.id}`);

        // Get execution agent for this step's type
        const agent = this.agents.get(step.agentId);
        if (!agent) {
          console.warn(`[ReWOOExecutor] Agent not found for step ${step.id}: ${step.agentId}`);
          continue;
        }

        try {
          const output = await Promise.race([
            agent.executeStep(step, context),
            this.timeout(this.config.executionTimeout),
          ]);

          outputs.push({
            stepId: step.id,
            output,
            timestamp: new Date().toISOString(),
          });

          this.emit('step:completed', {
            executionId,
            stepId: step.id,
            success: true,
          });
        } catch (stepError) {
          console.error(`[ReWOOExecutor] Step ${step.id} failed:`, stepError.message);
          
          outputs.push({
            stepId: step.id,
            error: stepError.message,
            timestamp: new Date().toISOString(),
          });

          this.emit('step:failed', {
            executionId,
            stepId: step.id,
            error: stepError.message,
          });
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: outputs.length > 0,
        outputs,
        duration,
        stepsExecuted: outputs.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error.message,
        duration,
        outputs,
      };
    }
  }

  async stageSynthesis(outputs, plan, context, executionId) {
    const startTime = Date.now();

    try {
      // Get reflexion agent for synthesis
      const reflexionAgent = this.agents.get('reflexion-agent');
      if (!reflexionAgent) {
        throw new Error('Reflexion agent not found');
      }

      // Synthesize outputs and generate critique
      const synthesis = await Promise.race([
        reflexionAgent.synthesize(outputs, plan, context),
        this.timeout(this.config.synthesisTimeout),
      ]);

      const duration = Date.now() - startTime;

      this.emit('stage:synthesis:completed', {
        executionId,
        critiques: synthesis.critiques?.length || 0,
        duration,
      });

      return {
        success: true,
        result: synthesis.result,
        critiques: synthesis.critiques || [],
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Fallback synthesis if reflexion agent fails
      console.warn(`[ReWOOExecutor] Reflexion synthesis failed, using fallback:`, error.message);
      
      return {
        success: false,
        error: error.message,
        result: this.fallbackSynthesis(outputs),
        duration,
        isFallback: true,
      };
    }
  }

  fallbackSynthesis(outputs) {
    // Combine outputs into unified result if synthesis fails
    return {
      outputs: outputs.filter(o => !o.error),
      errors: outputs.filter(o => o.error),
      summary: `${outputs.filter(o => !o.error).length} steps completed, ${outputs.filter(o => o.error).length} failed`,
    };
  }

  timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }

  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  getMetrics() {
    const executions = Array.from(this.executions.values());
    const completed = executions.filter(e => e.status === 'completed').length;
    const failed = executions.filter(e => e.status === 'failed').length;

    return {
      totalExecutions: executions.length,
      completed,
      failed,
      successRate: completed / executions.length || 0,
      registeredAgents: this.agents.size,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = ReWOOExecutor;
