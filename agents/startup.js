#!/usr/bin/env node

/**
 * TREE OF LIFE - AUTONOMOUS AGENT SYSTEM
 * Startup Sequence Executor
 *
 * Phases:
 * 1. Load environment & configuration
 * 2. Connect to Kafka event bus (non-fatal if brokers are down)
 * 3. Initialize gRPC server (port 50051)
 * 4. Register RuntimeAgents (Planning, Execution, Reflexion)
 * 5. Start ReWOO executor
 *
 * Keep-alive: when run as main, the process stays up until SIGINT/SIGTERM.
 */

const path = require("path");
const EventEmitter = require("events");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const KafkaCoordinator = require("./event-bus/kafka-coordinator");
const gRPCGateway = require("./grpc-gateway");
const ReWOOExecutor = require("./orchestration/rewoo-executor");
const RuntimeAgent = require("./runtime-agent");

class StartupSequence extends EventEmitter {
  constructor() {
    super();
    this.phases = [];
    this.status = "initializing";
    this.startTime = Date.now();
    this.results = {};
    this.handles = {};
  }

  log(phase, message, type = "info") {
    const timestamp = new Date().toISOString();
    const prefix =
      {
        info: "🔄",
        success: "✅",
        error: "❌",
        warn: "⚠️",
        debug: "🔍",
      }[type] || "🔄";

    console.log(`${prefix} [${timestamp}] [${phase}] ${message}`);
    this.emit("log", { phase, message, type, timestamp });
  }

  async phase1_loadEnvironment() {
    this.log("PHASE 1", "Starting: Load environment & configuration", "info");

    const config = {
      kafka: {
        brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
        clientId: process.env.KAFKA_CLIENT_ID || "tree-of-life-orchestrator",
        connectionTimeout: parseInt(
          process.env.KAFKA_CONNECTION_TIMEOUT || "10000",
          10,
        ),
        requestTimeout: parseInt(
          process.env.KAFKA_REQUEST_TIMEOUT || "30000",
          10,
        ),
      },
      grpc: {
        host: process.env.GRPC_HOST || "0.0.0.0",
        port: parseInt(process.env.GRPC_PORT || "50051", 10),
        maxReceiveMessageLength: parseInt(
          process.env.GRPC_MAX_RECEIVE_MESSAGE_LENGTH || "4194304",
          10,
        ),
        maxSendMessageLength: parseInt(
          process.env.GRPC_MAX_SEND_MESSAGE_LENGTH || "4194304",
          10,
        ),
      },
      rewoo: {
        maxIterations: parseInt(process.env.REWOO_MAX_ITERATIONS || "3", 10),
        planningTimeout: parseInt(
          process.env.REWOO_PLANNING_TIMEOUT || "30000",
          10,
        ),
        executionTimeout: parseInt(
          process.env.REWOO_EXECUTION_TIMEOUT || "60000",
          10,
        ),
        synthesisTimeout: parseInt(
          process.env.REWOO_SYNTHESIS_TIMEOUT || "30000",
          10,
        ),
      },
      kafkaRequired: process.env.KAFKA_REQUIRED === "true",
      nodeEnv: process.env.NODE_ENV || "development",
      logLevel: process.env.LOG_LEVEL || "info",
    };

    this.log(
      "PHASE 1",
      `Kafka brokers: ${config.kafka.brokers.join(", ")}`,
      "debug",
    );
    this.log(
      "PHASE 1",
      `gRPC server: ${config.grpc.host}:${config.grpc.port}`,
      "debug",
    );
    this.log("PHASE 1", `Environment: ${config.nodeEnv}`, "debug");

    this.results.phase1 = {
      success: true,
      config,
      duration: Date.now() - this.startTime,
    };

    this.log("PHASE 1", "✅ Environment loaded successfully", "success");
    return config;
  }

  async phase2_connectKafka(config) {
    this.log("PHASE 2", "Starting: Connect to Kafka event bus", "info");

    try {
      const kafkaCoordinator = new KafkaCoordinator(config.kafka);
      await kafkaCoordinator.connect();

      const topics = [
        "task.planning",
        "task.execution",
        "task.synthesis",
        "agent.heartbeat",
        "system.error",
        "system.metrics",
      ];

      if (typeof kafkaCoordinator.createTopics === "function") {
        await kafkaCoordinator.createTopics(topics);
      }

      this.results.phase2 = {
        success: true,
        brokers: config.kafka.brokers,
        topicsCreated: topics.length,
        duration: Date.now() - this.startTime,
      };

      this.log("PHASE 2", "✅ Kafka event bus connected", "success");
      return kafkaCoordinator;
    } catch (error) {
      this.log("PHASE 2", `Kafka unavailable: ${error.message}`, "warn");
      this.results.phase2 = {
        success: false,
        skipped: !config.kafkaRequired,
        error: error.message,
        duration: Date.now() - this.startTime,
      };
      if (config.kafkaRequired) {
        throw error;
      }
      this.log(
        "PHASE 2",
        "Continuing without Kafka (KAFKA_REQUIRED!=true)",
        "warn",
      );
      return null;
    }
  }

  async phase3_initializeGRPC(config) {
    this.log("PHASE 3", "Starting: Initialize gRPC server", "info");

    const grpcGateway = new gRPCGateway(config.grpc);
    await grpcGateway.startServer();

    this.results.phase3 = {
      success: true,
      host: config.grpc.host,
      port: config.grpc.port,
      duration: Date.now() - this.startTime,
    };

    this.log("PHASE 3", "✅ gRPC server initialized", "success");
    return grpcGateway;
  }

  async phase4_registerAgents(grpcGateway, rewooExecutor) {
    this.log("PHASE 4", "Starting: Register agents", "info");

    const specs = [
      { id: "planning-agent", role: "planner", type: "Planning" },
      { id: "execution-agent", role: "executor", type: "Execution" },
      { id: "reflexion-agent", role: "critic", type: "Reflexion" },
    ];

    const agents = specs.map((spec) => new RuntimeAgent(spec));

    for (const agent of agents) {
      grpcGateway.registerAgent(agent.id, agent);
      rewooExecutor.registerAgent(agent.id, agent);
      this.log(
        "PHASE 4",
        `Registered ${agent.type} Agent (${agent.id})`,
        "debug",
      );
    }

    this.results.phase4 = {
      success: true,
      agentsRegistered: agents.length,
      agents: agents.map((a) => ({ id: a.id, type: a.type })),
      duration: Date.now() - this.startTime,
    };

    this.log("PHASE 4", `✅ ${agents.length} agents registered`, "success");
    return agents;
  }

  async phase5_startReWOO(rewooExecutor) {
    this.log("PHASE 5", "Starting: Start ReWOO orchestration executor", "info");

    const metrics = rewooExecutor.getMetrics();

    this.results.phase5 = {
      success: true,
      registeredAgents: metrics.registeredAgents,
      maxIterations: 3,
      duration: Date.now() - this.startTime,
    };

    this.log("PHASE 5", "✅ ReWOO executor started", "success");
    return rewooExecutor;
  }

  async execute() {
    console.log("\n");
    console.log("TREE OF LIFE — AUTONOMOUS AGENT SYSTEM STARTUP");
    console.log("canonical gRPC mesh 2026-09-03");
    console.log("\n");

    const phaseStartTime = Date.now();

    const config = await this.phase1_loadEnvironment();
    const kafkaCoordinator = await this.phase2_connectKafka(config);
    const grpcGateway = await this.phase3_initializeGRPC(config);
    const rewooExecutor = new ReWOOExecutor(config.rewoo);
    await this.phase4_registerAgents(grpcGateway, rewooExecutor);
    await this.phase5_startReWOO(rewooExecutor);

    const totalDuration = Date.now() - phaseStartTime;
    this.status = "ready";
    this.handles = { config, kafkaCoordinator, grpcGateway, rewooExecutor };

    console.log("\nSTARTUP COMPLETE");
    console.log(`duration_ms=${totalDuration}`);
    console.log(`grpc=${config.grpc.host}:${config.grpc.port}`);
    console.log(`kafka=${this.results.phase2.success ? "up" : "skipped"}`);
    console.log("agents=planning-agent,execution-agent,reflexion-agent");
    console.log("keep_alive=true (SIGINT/SIGTERM to stop)");
    console.log("\n");

    this.emit("startup:complete", {
      duration: totalDuration,
      results: this.results,
    });

    return {
      success: true,
      duration: totalDuration,
      kafkaCoordinator,
      grpcGateway,
      rewooExecutor,
      results: this.results,
    };
  }

  async shutdown() {
    if (
      this.handles.rewooExecutor &&
      typeof this.handles.rewooExecutor.destroy === "function"
    ) {
      this.handles.rewooExecutor.destroy();
    }
    if (this.handles.grpcGateway) {
      await this.handles.grpcGateway.shutdown();
    }
  }
}

if (require.main === module) {
  const startup = new StartupSequence();
  const keepAlive = process.env.GRPC_TEST_ONCE !== "true";

  startup
    .execute()
    .then(() => {
      if (!keepAlive) {
        return startup.shutdown().then(() => process.exit(0));
      }
      const stop = () => {
        startup.shutdown().finally(() => process.exit(0));
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    })
    .catch((error) => {
      console.error("Fatal startup error:", error);
      process.exit(1);
    });
}

module.exports = StartupSequence;
