/**
 * gRPC Gateway for Inter-Agent Communication
 *
 * Contract: proto/agent-service.proto (package agentservice).
 * Insecure credentials are intentional for local/dev. Do not claim mTLS.
 */

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const EventEmitter = require("events");
const { v4: uuidv4 } = require("uuid");
const RuntimeAgent = require("./runtime-agent");

class gRPCGateway extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      host: config.host || "localhost",
      port: config.port || 50051,
      protoPath:
        config.protoPath ||
        path.join(__dirname, "../proto/agent-service.proto"),
      maxReceiveMessageLength:
        config.maxReceiveMessageLength || 4 * 1024 * 1024,
      maxSendMessageLength: config.maxSendMessageLength || 4 * 1024 * 1024,
      keepaliveTime: config.keepaliveTime || 30000,
      keepaliveTimeout: config.keepaliveTimeout || 10000,
      ...config,
    };

    this.server = null;
    this.serviceDef = null;
    this.agents = new Map();
    this.connections = new Map();
    this.metrics = {
      requestsProcessed: 0,
      errorsEncountered: 0,
      averageLatency: 0,
      latencyHistory: [],
    };
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
    if (!this.serviceDef || !this.serviceDef.AgentService) {
      throw new Error(`AgentService missing from ${this.config.protoPath}`);
    }
    console.log("[gRPCGateway] Proto loaded from:", this.config.protoPath);
  }

  wrapAgent(agentId, agent) {
    if (!agent) {
      return new RuntimeAgent({ id: agentId });
    }
    if (typeof agent.handleTask === "function") {
      if (!agent.startTime) agent.startTime = Date.now();
      if (typeof agent.tasksProcessed !== "number") agent.tasksProcessed = 0;
      return agent;
    }
    const runtime = new RuntimeAgent({
      id: agentId || agent.id,
      role: agent.role,
      type: agent.type,
      capabilities: agent.capabilities,
    });
    return runtime;
  }

  async startServer() {
    try {
      await this.loadProto();

      this.server = new grpc.Server({
        "grpc.max_receive_message_length": this.config.maxReceiveMessageLength,
        "grpc.max_send_message_length": this.config.maxSendMessageLength,
      });

      this.server.addService(this.serviceDef.AgentService.service, {
        executeTask: this.executeTask.bind(this),
        streamEvents: this.streamEvents.bind(this),
        getStatus: this.getStatus.bind(this),
      });

      return new Promise((resolve, reject) => {
        this.server.bindAsync(
          `${this.config.host}:${this.config.port}`,
          grpc.ServerCredentials.createInsecure(),
          (error) => {
            if (error) {
              console.error("[gRPCGateway] Bind error:", error.message);
              reject(error);
            } else {
              this.server.start();
              console.log(
                `[gRPCGateway] Server started on ${this.config.host}:${this.config.port}`,
              );
              this.emit("server:started");
              resolve();
            }
          },
        );
      });
    } catch (error) {
      console.error("[gRPCGateway] Start server error:", error.message);
      throw error;
    }
  }

  async createClientConnection(agentId, host, port) {
    try {
      if (!this.serviceDef) {
        await this.loadProto();
      }

      const credentials = grpc.ChannelCredentials.createInsecure();
      const channelOptions = {
        "grpc.max_receive_message_length": this.config.maxReceiveMessageLength,
        "grpc.max_send_message_length": this.config.maxSendMessageLength,
        "grpc.keepalive_time_ms": this.config.keepaliveTime,
        "grpc.keepalive_timeout_ms": this.config.keepaliveTimeout,
        "grpc.http2.max_pings_without_data": 0,
      };

      const client = new this.serviceDef.AgentService(
        `${host}:${port}`,
        credentials,
        channelOptions,
      );

      this.connections.set(agentId, {
        client,
        host,
        port,
        connected: true,
        createdAt: new Date().toISOString(),
      });

      console.log(
        `[gRPCGateway] Client connection created for ${agentId} at ${host}:${port}`,
      );
      this.emit("client:connected", { agentId, host, port });

      return client;
    } catch (error) {
      console.error("[gRPCGateway] Client connection error:", error.message);
      throw error;
    }
  }

  async executeTask(call, callback) {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      const { agentId, taskId, taskType, payload } = call.request;

      console.log(`[gRPCGateway] Executing task ${taskId} on agent ${agentId}`);

      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

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
        result: Buffer.isBuffer(result)
          ? result
          : Buffer.from(JSON.stringify(result)),
        latency,
      });

      this.emit("task:executed", { taskId, agentId, latency });
    } catch (error) {
      const latency = Date.now() - startTime;
      this.metrics.errorsEncountered++;

      console.error("[gRPCGateway] Task execution error:", error.message);

      callback({
        code: grpc.status.INTERNAL,
        message: error.message,
        details: JSON.stringify({ requestId, latency }),
      });

      this.emit("task:failed", { requestId, error: error.message });
    }
  }

  async streamEvents(call) {
    const { agentId, eventTypes } = call.request;
    const types = Array.isArray(eventTypes) ? eventTypes : [];

    console.log(`[gRPCGateway] Stream opened for agent ${agentId}`);

    const agent = this.agents.get(agentId);
    if (!agent || typeof agent.on !== "function") {
      call.emit("error", {
        code: grpc.status.NOT_FOUND,
        message: `Agent not found: ${agentId}`,
      });
      return;
    }

    const onEvent = (event) => {
      if (types.length === 0 || types.includes(event.type)) {
        call.write({
          eventId: event.id,
          type: event.type,
          timestamp: event.timestamp,
          payload: event.payload || Buffer.alloc(0),
        });
      }
    };

    agent.on("event", onEvent);

    const cleanup = () => {
      if (typeof agent.off === "function") {
        agent.off("event", onEvent);
      } else if (typeof agent.removeListener === "function") {
        agent.removeListener("event", onEvent);
      }
      console.log(`[gRPCGateway] Stream closed for agent ${agentId}`);
    };

    call.on("cancelled", cleanup);
    call.on("end", () => {
      cleanup();
      call.end();
    });
  }

  async getStatus(call, callback) {
    try {
      const { agentId } = call.request;
      const agent = this.agents.get(agentId);

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const status = {
        agentId,
        status:
          (typeof agent.getStatus === "function"
            ? agent.getStatus()
            : agent.status) || "active",
        uptime: Date.now() - (agent.startTime || Date.now()),
        tasksProcessed: agent.tasksProcessed || 0,
        lastHeartbeat: agent.lastHeartbeat || new Date().toISOString(),
      };

      callback(null, status);
    } catch (error) {
      callback({
        code: grpc.status.NOT_FOUND,
        message: error.message,
      });
    }
  }

  registerAgent(agentId, agent) {
    const wrapped = this.wrapAgent(agentId, agent);
    this.agents.set(agentId, wrapped);
    console.log(`[gRPCGateway] Registered agent: ${agentId}`);
    return wrapped;
  }

  recordMetric(latency) {
    this.metrics.requestsProcessed++;
    this.metrics.latencyHistory.push(latency);

    if (this.metrics.latencyHistory.length > 1000) {
      this.metrics.latencyHistory.shift();
    }

    const sum = this.metrics.latencyHistory.reduce((a, b) => a + b, 0);
    this.metrics.averageLatency = sum / this.metrics.latencyHistory.length;
  }

  async shutdown() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.tryShutdown((error) => {
          if (error) reject(error);
          else {
            console.log("[gRPCGateway] Server shutdown complete");
            this.emit("server:shutdown");
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
      successRate:
        this.metrics.requestsProcessed === 0
          ? 0
          : (this.metrics.requestsProcessed - this.metrics.errorsEncountered) /
            this.metrics.requestsProcessed,
      activeConnections: this.connections.size,
      registeredAgents: this.agents.size,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = gRPCGateway;
