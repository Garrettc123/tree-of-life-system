const RuntimeAgent = require('../agents/runtime-agent');

describe('RuntimeAgent execution safety', () => {
  test('unconfigured agents report unconfigured and reject task execution', async () => {
    const agent = new RuntimeAgent({ id: 'execution-agent', role: 'executor' });
    expect(agent.getStatus()).toBe('unconfigured');
    await expect(agent.handleTask({ taskId: 't1', taskType: 'external_action' }))
      .rejects.toThrow('no task handler is configured');
    expect(agent.tasksProcessed).toBe(0);
  });

  test('configured task handler returns its real result and records completion', async () => {
    const agent = new RuntimeAgent({
      id: 'execution-agent',
      role: 'executor',
      taskHandler: async ({ taskId }) => ({ taskId, result: 'handled-by-adapter' }),
    });
    const result = await agent.handleTask({ taskId: 't2', taskType: 'test' });
    expect(agent.getStatus()).toBe('active');
    expect(JSON.parse(result.toString('utf8'))).toEqual({
      taskId: 't2',
      result: 'handled-by-adapter',
    });
    expect(agent.tasksProcessed).toBe(1);
  });

  test('planning, execution, and synthesis fail closed when their adapter is absent', async () => {
    const planner = new RuntimeAgent({ id: 'planning-agent', role: 'planner' });
    const executor = new RuntimeAgent({ id: 'execution-agent', role: 'executor' });
    const critic = new RuntimeAgent({ id: 'reflexion-agent', role: 'critic' });
    await expect(planner.createPlan('task')).rejects.toThrow('no plan handler is configured');
    await expect(executor.executeStep({ id: 'step-1' })).rejects.toThrow('no step handler is configured');
    await expect(critic.synthesize([], {})).rejects.toThrow('no synthesis handler is configured');
  });

  test('gRPC task calls use role-specific handlers when provided', async () => {
    const planner = new RuntimeAgent({
      id: 'planning-agent',
      role: 'planner',
      planHandler: async (task) => ({ steps: [{ id: 'step-1', task }] }),
    });
    const executor = new RuntimeAgent({
      id: 'execution-agent',
      role: 'executor',
      stepHandler: async (step) => ({ success: true, stepId: step.id }),
    });
    const critic = new RuntimeAgent({
      id: 'reflexion-agent',
      role: 'critic',
      synthesisHandler: async (outputs) => ({ summary: 'reviewed', outputs: outputs.length }),
    });

    expect(JSON.parse((await planner.handleTask({ taskId: 'p1', payload: Buffer.from('{"goal":"check"}') })).toString()))
      .toEqual({ steps: [{ id: 'step-1', task: { goal: 'check' } }] });
    expect(JSON.parse((await executor.handleTask({ taskId: 'e1', taskType: 'execute', payload: Buffer.from('{"id":"step-2"}') })).toString()))
      .toEqual({ success: true, stepId: 'step-2' });
    expect(JSON.parse((await critic.handleTask({ taskId: 'c1', payload: Buffer.from('{"outputs":[1,2,3]}') })).toString()))
      .toEqual({ summary: 'reviewed', outputs: 3 });
    expect(planner.getStatus()).toBe('active');
    expect(executor.getStatus()).toBe('active');
    expect(critic.getStatus()).toBe('active');
  });

  test('a handler failure is not counted or emitted as task completion', async () => {
    const agent = new RuntimeAgent({
      id: 'execution-agent',
      role: 'executor',
      taskHandler: async () => ({ success: false, error: 'approval missing' }),
    });
    const events = [];
    agent.on('event', (event) => events.push(event));
    await expect(agent.handleTask({ taskId: 'blocked-1' })).rejects.toThrow('approval missing');
    expect(agent.tasksProcessed).toBe(0);
    expect(events).toHaveLength(0);
  });

  test('an error-only result is not treated as successful task completion', async () => {
    const agent = new RuntimeAgent({
      id: 'execution-agent',
      role: 'executor',
      taskHandler: async () => ({ error: 'downstream unavailable' }),
    });
    const events = [];
    agent.on('event', (event) => events.push(event));
    await expect(agent.handleTask({ taskId: 'error-only-1' })).rejects.toThrow('downstream unavailable');
    expect(agent.tasksProcessed).toBe(0);
    expect(events).toHaveLength(0);
  });
});
