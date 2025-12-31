#!/usr/bin/env node

/**
 * TREE OF LIFE - AUTONOMOUS AGENT SYSTEM
 * Startup Sequence Executor
 * 
 * Executes all 5 initialization phases:
 * 1. Load environment & configuration
 * 2. Connect to Kafka event bus
 * 3. Initialize gRPC server (port 50051)
 * 4. Register agents (Planning, Execution, Reflexion)
 * 5. Start ReWOO executor
 * 
 * Status tracking and phase completion callbacks
 */

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const KafkaCoordinator = require('./event-bus/kafka-coordinator');
const gRPCGateway = require('./grpc-gateway');
const ReWOOExecutor = require('./orchestration/rewoo-executor');
const BootstrapOrchestrator = require('./bootstrap');

class StartupSequence extends EventEmitter {
  constructor() {
    super();
    this.phases = [];
    this.status = 'initializing';
    this.startTime = Date.now();
    this.results = {};
  }

  log(phase, message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '🔄',
      success: '✅',
      error: '❌',
      warn: '⚠️',
      debug: '🔍',
    }[type] || '🔄';

    console.log(`${prefix} [${timestamp}] [${phase}] ${message}`);
    this.emit('log', { phase, message, type, timestamp });
  }

  async phase1_loadEnvironment() {
    this.log('PHASE 1', 'Starting: Load environment & configuration', 'info');

    try {
      const config = {
        kafka: {
          brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
          clientId: process.env.KAFKA_CLIENT_ID || 'tree-of-life-orchestrator',
          connectionTimeout: parseInt(process.env.KAFKA_CONNECTION_TIMEOUT || '10000'),
          requestTimeout: parseInt(process.env.KAFKA_REQUEST_TIMEOUT || '30000'),
        },
        grpc: {
          host: process.env.GRPC_HOST || '0.0.0.0',
          port: parseInt(process.env.GRPC_PORT || '50051'),
          maxReceiveMessageLength: parseInt(process.env.GRPC_MAX_RECEIVE_MESSAGE_LENGTH || '4194304'),
          maxSendMessageLength: parseInt(process.env.GRPC_MAX_SEND_MESSAGE_LENGTH || '4194304'),
        },
        rewoo: {
          maxIterations: parseInt(process.env.REWOO_MAX_ITERATIONS || '3'),
          planningTimeout: parseInt(process.env.REWOO_PLANNING_TIMEOUT || '30000'),
          executionTimeout: parseInt(process.env.REWOO_EXECUTION_TIMEOUT || '60000'),
          synthesisTimeout: parseInt(process.env.REWOO_SYNTHESIS_TIMEOUT || '30000'),
        },
        nodeEnv: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info',
      };

      this.log('PHASE 1', `Kafka brokers: ${config.kafka.brokers.join(', ')}`, 'debug');
      this.log('PHASE 1', `gRPC server: ${config.grpc.host}:${config.grpc.port}`, 'debug');
      this.log('PHASE 1', `Environment: ${config.nodeEnv}`, 'debug');

      this.results.phase1 = {
        success: true,
        config,
        duration: Date.now() - this.startTime,
      };

      this.log('PHASE 1', '✅ Environment loaded successfully', 'success');
      return config;
    } catch (error) {
      this.log('PHASE 1', `❌ Failed to load environment: ${error.message}`, 'error');
      this.results.phase1 = {
        success: false,
        error: error.message,
        duration: Date.now() - this.startTime,
      };
      throw error;
    }
  }

  async phase2_connectKafka(config) {
    this.log('PHASE 2', 'Starting: Connect to Kafka event bus', 'info');

    try {
      const kafkaCoordinator = new KafkaCoordinator(config.kafka);
      await kafkaCoordinator.connect();

      this.log('PHASE 2', `Connected to Kafka brokers: ${config.kafka.brokers.join(', ')}`, 'debug');

      // Create topics
      const topics = [
        'task.planning',
        'task.execution',
        'task.synthesis',
        'agent.heartbeat',
        'system.error',
        'system.metrics',
      ];

      await kafkaCoordinator.createTopics(topics);
      this.log('PHASE 2', `Created ${topics.length} event topics`, 'debug');

      this.results.phase2 = {
        success: true,
        brokers: config.kafka.brokers,
        topicsCreated: topics.length,
        duration: Date.now() - this.startTime,
      };

      this.log('PHASE 2', '✅ Kafka event bus connected', 'success');
      return kafkaCoordinator;
    } catch (error) {
      this.log('PHASE 2', `❌ Failed to connect Kafka: ${error.message}`, 'error');
      this.results.phase2 = {
        success: false,
        error: error.message,
        duration: Date.now() - this.startTime,
      };
      throw error;
    }
  }

  async phase3_initializeGRPC(config) {
    this.log('PHASE 3', 'Starting: Initialize gRPC server', 'info');

    try {
      const grpcGateway = new gRPCGateway(config.grpc);
      await grpcGateway.startServer();

      this.log('PHASE 3', `gRPC server running on ${config.grpc.host}:${config.grpc.port}`, 'debug');
      this.log('PHASE 3', `Max message size: ${(config.grpc.maxReceiveMessageLength / 1024 / 1024).toFixed(2)}MB`, 'debug');

      this.results.phase3 = {
        success: true,
        host: config.grpc.host,
        port: config.grpc.port,
        duration: Date.now() - this.startTime,
      };

      this.log('PHASE 3', '✅ gRPC server initialized', 'success');
      return grpcGateway;
    } catch (error) {
      this.log('PHASE 3', `❌ Failed to initialize gRPC: ${error.message}`, 'error');
      this.results.phase3 = {
        success: false,
        error: error.message,
        duration: Date.now() - this.startTime,
      };
      throw error;
    }
  }

  async phase4_registerAgents(grpcGateway, rewooExecutor) {
    this.log('PHASE 4', 'Starting: Register agents', 'info');

    try {
      const agents = [
        {
          id: 'planning-agent',
          role: 'planner',
          type: 'Planning',
        },
        {
          id: 'execution-agent',
          role: 'executor',
          type: 'Execution',
        },
        {
          id: 'reflexion-agent',
          role: 'critic',
          type: 'Reflexion',
        },
      ];

      for (const agent of agents) {
        grpcGateway.registerAgent(agent.id, agent);
        rewooExecutor.registerAgent(agent.id, agent);
        this.log('PHASE 4', `Registered ${agent.type} Agent (${agent.id})`, 'debug');
      }

      this.results.phase4 = {
        success: true,
        agentsRegistered: agents.length,
        agents: agents.map(a => ({ id: a.id, type: a.type })),
        duration: Date.now() - this.startTime,
      };

      this.log('PHASE 4', `✅ ${agents.length} agents registered`, 'success');
      return agents;
    } catch (error) {
      this.log('PHASE 4', `❌ Failed to register agents: ${error.message}`, 'error');
      this.results.phase4 = {
        success: false,
        error: error.message,
        duration: Date.now() - this.startTime,
      };
      throw error;
    }
  }

  async phase5_startReWOO(rewooExecutor) {
    this.log('PHASE 5', 'Starting: Start ReWOO orchestration executor', 'info');

    try {
      const metrics = rewooExecutor.getMetrics();

      this.log('PHASE 5', `ReWOO executor ready`, 'debug');
      this.log('PHASE 5', `Registered agents: ${metrics.registeredAgents}`, 'debug');
      this.log('PHASE 5', `Max iterations: 3, Timeouts: Planning 30s, Execution 60s, Synthesis 30s`, 'debug');

      this.results.phase5 = {
        success: true,
        registeredAgents: metrics.registeredAgents,
        maxIterations: 3,
        duration: Date.now() - this.startTime,
      };

      this.log('PHASE 5', '✅ ReWOO executor started', 'success');
      return rewooExecutor;
    } catch (error) {
      this.log('PHASE 5', `❌ Failed to start ReWOO: ${error.message}`, 'error');
      this.results.phase5 = {
        success: false,
        error: error.message,
        duration: Date.now() - this.startTime,
      };
      throw error;
    }
  }

  async execute() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                ║');
    console.log('║     🚀 TREE OF LIFE - AUTONOMOUS AGENT SYSTEM STARTUP 🚀      ║');
    console.log('║                                                                ║');
    console.log('║  Initializing enterprise infrastructure...                     ║');
    console.log('║                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    try {
      const phaseStartTime = Date.now();

      // Phase 1
      const config = await this.phase1_loadEnvironment();

      // Phase 2
      const kafkaCoordinator = await this.phase2_connectKafka(config);

      // Phase 3
      const grpcGateway = await this.phase3_initializeGRPC(config);

      // Phase 4 & 5 require ReWOO executor
      const rewooExecutor = new ReWOOExecutor(config.rewoo);

      // Phase 4
      await this.phase4_registerAgents(grpcGateway, rewooExecutor);

      // Phase 5
      await this.phase5_startReWOO(rewooExecutor);

      // Success!
      const totalDuration = Date.now() - phaseStartTime;
      this.status = 'ready';

      console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                ║');
      console.log('║        ✅ STARTUP SEQUENCE COMPLETE - SYSTEM READY ✅           ║');
      console.log('║                                                                ║');
      console.log(`║  Total initialization time: ${totalDuration}ms                       ║`);
      console.log('║                                                                ║');
      console.log('║  Status:                                                       ║');
      console.log('║    ✅ Phase 1: Environment & configuration loaded              ║');
      console.log('║    ✅ Phase 2: Kafka event bus connected                       ║');
      console.log('║    ✅ Phase 3: gRPC server initialized (port 50051)            ║');
      console.log('║    ✅ Phase 4: 3 agents registered                             ║');
      console.log('║    ✅ Phase 5: ReWOO executor started                          ║');
      console.log('║                                                                ║');
      console.log('║  System is now ready for autonomous execution!                 ║');
      console.log('║                                                                ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log('\n');

      this.emit('startup:complete', {
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
    } catch (error) {
      console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                ║');
      console.log('║        ❌ STARTUP SEQUENCE FAILED - SYSTEM NOT READY ❌         ║');
      console.log('║                                                                ║');
      console.log(`║  Error: ${error.message.padEnd(50)}║`);
      console.log('║                                                                ║');
      console.log('║  Results:                                                      ║');
      Object.entries(this.results).forEach(([phase, result]) => {
        const status = result.success ? '✅' : '❌';
        console.log(`║    ${status} ${phase}: ${result.success ? 'Completed' : 'Failed'}`.padEnd(65) + '║');
      });
      console.log('║                                                                ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log('\n');

      this.status = 'failed';
      this.emit('startup:failed', { error });
      throw error;
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const startup = new StartupSequence();

  startup
    .execute()
    .then(() => {
      console.log('✅ System ready for autonomous execution\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Fatal startup error:', error);
      process.exit(1);
    });
}

module.exports = StartupSequence;
