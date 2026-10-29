/**
 * Fail-closed policy defaults for the initial RHNS runtime.
 * This module authorizes proposals, not external writes.
 */
class PolicyEngine {
  constructor({ maxDepth = 4, maxTasksPerAssignment = 25, maxToolCalls = 50 } = {}) {
    this.limits = { maxDepth, maxTasksPerAssignment, maxToolCalls };
  }

  evaluateTask(task, context = {}) {
    if (!task || typeof task !== 'object') {
      return { allowed: false, reason: 'invalid_task' };
    }
    if (context.depth !== undefined && context.depth > this.limits.maxDepth) {
      return { allowed: false, reason: 'depth_budget_exceeded' };
    }
    if (context.taskCount !== undefined && context.taskCount > this.limits.maxTasksPerAssignment) {
      return { allowed: false, reason: 'assignment_task_budget_exceeded' };
    }
    if (context.toolCalls !== undefined && context.toolCalls > this.limits.maxToolCalls) {
      return { allowed: false, reason: 'tool_call_budget_exceeded' };
    }
    // The first release can create proposals only. All external writes,
    // deployments, payments and outbound messages are denied by default.
    if (context.effect && context.effect !== 'proposal') {
      return { allowed: false, reason: 'external_effects_disabled' };
    }
    return {
      allowed: true,
      mode: 'proposal_only',
      requiresHumanApproval: true,
      reason: 'proposal_allowed_no_external_side_effects',
    };
  }

  getStatus() {
    return {
      mode: 'proposal_only',
      externalWritesEnabled: false,
      limits: { ...this.limits },
    };
  }
}

module.exports = PolicyEngine;
