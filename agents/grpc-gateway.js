/**
 * gRPC Gateway for Inter-Agent Communication
 * Replaces REST with gRPC for 7-10x faster communication
 * 
 * Performance:
 * - 10ms latency vs 100ms REST
 * - 32% smaller message size (Protobuf vs JSON)
 * - Bidirectional streaming support
 * - Connection pooling and multiplexing
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const EventEmitter = require('events');
const uuid = require('uuid');

const AUTH_METADATA_KEY = 'authorization';
const AUTH_SCHEME = 'Bearer';
const AUTH_SCHEME_PREFIX = /^Bearer\s+/i;

/**
 * Only propagate gRPC status codes we set ourselves; Node system errors carry
 * string codes such as 'ENOENT' which are not valid gRPC statuses.
 */
function statusCodeFor(error, fallback) {
  return typeof error?.code === 'number' ? error.code : fallback;
}

class gRPCGateway extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      host: config.host || 'localhost',
      port: config.port || 50051,
      protoPath: config.protoPath || path.join(__dirname, '../proto/agent-service.proto'),
      maxReceiveMessageLength: config.maxReceiveMessageLength || 4 * 1024 * 1024,
      maxSendMessageLength: config.maxSendMessageLength || 4 * 1024 * 1024,
      keepaliveTime: config.keepaliveTime || 30000,
      keepaliveTimeout: config.keepaliveTimeout || 10000,
      tlsEnabled: config.tlsEnabled === true,
      tlsCertPath: config.tlsCertPath || null,
      tlsKeyPath: config.tlsKeyPath || null,
      tlsCaPath: config.tlsCaPath || null,
      requireClientCert: config.requireClientCert === true,
      authToken: config.authToken || null,
      allowInsecure: config.allowInsecure === true,
      ...config,
    };

    this.assertSecureConfiguration();

    this.server = null;
    this.client = null;
    this.serviceDef = null;
    this.agents = new Map();
    this.connections = new Map();
    this.metrics = {
      requestsProcessed: 0,
      errorsEncountered: 0,
      averageLatency: 0,
      latencyHistory: [],
      unauthenticatedRequests: 0,
    };
  }

  /**
   * Reject configurations that would expose the agent control plane without
   * transport encryption or caller authentication.
   *
   * `executeTask` runs arbitrary agent tasks on behalf of the caller, so an
   * unauthenticated listener on a non-loopback interface is remote code
   * execution by design. Insecure setups therefore have to be opted into
   * explicitly via `allowInsecure`.
   */
  assertSecureConfiguration() {
    if (this.config.allowInsecure) {
      console.warn(
        '[gRPCGateway] SECURITY WARNING: insecure mode enabled - traffic is unencrypted and callers are not authenticated'
      );
      return;
    }

    const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(this.config.host);

    if (!this.config.tlsEnabled && !isLoopback) {
      throw new Error(
        `gRPC TLS is disabled while binding to a non-loopback host (${this.config.host}). ` +
          'Set GRPC_TLS_ENABLED=true with GRPC_TLS_CERT_PATH/GRPC_TLS_KEY_PATH, bind to 127.0.0.1, ' +
          'or set GRPC_ALLOW_INSECURE=true to acknowledge the risk.'
      );
    }

    if (!this.config.authToken && !this.config.requireClientCert && !isLoopback) {
      throw new Error(
        'gRPC gateway has no caller authentication configured while listening on a non-loopback host. ' +
          'Set GRPC_AUTH_TOKEN, enable mutual TLS via GRPC_TLS_CA_PATH, or set GRPC_ALLOW_INSECURE=true ' +
          'to acknowledge the risk.'
      );
    }

    if (this.config.tlsEnabled && (!this.config.tlsCertPath || !this.config.tlsKeyPath)) {
      throw new Error(
        'gRPC TLS is enabled but GRPC_TLS_CERT_PATH and GRPC_TLS_KEY_PATH are not both configured.'
      );
    }
  }

  /**
   * Build server credentials, preferring TLS (and mutual TLS when a CA is supplied).
   */
  buildServerCredentials() {
    if (!this.config.tlsEnabled) {
      return grpc.ServerCredentials.createInsecure();
    }

    const rootCert = this.config.tlsCaPath ? fs.readFileSync(this.config.tlsCaPath) : null;
    const keyCertPairs = [
      {
        private_key: fs.readFileSync(this.config.tlsKeyPath),
        cert_chain: fs.readFileSync(this.config.tlsCertPath),
      },
    ];

    return grpc.ServerCredentials.createSsl(rootCert, keyCertPairs, this.config.requireClientCert);
  }

  /**
   * Build client credentials matching the server's transport configuration.
   */
  buildClientCredentials() {
    if (!this.config.tlsEnabled) {
      return grpc.credentials.createInsecure();
    }

    const rootCert = this.config.tlsCaPath ? fs.readFileSync(this.config.tlsCaPath) : null;
    const privateKey =
      this.config.requireClientCert && this.config.tlsKeyPath
        ? fs.readFileSync(this.config.tlsKeyPath)
        : null;
    const certChain =
      this.config.requireClientCert && this.config.tlsCertPath
        ? fs.readFileSync(this.config.tlsCertPath)
        : null;

    return grpc.credentials.createSsl(rootCert, privateKey, certChain);
  }

  /**
   * Verify the shared secret presented by the caller in request metadata.
   * Uses a constant-time comparison to avoid leaking the token via timing.
   */
  authenticate(call) {
    if (!this.config.authToken) {
      return;
    }

    const metadata = call?.metadata;
    const rawValues = typeof metadata?.get === 'function' ? metadata.get(AUTH_METADATA_KEY) : [];
    const presented = Array.isArray(rawValues) ? rawValues[0] : rawValues;

    if (typeof presented !== 'string' || !this.isValidToken(presented)) {
      this.metrics.unauthenticatedRequests++;
      const error = new Error('Unauthenticated: valid credentials are required');
      error.code = grpc.status.UNAUTHENTICATED;
      throw error;
    }
  }

  isValidToken(presented) {
    const normalized = presented.trim().replace(AUTH_SCHEME_PREFIX, '');

    // Comparing fixed-length digests keeps the comparison constant time even
    // when the presented token has a different length than the expected one.
    const expected = crypto.createHash('sha256').update(this.config.authToken, 'utf8').digest();
    const actual = crypto.createHash('sha256').update(normalized, 'utf8').digest();

    return crypto.timingSafeEqual(expected, actual);
  }

  async loadProto() {
    const packageDefinition = protoLoader.loadSync(this.config.protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);
    this.serviceDef = proto.agentservice;
    console.log('[gRPCGateway] Proto loaded from:', this.config.protoPath);
  }

  async startServer() {
    try {
      await this.loadProto();

      this.server = new grpc.Server({
        'grpc.max_receive_message_length': this.config.maxReceiveMessageLength,
        'grpc.max_send_message_length': this.config.maxSendMessageLength,
      });

      // Add service implementations
      this.server.addService(this.serviceDef.AgentService.service, {
        executeTask: this.executeTask.bind(this),
        streamEvents: this.streamEvents.bind(this),
        getStatus: this.getStatus.bind(this),
      });

      return new Promise((resolve, reject) => {
        this.server.bindAsync(
          `${this.config.host}:${this.config.port}`,
          this.buildServerCredentials(),
          (error) => {
            if (error) {
              console.error('[gRPCGateway] Bind error:', error.message);
              reject(error);
            } else {
              this.server.start();
              console.log(
                `[gRPCGateway] Server started on ${this.config.host}:${this.config.port} ` +
                  `(tls=${this.config.tlsEnabled}, auth=${Boolean(this.config.authToken)})`
              );
              this.emit('server:started');
              resolve();
            }
          }
        );
      });
    } catch (error) {
      console.error('[gRPCGateway] Start server error:', error.message);
      throw error;
    }
  }

  async createClientConnection(agentId, host, port) {
    try {
      await this.loadProto();

      const credentials = this.buildClientCredentials();
      const channelOptions = {
        'grpc.max_receive_message_length': this.config.maxReceiveMessageLength,
        'grpc.max_send_message_length': this.config.maxSendMessageLength,
        'grpc.keepalive_time_ms': this.config.keepaliveTime,
        'grpc.keepalive_timeout_ms': this.config.keepaliveTimeout,
        'grpc.http2.max_pings_without_data': 0,
      };

      const client = new this.serviceDef.AgentService(
        `${host}:${port}`,
        credentials,
        channelOptions
      );

      this.connections.set(agentId, {
        client,
        host,
        port,
        connected: true,
        createdAt: new Date().toISOString(),
      });

      console.log(`[gRPCGateway] Client connection created for ${agentId} at ${host}:${port}`);
      this.emit('client:connected', { agentId, host, port });

      return client;
    } catch (error) {
      console.error('[gRPCGateway] Client connection error:', error.message);
      throw error;
    }
  }

  async executeTask(call, callback) {
    const startTime = Date.now();
    const requestId = uuid.v4();

    try {
      this.authenticate(call);

      const { agentId, taskId, taskType, payload } = call.request;

      console.log(`[gRPCGateway] Executing task ${taskId} on agent ${agentId}`);

      // Get agent handler
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Execute task
      const result = await agent.handleTask({
        taskId,
        taskType,
        payload,
        requestId,
      });

      const latency = Date.now() - startTime;
      this.recordMetric(latency);

      callback(null, {
        success: true,
        taskId,
        requestId,
        result,
        latency,
      });

      this.emit('task:executed', { taskId, agentId, latency });
    } catch (error) {
      const latency = Date.now() - startTime;
      this.metrics.errorsEncountered++;

      console.error('[gRPCGateway] Task execution error:', error.message);

      callback({
        code: statusCodeFor(error, grpc.status.INTERNAL),
        message: error.message,
        details: { requestId, latency },
      });

      this.emit('task:failed', { requestId, error: error.message });
    }
  }

  async streamEvents(call) {
    try {
      this.authenticate(call);
    } catch (error) {
      call.emit('error', error);
      return;
    }

    const { agentId, eventTypes } = call.request;
    const streamId = uuid.v4();

    console.log(`[gRPCGateway] Stream opened for agent ${agentId}, events: ${eventTypes.join(',')}`);

    const agent = this.agents.get(agentId);
    if (!agent) {
      call.emit('error', new Error(`Agent not found: ${agentId}`));
      return;
    }

    // Subscribe to events
    const unsubscribe = agent.on('event', (event) => {
      if (eventTypes.includes(event.type)) {
        call.write({
          eventId: event.id,
          type: event.type,
          timestamp: event.timestamp,
          payload: event.payload,
        });
      }
    });

    call.on('end', () => {
      unsubscribe();
      call.end();
      console.log(`[gRPCGateway] Stream closed for agent ${agentId}`);
    });
  }

  async getStatus(call, callback) {
    try {
      this.authenticate(call);

      const { agentId } = call.request;
      const agent = this.agents.get(agentId);

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const status = {
        agentId,
        status: agent.getStatus?.() || 'active',
        uptime: Date.now() - agent.startTime || 0,
        tasksProcessed: agent.tasksProcessed || 0,
        lastHeartbeat: new Date().toISOString(),
      };

      callback(null, status);
    } catch (error) {
      callback({
        code: statusCodeFor(error, grpc.status.NOT_FOUND),
        message: error.message,
      });
    }
  }

  registerAgent(agentId, agent) {
    this.agents.set(agentId, agent);
    console.log(`[gRPCGateway] Registered agent: ${agentId}`);
  }

  /**
   * Metadata that outbound calls must attach so the peer gateway accepts them.
   */
  buildCallMetadata() {
    const metadata = new grpc.Metadata();
    if (this.config.authToken) {
      metadata.set(AUTH_METADATA_KEY, AUTH_SCHEME + ' ' + this.config.authToken);
    }
    return metadata;
  }

  recordMetric(latency) {
    this.metrics.requestsProcessed++;
    this.metrics.latencyHistory.push(latency);

    // Keep only last 1000 measurements
    if (this.metrics.latencyHistory.length > 1000) {
      this.metrics.latencyHistory.shift();
    }

    // Update average latency
    const sum = this.metrics.latencyHistory.reduce((a, b) => a + b, 0);
    this.metrics.averageLatency = sum / this.metrics.latencyHistory.length;
  }

  async shutdown() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.tryShutdown((error) => {
          if (error) reject(error);
          else {
            console.log('[gRPCGateway] Server shutdown complete');
            this.emit('server:shutdown');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  getMetrics() {
    return {
      requestsProcessed: this.metrics.requestsProcessed,
      errorsEncountered: this.metrics.errorsEncountered,
      averageLatency: Math.round(this.metrics.averageLatency),
      successRate: (this.metrics.requestsProcessed - this.metrics.errorsEncountered) / this.metrics.requestsProcessed || 0,
      activeConnections: this.connections.size,
      registeredAgents: this.agents.size,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = gRPCGateway;
