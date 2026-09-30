/**
 * Binds proto/rhns_mesh.proto AgentMesh in-process.
 * Transport stays gRPC-shaped. Application protocol stays MCP.
 * This file is the missing bind called out in CANONICAL_AUTONOMY.md.
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

class RhnsMeshGateway extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      ...config,
      host: config.host || '127.0.0.1',
      port: Number(config.port) || 50052,
      protoPath: config.protoPath || path.join(__dirname, '../../proto/rhns_mesh.proto'),
    };
    this.inflight = 0;
    this.version = '0.2.0-mars';
    this.server = null;
    this.serviceDef = null;
  }

  async loadProto() {
    const def = protoLoader.loadSync(this.config.protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(def);
    this.serviceDef = proto.garcar && proto.garcar.rhns && proto.garcar.rhns.v1;
    if (!this.serviceDef || !this.serviceDef.AgentMesh) {
      throw new Error(`AgentMesh missing from ${this.config.protoPath}`);
    }
  }

  proof(taskId, state) {
    return crypto.createHash('sha256').update(`${taskId}:${state}:${Date.now()}`).digest('hex');
  }

  dispatchImpl(envelope) {
    this.inflight += 1;
    try {
      const taskId = envelope.task_id || 'task-unknown';
      return {
        task_id: taskId,
        state: 'SEALED',
        proof_hash: this.proof(taskId, 'SEALED'),
        payload: envelope.payload || Buffer.alloc(0),
        reject_reason: '',
      };
    } finally {
      this.inflight = Math.max(0, this.inflight - 1);
    }
  }

  async startServer() {
    await this.loadProto();
    this.server = new grpc.Server();
    this.server.addService(this.serviceDef.AgentMesh.service, {
      dispatch: (call, cb) => cb(null, this.dispatchImpl(call.request)),
      heartbeat: (call, cb) =>
        cb(null, { ok: true, inflight: this.inflight, version: this.version }),
      cancel: (call, cb) =>
        cb(null, {
          task_id: call.request.task_id,
          state: 'REJECTED',
          proof_hash: this.proof(call.request.task_id, 'REJECTED'),
          payload: Buffer.alloc(0),
          reject_reason: call.request.reason || 'cancel',
        }),
      follow: (call) => call.end(),
      session: (call) => call.end(),
    });

    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        `${this.config.host}:${this.config.port}`,
        grpc.ServerCredentials.createInsecure(),
        (error) => {
          if (error) return reject(error);
          this.server.start();
          this.emit('mesh:started', { port: this.config.port });
          resolve();
        }
      );
    });
  }

  async shutdown() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.tryShutdown(() => resolve());
    });
  }
}

module.exports = RhnsMeshGateway;
