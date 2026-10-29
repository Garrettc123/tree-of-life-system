const ReWOOExecutor = require('../agents/orchestration/rewoo-executor');

function makeExecutor({ stepHandler, synthesisHandler, plan, durableStore, tenantId } = {}) {
  const executor = new ReWOOExecutor({
    durableStore,
    tenantId,
    planningTimeout: 100,
    executionTimeout: 100,
    synthesisTimeout: 100,
  });
  executor.registerAgent('planning-agent', {
    createPlan: async () => plan || {
      steps: [{ id: 'step-1', agentId: 'execution-agent', type: 'read_only_check' }],
    },
  });
  if (stepHandler) {
    executor.registerAgent('execution-agent', {
      executeStep: async (step, context) => stepHandler(step, context),
    });
  }
  executor.registerAgent('reflexion-agent', {
    synthesize: async (outputs, taskPlan, context) => {
      if (!synthesisHandler) throw new Error('synthesis adapter unavailable');
      return synthesisHandler(outputs, taskPlan, context);
    },
  });
  return executor;
}

describe('ReWOO execution status is evidence-based', () => {
  let executors = [];

  afterEach(() => {
    for (const executor of executors) executor.destroy();
    executors = [];
  });

  function track(options) {
    const executor = makeExecutor(options);
    executors.push(executor);
    return executor;
  }

  test('reports successful only when all steps and synthesis succeed', async () => {
    const executor = track({
      stepHandler: async (step) => ({ success: true, stepId: step.id }),
      synthesisHandler: async (outputs) => ({
        result: { success: true, count: outputs.length },
        critiques: [],
      }),
    });
    const result = await executor.execute('test task');
    expect(result.success).toBe(true);
    expect(result.stages.execution.stepsExecuted).toBe(1);
    expect(result.stages.execution.stepsFailed).toBe(0);
    expect(result.stages.synthesis.success).toBe(true);
  });

  test('does not report success when an execution step throws', async () => {
    const executor = track({
      stepHandler: async () => { throw new Error('approval missing'); },
      synthesisHandler: async () => ({ result: { success: true }, critiques: [] }),
    });
    const result = await executor.execute('blocked task');
    expect(result.success).toBe(false);
    expect(result.stages.execution.success).toBe(false);
    expect(result.stages.execution.stepsFailed).toBe(1);
    expect(result.error).toMatch(/Execution failed/);
  });

  test('does not silently skip a step whose agent is missing', async () => {
    const executor = track({
      plan: { steps: [{ id: 'step-missing', agentId: 'not-registered' }] },
      synthesisHandler: async () => ({ result: { success: true }, critiques: [] }),
    });
    const result = await executor.execute('missing agent task');
    expect(result.success).toBe(false);
    expect(result.stages.execution.stepsFailed).toBe(1);
    expect(result.stages.execution.outputs[0].error).toMatch(/Agent not found/);
  });

  test('does not report success when synthesis falls back after adapter failure', async () => {
    const executor = track({
      stepHandler: async () => ({ success: true, value: 'read-only-result' }),
    });
    const result = await executor.execute('synthesis failure task');
    expect(result.success).toBe(false);
    expect(result.stages.synthesis.success).toBe(false);
    expect(result.error).toMatch(/Synthesis failed/);
  });

  test('rejects synthesis that returns no result payload', async () => {
    const executor = track({
      stepHandler: async () => ({ success: true, value: 'real-result' }),
      synthesisHandler: async () => ({ critiques: [] }),
    });
    const result = await executor.execute('empty synthesis task');
    expect(result.success).toBe(false);
    expect(result.stages.synthesis.success).toBe(false);
    expect(result.error).toMatch(/Synthesis failed/);
  });

  test('treats explicit unsuccessful step results as failures', async () => {
    const executor = track({
      stepHandler: async () => ({ ok: false, error: 'policy denied' }),
      synthesisHandler: async () => ({ result: { success: true }, critiques: [] }),
    });
    const result = await executor.execute('policy denied task');
    expect(result.success).toBe(false);
    expect(result.stages.execution.outputs[0].error).toMatch(/policy denied/);
  });

  test('treats error-only execution output as failure', async () => {
    const executor = track({
      stepHandler: async () => ({ error: 'connector unavailable' }),
      synthesisHandler: async () => ({ result: { success: true }, critiques: [] }),
    });
    const result = await executor.execute('connector error task');
    expect(result.success).toBe(false);
    expect(result.stages.execution.outputs[0].error).toMatch(/connector unavailable/);
  });

  test('persists run, task, and synthesis evidence through durable state transitions', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const durableStore = {
      createRun: jest.fn(async (run) => ({ id: run.id, status: run.status })),
      transitionRun: jest.fn(async (id, _tenant, _expected, next) => ({ id, status: next })),
      createTask: jest.fn(async (task) => ({ id: task.id, status: task.status })),
      transitionTask: jest.fn(async (id, _tenant, _expected, next) => ({ id, status: next })),
      appendEvidence: jest.fn(async (evidence) => ({ id: 'evidence-row', entityId: evidence.entityId })),
    };
    const executor = track({
      durableStore,
      tenantId,
      stepHandler: async (step) => ({ success: true, stepId: step.id, observation: 'read-only' }),
      synthesisHandler: async (outputs) => ({
        success: true,
        result: { success: true, observationCount: outputs.length },
        critiques: [],
      }),
    });

    const result = await executor.execute({ action: 'agent_inventory' }, { actorId: 'test-operator' });

    expect(result.success).toBe(true);
    expect(durableStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      actorId: 'test-operator',
      executionMode: 'read_only_observation',
      status: 'created',
    }));
    expect(durableStore.transitionRun.mock.calls.map((call) => [call[2], call[3]])).toEqual([
      ['created', 'planning'],
      ['planning', 'executing'],
      ['executing', 'verifying'],
      ['verifying', 'succeeded'],
    ]);
    expect(durableStore.createTask).toHaveBeenCalledTimes(1);
    expect(durableStore.transitionTask.mock.calls.map((call) => [call[2], call[3]])).toEqual([
      ['proposed', 'executing'],
      ['executing', 'confirmed'],
    ]);
    expect(durableStore.appendEvidence).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      entityType: 'rhns_run',
      evidenceType: 'read_only_run_synthesis_result',
    }));
    expect(executor.getDurableRun(result.executionId)).toBeDefined();
  });

  test('does not start planning when durable run creation fails', async () => {
    const durableStore = {
      createRun: jest.fn().mockRejectedValue(new Error('ledger unavailable')),
      transitionRun: jest.fn(),
      createTask: jest.fn(),
      transitionTask: jest.fn(),
      appendEvidence: jest.fn(),
    };
    const stepHandler = jest.fn(async () => ({ success: true }));
    const executor = track({
      durableStore,
      tenantId: '11111111-1111-4111-8111-111111111111',
      stepHandler,
      synthesisHandler: async () => ({ result: { success: true }, critiques: [] }),
    });

    const result = await executor.execute({ action: 'agent_inventory' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ledger unavailable/);
    expect(durableStore.transitionRun).not.toHaveBeenCalled();
    expect(durableStore.createTask).not.toHaveBeenCalled();
    expect(stepHandler).not.toHaveBeenCalled();
  });

  test('durably marks failed steps and does not fabricate verification evidence', async () => {
    const durableStore = {
      createRun: jest.fn(async (run) => ({ id: run.id, status: run.status })),
      transitionRun: jest.fn(async (id, _tenant, _expected, next) => ({ id, status: next })),
      createTask: jest.fn(async (task) => ({ id: task.id, status: task.status })),
      transitionTask: jest.fn(async (id, _tenant, _expected, next) => ({ id, status: next })),
      appendEvidence: jest.fn(),
    };
    const executor = track({
      durableStore,
      tenantId: '11111111-1111-4111-8111-111111111111',
      stepHandler: async () => { throw new Error('inspection failed'); },
      synthesisHandler: async () => ({ result: { success: true }, critiques: [] }),
    });

    const result = await executor.execute({ action: 'agent_inventory' });
    expect(result.success).toBe(false);
    expect(durableStore.transitionTask.mock.calls.map((call) => call[3])).toEqual(['executing', 'failed']);
    expect(durableStore.transitionRun.mock.calls.at(-1).slice(2, 4)).toEqual(['executing', 'failed']);
    expect(durableStore.appendEvidence).not.toHaveBeenCalled();
  });

  test('treats a plan with an unqualified error as unsuccessful', async () => {
    const executor = track({
      plan: { steps: [], error: 'planning dependency unavailable' },
      stepHandler: async () => ({ success: true }),
      synthesisHandler: async () => ({ result: { success: true }, critiques: [] }),
    });
    const result = await executor.execute('planning error task');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/planning dependency unavailable/);
  });
});
