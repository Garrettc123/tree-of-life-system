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
const { randomUUID } = require('crypto');

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
    this.durableStore = config.durableStore || null;
    this.tenantId = config.tenantId || null;

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
    const executionId = randomUUID();
    const execution = {
      id: executionId,
      task,
      context,
      stages: {},
      timestamp: new Date().toISOString(),
      status: 'initiated',
      durableRunStatus: null,
      durableTaskIds: new Map(),
    };

    this.executions.set(executionId, execution);

    try {
      if (this.durableStore) {
        if (!this.tenantId) throw new Error('Durable RHNS execution requires a tenant ID');
        await this.durableStore.createRun({
          id: executionId,
          tenantId: this.tenantId,
          runKey: String(context.runKey || executionId),
          actorId: String(context.actorId || 'rhns-runtime'),
          executionMode: 'read_only_observation',
          status: 'created',
          goal: task,
          metadata: { source: 'rewoo-executor', version: 1 },
        });
        execution.durableRunStatus = 'created';
        await this._transitionRun(execution, 'planning');
      }

      // STAGE 1: PLANNING
      console.log(`[ReWOOExecutor] Stage 1 - Planning (${executionId})`);
      execution.stages.planning = await this.stagePlanning(task, context, executionId);
      
      if (!execution.stages.planning.success) {
        throw new Error(`Planning failed: ${execution.stages.planning.error}`);
      }

      if (this.durableStore) {
        await this._transitionRun(execution, 'executing', {
          output: { planSteps: execution.stages.planning.stepsCount },
        });
        for (const step of execution.stages.planning.plan.steps) {
          const stepKey = String(step && step.id || '');
          if (!stepKey) throw new Error('Durable RHNS task requires every plan step to have an id');
          const taskRow = await this.durableStore.createTask({
            id: randomUUID(),
            tenantId: this.tenantId,
            runId: executionId,
            taskKey: stepKey,
            agentId: String(step.agentId || 'unknown-agent'),
            taskType: String(step.type || 'unknown'),
            status: 'proposed',
            input: step,
          });
          execution.durableTaskIds.set(stepKey, taskRow.id);
        }
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

      if (this.durableStore) {
        await this._transitionRun(execution, 'verifying');
      }

      // STAGE 3: SYNTHESIS
      console.log(`[ReWOOExecutor] Stage 3 - Synthesis (${executionId})`);
      execution.stages.synthesis = await this.stageSynthesis(
        execution.stages.execution.outputs,
        execution.stages.planning.plan,
        context,
        executionId
      );

      if (!execution.stages.synthesis.success) {
        throw new Error(`Synthesis failed: ${execution.stages.synthesis.error || 'no valid synthesis result'}`);
      }

      if (this.durableStore) {
        const evidenceContent = {
          runId: executionId,
          executionMode: 'read_only_observation',
          task: execution.task,
          result: execution.stages.synthesis.result,
          stepCount: execution.stages.execution.stepsExecuted,
          verifier: 'rewoo-synthesis-stage',
        };
        await this.durableStore.appendEvidence({
          tenantId: this.tenantId,
          entityType: 'rhns_run',
          entityId: executionId,
          evidenceType: 'read_only_run_synthesis_result',
          source: 'rhns-rewoo-executor',
          content: evidenceContent,
        });
        await this._transitionRun(execution, 'succeeded', {
          output: { result: execution.stages.synthesis.result, evidenceType: 'read_only_run_synthesis_result' },
        });
      }

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
      if (this.durableStore && execution.durableRunStatus
          && !['succeeded', 'rejected', 'failed', 'cancelled', 'unknown_outcome'].includes(execution.durableRunStatus)) {
        const nextStatus = /timeout/i.test(error.message) && execution.durableRunStatus === 'executing'
          ? 'unknown_outcome'
          : 'failed';
        try {
          await this._transitionRun(execution, nextStatus, {
            error: { message: error.message, stage: execution.durableRunStatus },
          });
        } catch (persistenceError) {
          execution.persistenceError = 'Could not persist terminal run status: '
            + (persistenceError instanceof Error ? persistenceError.message : 'unknown storage error');
        }
      }
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

  async _transitionRun(execution, nextStatus, patch = {}) {
    const expectedStatus = execution.durableRunStatus;
    const result = await this.durableStore.transitionRun(
      execution.id,
      this.tenantId,
      expectedStatus,
      nextStatus,
      patch,
    );
    if (!result) {
      throw new Error('durable_run_transition_conflict:' + expectedStatus + '->' + nextStatus);
    }
    execution.durableRunStatus = nextStatus;
    return result;
  }

  async _transitionTask(taskId, expectedStatus, nextStatus, patch = {}) {
    const result = await this.durableStore.transitionTask(
      taskId,
      this.tenantId,
      expectedStatus,
      nextStatus,
      patch,
    );
    if (!result) {
      throw new Error('durable_task_transition_conflict:' + expectedStatus + '->' + nextStatus);
    }
    return result;
  }

  async getDurableRun(executionId) {
    if (!this.durableStore) throw new Error('Durable RHNS storage is disabled');
    return this.durableStore.getRun(executionId, this.tenantId);
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
      const plan = await this.withTimeout(
        planningAgent.createPlan(task, context),
        this.config.planningTimeout,
      );

      if (!plan || plan.success === false || plan.ok === false
        || (typeof plan.error === 'string' && plan.success !== true && plan.ok !== true)
        || !Array.isArray(plan.steps)) {
        throw new Error(plan && plan.error ? String(plan.error) : 'Planning agent returned an invalid or unsuccessful plan');
      }

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
    const execution = this.executions.get(executionId);

    try {
      for (const step of plan.steps) {
        console.log(`[ReWOOExecutor] Executing step: ${step.id}`);

        // Get execution agent for this step's type
        const agent = this.agents.get(step.agentId);
        if (!agent) {
          const error = `Agent not found for step ${step.id}: ${step.agentId}`;
          console.error(`[ReWOOExecutor] ${error}`);
          const durableTaskId = execution.durableTaskIds.get(String(step.id));
          if (this.durableStore && durableTaskId) {
            await this._transitionTask(durableTaskId, 'proposed', 'failed', { error: { message: error } });
          }
          outputs.push({
            stepId: step.id,
            error,
            timestamp: new Date().toISOString(),
          });
          this.emit('step:failed', { executionId, stepId: step.id, error });
          continue;
        }

        let durableTaskStatus = 'proposed';
        const durableTaskId = execution.durableTaskIds.get(String(step.id));
        try {
          if (this.durableStore && durableTaskId) {
            await this._transitionTask(durableTaskId, 'proposed', 'executing');
            durableTaskStatus = 'executing';
          }

          const output = await this.withTimeout(
            agent.executeStep(step, context),
            this.config.executionTimeout,
          );

          if (output === false || (output && typeof output === 'object'
            && (output.success === false || output.ok === false
              || (typeof output.error === 'string' && output.success !== true && output.ok !== true)))) {
            const detail = output && typeof output === 'object' && output.error
              ? String(output.error)
              : 'Agent reported an unsuccessful step result';
            throw new Error(detail);
          }

          if (this.durableStore && durableTaskId) {
            await this._transitionTask(durableTaskId, 'executing', 'confirmed', { output });
            durableTaskStatus = 'confirmed';
          }

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
          if (this.durableStore && durableTaskId
              && ['proposed', 'approved', 'executing'].includes(durableTaskStatus)) {
            const nextTaskStatus = /timeout/i.test(stepError.message) && durableTaskStatus === 'executing'
              ? 'unknown_outcome'
              : 'failed';
            try {
              await this._transitionTask(durableTaskId, durableTaskStatus, nextTaskStatus, {
                error: { message: stepError.message },
              });
              durableTaskStatus = nextTaskStatus;
            } catch (persistenceError) {
              console.error('[ReWOOExecutor] Could not persist task failure:', persistenceError.message);
            }
          }

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

      const successfulSteps = outputs.filter((item) => !item.error).length;
      const failedSteps = outputs.length - successfulSteps;
      const error = failedSteps > 0
        ? `${failedSteps} of ${outputs.length} execution steps failed: ${outputs.find((item) => item.error).error}`
        : outputs.length === 0
          ? 'No execution steps produced results'
          : undefined;
      return {
        success: outputs.length > 0 && failedSteps === 0,
        ...(error ? { error } : {}),
        outputs,
        duration,
        stepsExecuted: successfulSteps,
        stepsFailed: failedSteps,
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
      const synthesis = await this.withTimeout(
        reflexionAgent.synthesize(outputs, plan, context),
        this.config.synthesisTimeout,
      );

      const result = synthesis && synthesis.result;
      if (!synthesis || typeof synthesis !== 'object' || result === undefined || result === null || result === false
        || synthesis.success === false || synthesis.ok === false
        || (typeof synthesis.error === 'string' && synthesis.success !== true && synthesis.ok !== true)
        || (result && typeof result === 'object'
          && (result.success === false || result.ok === false
            || (typeof result.error === 'string' && result.success !== true && result.ok !== true))) {
        throw new Error(synthesis && synthesis.error
          ? String(synthesis.error)
          : 'Reflexion agent returned a missing or unsuccessful synthesis result');
      }

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

  async withTimeout(operation, ms) {
    let handle;
    try {
      const timeout = new Promise((_, reject) => {
        handle = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      });
      return await Promise.race([Promise.resolve(operation), timeout]);
    } finally {
      if (handle) clearTimeout(handle);
    }
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
