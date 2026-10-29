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
});
