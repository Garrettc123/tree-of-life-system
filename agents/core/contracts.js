const crypto = require('crypto');

const TASK_TYPES = new Set([
  'create_file',
  'setup_cicd',
  'create_issues',
  'enhance_description',
  'sync_integration',
]);

const TASK_STATES = Object.freeze({
  PROPOSED: 'draft_pending_review',
  APPROVED: 'approved',
  EXECUTING: 'executing',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  UNKNOWN: 'unknown_outcome',
});

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return { valid: false, error: 'Task must be an object' };
  }
  if (typeof task.id !== 'string' || !task.id.trim()) {
    return { valid: false, error: 'Task id is required' };
  }
  if (typeof task.type !== 'string' || !TASK_TYPES.has(task.type)) {
    return { valid: false, error: `Unsupported task type: ${String(task.type || 'missing')}` };
  }
  if (typeof task.agent !== 'string' || !task.agent.trim()) {
    return { valid: false, error: 'Task target agent is required' };
  }
  if (task.params !== undefined && (!task.params || typeof task.params !== 'object' || Array.isArray(task.params))) {
    return { valid: false, error: 'Task params must be an object when supplied' };
  }
  return { valid: true };
}

function canonicalHash(value) {
  function stable(input) {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === 'object') {
      return Object.keys(input).sort().reduce((out, key) => {
        out[key] = stable(input[key]);
        return out;
      }, {});
    }
    return input;
  }
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

module.exports = { TASK_TYPES, TASK_STATES, validateTask, canonicalHash };
