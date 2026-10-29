const ReWOOExecutor = require('../agents/orchestration/rewoo-executor');

function makeExecutor({ stepHandler, synthesisHandler, plan } = {}) {
  const executor = new ReWOOExecutor({
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
});
