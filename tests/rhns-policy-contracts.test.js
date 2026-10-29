const PolicyEngine = require('../agents/core/policy-engine');
const { validateTask, canonicalHash } = require('../agents/core/contracts');

describe('RHNS policy and task contracts', () => {
  test('rejects malformed tasks and unknown task types', () => {
    expect(validateTask(null).valid).toBe(false);
    expect(validateTask({ id: 'x', type: 'unknown', agent: 'development' }).valid).toBe(false);
    expect(validateTask({ id: 'x', type: 'create_file', agent: 'development', params: [] }).valid).toBe(false);
  });

  test('allows bounded proposal work but denies external effects', () => {
    const policy = new PolicyEngine({ maxDepth: 4, maxTasksPerAssignment: 3 });
    expect(policy.evaluateTask({ id: 'x' }, { effect: 'proposal', depth: 1, taskCount: 1 }).allowed).toBe(true);
    expect(policy.evaluateTask({ id: 'x' }, { effect: 'write' }).reason).toBe('external_effects_disabled');
    expect(policy.evaluateTask({ id: 'x' }, { depth: 5 }).reason).toBe('depth_budget_exceeded');
    expect(policy.evaluateTask({ id: 'x' }, { taskCount: 4 }).reason).toBe('assignment_task_budget_exceeded');
    expect(policy.getStatus().externalWritesEnabled).toBe(false);
  });

  test('canonical argument hash ignores object key order', () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
  });
});
