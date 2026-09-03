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
    this.startTime = Date.now();
    this.tasksProcessed = 0;
    this.lastHeartbeat = new Date().toISOString();
    this.status = 'active';
  }

  getStatus() {
    return this.status;
  }

  async handleTask({ taskId, taskType, payload, requestId }) {
    this.tasksProcessed += 1;
    this.lastHeartbeat = new Date().toISOString();
    const body = Buffer.isBuffer(payload)
      ? payload.toString('utf8')
      : (payload || '');
    const result = {
      agentId: this.id,
      role: this.role,
      taskId,
      taskType: taskType || this.role,
      requestId,
      echo: body.slice(0, 2048),
      sealed: true,
    };
    this.emit('event', {
      id: uuidv4(),
      type: 'task.completed',
      timestamp: this.lastHeartbeat,
      payload: Buffer.from(JSON.stringify({ taskId, taskType })),
    });
    return Buffer.from(JSON.stringify(result));
  }

  async handleMessage(envelope) {
    return this.handleTask({
      taskId: envelope.id,
      taskType: envelope.message?.type || this.role,
      payload: Buffer.from(JSON.stringify(envelope.message || {})),
      requestId: envelope.sessionId,
    });
  }

  async createPlan(task) {
    return {
      task,
      agentId: this.id,
      steps: [
        {
          id: 'step-1',
          agentId: 'execution-agent',
          action: 'execute',
          input: task,
        },
      ],
    };
  }

  async executeStep(step) {
    this.tasksProcessed += 1;
    return {
      stepId: step.id,
      agentId: this.id,
      ok: true,
    };
  }

  async synthesize(outputs, plan) {
    return {
      result: {
        agentId: this.id,
        steps: outputs.length,
        planSteps: plan?.steps?.length || 0,
      },
      critiques: [],
    };
  }
}

module.exports = RuntimeAgent;
