/**
 * RuntimeAgent — the minimum object the gRPC gateway and ReWOO executor can call.
 * Replaces the inert {id, role, type} stubs that made executeTask throw.
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class RuntimeAgent extends EventEmitter {
  constructor(spec = {}) {
    super();
    this.id = spec.id;
    this.role = spec.role || 'executor';
    this.type = spec.type || 'Runtime';
    this.capabilities = spec.capabilities || [this.role];
    this.handlers = {
      task: typeof spec.taskHandler === 'function' ? spec.taskHandler : null,
      plan: typeof spec.planHandler === 'function' ? spec.planHandler : null,
      step: typeof spec.stepHandler === 'function' ? spec.stepHandler : null,
      synthesis: typeof spec.synthesisHandler === 'function' ? spec.synthesisHandler : null,
    };
    this.startTime = Date.now();
    this.tasksProcessed = 0;
    this.lastHeartbeat = new Date().toISOString();
    this.status = this.isConfigured() ? 'active' : 'unconfigured';
  }

  isConfigured() {
    if (this.role === 'planner') return Boolean(this.handlers.plan);
    if (this.role === 'executor') return Boolean(this.handlers.step || this.handlers.task);
    if (this.role === 'critic') return Boolean(this.handlers.synthesis);
    return Boolean(this.handlers.task);
  }

  getStatus() {
    return this.isConfigured() ? 'active' : 'unconfigured';
  }

  async handleTask(task) {
    if (!this.handlers.task) {
      throw new Error(`Agent ${this.id} is not executable: no task handler is configured`);
    }

    const result = await this.handlers.task(task);
    this.tasksProcessed += 1;
    this.lastHeartbeat = new Date().toISOString();
    this.emit('event', {
      id: uuidv4(),
      type: 'task.completed',
      timestamp: this.lastHeartbeat,
      payload: Buffer.from(JSON.stringify({ taskId: task.taskId, taskType: task.taskType })),
    });
    return Buffer.isBuffer(result) ? result : Buffer.from(JSON.stringify(result));
  }

  async handleMessage(envelope) {
    return this.handleTask({
      taskId: envelope.id,
      taskType: envelope.message?.type || this.role,
      payload: Buffer.from(JSON.stringify(envelope.message || {})),
      requestId: envelope.sessionId,
    });
  }

  async createPlan(task, context = {}) {
    if (!this.handlers.plan) {
      throw new Error(`Agent ${this.id} cannot plan: no plan handler is configured`);
    }
    return this.handlers.plan(task, context);
  }

  async executeStep(step, context = {}) {
    if (!this.handlers.step) {
      throw new Error(`Agent ${this.id} cannot execute: no step handler is configured`);
    }
    const result = await this.handlers.step(step, context);
    this.tasksProcessed += 1;
    this.lastHeartbeat = new Date().toISOString();
    return result;
  }

  async synthesize(outputs, plan, context = {}) {
    if (!this.handlers.synthesis) {
      throw new Error(`Agent ${this.id} cannot synthesize: no synthesis handler is configured`);
    }
    return this.handlers.synthesis(outputs, plan, context);
  }
}

module.exports = RuntimeAgent;
