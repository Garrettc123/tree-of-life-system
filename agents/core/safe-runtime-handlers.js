const SUPPORTED_ACTIONS = new Set([
  'runtime_health_check',
  'agent_inventory',
  'readiness_check',
]);

function normalizeAction(request) {
  const candidate = typeof request === 'string'
    ? request
    : request && typeof request === 'object'
      ? request.action || request.taskType || request.type
      : null;

  if (typeof candidate !== 'string') {
    throw new Error('A supported read-only action must be named explicitly');
  }

  const normalized = candidate
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!SUPPORTED_ACTIONS.has(normalized)) {
    throw new Error(
      `Unsupported action "${candidate}". Available actions: ${Array.from(SUPPORTED_ACTIONS).join(', ')}. `
      + 'This runtime does not enable external actions by default.',
    );
  }

  return normalized;
}

function createSafeRuntimeHandlers({ getStatusSnapshot, now = () => new Date() } = {}) {
  if (typeof getStatusSnapshot !== 'function') {
    throw new TypeError('getStatusSnapshot must be a function');
  }

  const readSnapshot = () => {
    const snapshot = getStatusSnapshot();
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Runtime status snapshot is unavailable');
    }
    return snapshot;
  };

  return {
    planHandler: async (request) => {
      const action = normalizeAction(request);
      const taskId = request && typeof request === 'object' && request.taskId
        ? String(request.taskId)
        : `runtime-${action}`;

      return {
        taskId,
        action,
        readOnly: true,
        steps: [{
          id: `${action}-1`,
          agentId: 'execution-agent',
          type: 'runtime_observation',
          action,
          input: { taskId },
          policyLevel: 0,
          sideEffect: false,
        }],
      };
    },

    stepHandler: async (step) => {
      if (!step || step.type !== 'runtime_observation') {
        throw new Error('Only explicit runtime_observation steps are supported');
      }

      const action = normalizeAction(step.action);
      const snapshot = readSnapshot();
      const checkedAt = now().toISOString();

      if (action === 'readiness_check') {
        const ready = snapshot.status === 'ready'
          && snapshot.startup_completed === true
          && snapshot.grpc?.status === 'listening'
          && snapshot.agents?.registered > 0
          && snapshot.agents.operational === snapshot.agents.registered;

        if (!ready) {
          return {
            success: false,
            error: 'runtime_not_ready',
            checkedAt,
            status: snapshot,
          };
        }

        return { success: true, action, checkedAt, status: snapshot };
      }

      if (action === 'runtime_health_check') {
        const live = snapshot.startup_completed === true
          && snapshot.grpc?.status === 'listening';

        if (!live) {
          return {
            success: false,
            error: 'runtime_not_live',
            checkedAt,
            status: snapshot,
          };
        }

        return { success: true, action, checkedAt, status: snapshot };
      }

      return {
        success: true,
        action,
        checkedAt,
        registeredAgents: snapshot.agents?.registered ?? 0,
        operationalAgents: snapshot.agents?.operational ?? 0,
        agents: Array.isArray(snapshot.agents?.list) ? snapshot.agents.list : [],
      };
    },

    synthesisHandler: async (outputs, plan) => {
      const expected = Array.isArray(plan?.steps) ? plan.steps.length : 0;
      const failed = Array.isArray(outputs)
        ? outputs.filter((item) => item?.error
          || item?.output?.success === false
          || item?.output?.ok === false
          || (typeof item?.output?.error === 'string'
            && item.output.success !== true
            && item.output.ok !== true))
        : [];

      if (!Array.isArray(outputs) || expected === 0 || outputs.length !== expected || failed.length > 0) {
        return {
          success: false,
          error: 'runtime_observation_incomplete',
          result: { success: false, expectedSteps: expected, returnedSteps: outputs?.length ?? 0 },
          critiques: [{ severity: 'error', message: 'One or more requested observations did not complete.' }],
        };
      }

      const observations = outputs.map((item) => item.output);
      if (observations.some((item) => item?.success !== true)) {
        return {
          success: false,
          error: 'runtime_observation_unverified',
          result: { success: false },
          critiques: [{ severity: 'error', message: 'The observation result did not explicitly confirm success.' }],
        };
      }

      return {
        success: true,
        result: {
          success: true,
          action: plan.action,
          taskId: plan.taskId,
          observationCount: observations.length,
          observations,
        },
        critiques: [],
      };
    },
  };
}

module.exports = { createSafeRuntimeHandlers, SUPPORTED_ACTIONS };
