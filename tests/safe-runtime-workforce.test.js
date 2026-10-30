const RuntimeAgent = require('../agents/runtime-agent');
const ReWOOExecutor = require('../agents/orchestration/rewoo-executor');
const { createSafeRuntimeHandlers } = require('../agents/core/safe-runtime-handlers');

function makeSnapshot(status = 'ready') {
  return {
    service: 'tree-of-life-agent-runtime',
    status,
    startup_completed: true,
    grpc: { status: 'listening' },
    agents: {
      registered: 3,
      operational: 3,
      list: [
        { id: 'planning-agent', type: 'Planning', status: 'active' },
        { id: 'execution-agent', type: 'Execution', status: 'active' },
        { id: 'reflexion-agent', type: 'Reflexion', status: 'active' },
      ],
    },
  };
}

function makeExecutor(getSnapshot) {
  const handlers = createSafeRuntimeHandlers({ getStatusSnapshot: getSnapshot });
  const executor = new ReWOOExecutor({
    planningTimeout: 100,
    executionTimeout: 100,
    synthesisTimeout: 100,
  });
  executor.registerAgent('planning-agent', new RuntimeAgent({
    id: 'planning-agent', role: 'planner', planHandler: handlers.planHandler,
  }));
  executor.registerAgent('execution-agent', new RuntimeAgent({
    id: 'execution-agent', role: 'executor', stepHandler: handlers.stepHandler,
  }));
  executor.registerAgent('reflexion-agent', new RuntimeAgent({
    id: 'reflexion-agent', role: 'critic', synthesisHandler: handlers.synthesisHandler,
  }));
  return executor;
}

describe('bounded read-only agent workforce', () => {
  let executors = [];
  afterEach(() => {
    executors.forEach((executor) => executor.destroy());
    executors = [];
  });

  test('all three core agents perform a real read-only health workflow', async () => {
    const executor = makeExecutor(() => makeSnapshot());
    executors.push(executor);

    const result = await executor.execute({ action: 'runtime_health_check', taskId: 'canary-1' });
    expect(result.success).toBe(true);
    expect(result.stages.planning.plan.readOnly).toBe(true);
    expect(result.stages.execution.stepsExecuted).toBe(1);
    expect(result.stages.synthesis.result.success).toBe(true);
    expect(result.stages.synthesis.result.observations[0].status.agents.operational).toBe(3);
  });

  test('supports a read-only agent inventory request', async () => {
    const executor = makeExecutor(() => makeSnapshot());
    executors.push(executor);

    const result = await executor.execute({ action: 'agent_inventory' });
    expect(result.success).toBe(true);
    expect(result.stages.synthesis.result.observations[0].agents).toHaveLength(3);
  });

  test('does not let the planner turn external actions into executable steps', async () => {
    const executor = makeExecutor(() => makeSnapshot());
    executors.push(executor);

    const result = await executor.execute({ action: 'send_email', recipient: 'customer' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Planning failed/);
  });

  test('does not report readiness success when runtime is degraded', async () => {
    const executor = makeExecutor(() => makeSnapshot('degraded'));
    executors.push(executor);

    const result = await executor.execute({ action: 'readiness_check' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Execution failed/);
  });
});
