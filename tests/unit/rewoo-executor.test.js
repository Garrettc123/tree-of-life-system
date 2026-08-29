'use strict';

/**
 * Unit tests for ReWOOExecutor
 * All external dependencies (Kafka, gRPC) are mocked.
 */

const ReWOOExecutor = require('../../agents/orchestration/rewoo-executor');

describe('ReWOOExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new ReWOOExecutor({
      maxIterations: 2,
      planningTimeout: 5000,
      executionTimeout: 5000,
      synthesisTimeout: 5000
    });
  });

  afterEach(() => {
    if (executor.cleanupInterval) {
      clearInterval(executor.cleanupInterval);
    }
  });

  describe('constructor', () => {
    it('should initialize with default config values', () => {
      const defaultExecutor = new ReWOOExecutor();
      expect(defaultExecutor.config.maxIterations).toBe(3);
      expect(defaultExecutor.config.planningTimeout).toBe(30000);
      clearInterval(defaultExecutor.cleanupInterval);
    });

    it('should accept custom config values', () => {
      expect(executor.config.maxIterations).toBe(2);
      expect(executor.config.planningTimeout).toBe(5000);
    });

    it('should initialize with empty agents and executions maps', () => {
      expect(executor.agents.size).toBe(0);
      expect(executor.executions.size).toBe(0);
    });
  });

  describe('registerAgent', () => {
    it('should register an agent successfully', () => {
      const mockAgent = { id: 'test-agent', role: 'planner' };
      executor.registerAgent('test-agent', mockAgent);
      expect(executor.agents.has('test-agent')).toBe(true);
      expect(executor.agents.get('test-agent')).toBe(mockAgent);
    });

    it('should overwrite an existing agent with the same id', () => {
      const agent1 = { id: 'agent-1', role: 'planner' };
      const agent2 = { id: 'agent-1', role: 'executor' };
      executor.registerAgent('agent-1', agent1);
      executor.registerAgent('agent-1', agent2);
      expect(executor.agents.get('agent-1').role).toBe('executor');
    });
  });

  describe('getMetrics', () => {
    it('should return a metrics object', () => {
      const metrics = executor.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
    });
  });

  describe('cleanupOldExecutions', () => {
    it('should remove executions older than TTL', () => {
      const oldTimestamp = new Date(Date.now() - 7200000).toISOString();
      executor.executions.set('old-exec', { timestamp: oldTimestamp, status: 'completed' });
      executor.executions.set('new-exec', { timestamp: new Date().toISOString(), status: 'running' });

      executor.config.executionTTL = 3600000;
      executor.cleanupOldExecutions();

      expect(executor.executions.has('old-exec')).toBe(false);
      expect(executor.executions.has('new-exec')).toBe(true);
    });
  });

  describe('execute', () => {
    it('should return failure result if no planning agent is registered', async () => {
      const result = await executor.execute('test task', {});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should run a full planning/execution/synthesis cycle with mock agents', async () => {
      const mockPlanningAgent = {
        id: 'planning-agent',
        role: 'planner',
        createPlan: jest.fn().mockResolvedValue({
          taskId: 'task-1',
          steps: [
            { id: 'step-1', agentId: 'execution-agent', type: 'execute', description: 'do it' }
          ]
        })
      };

      const mockExecutionAgent = {
        id: 'execution-agent',
        role: 'executor',
        executeStep: jest.fn().mockResolvedValue({
          stepId: 'step-1',
          success: true,
          output: 'done',
          timestamp: new Date().toISOString()
        })
      };

      const mockReflexionAgent = {
        id: 'reflexion-agent',
        role: 'critic',
        synthesize: jest.fn().mockResolvedValue({
          result: { success: true, summary: 'all good' },
          critiques: []
        })
      };

      executor.registerAgent('planning-agent', mockPlanningAgent);
      executor.registerAgent('execution-agent', mockExecutionAgent);
      executor.registerAgent('reflexion-agent', mockReflexionAgent);

      const result = await executor.execute('test task', { taskId: 'task-1' });

      expect(result).toBeDefined();
      expect(mockPlanningAgent.createPlan).toHaveBeenCalledTimes(1);
    });
  });
});
