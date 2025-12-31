/**
 * Bootstrap Orchestration Launcher
 * Initializes enterprise infrastructure: Kafka, gRPC, ReWOO orchestration
 * 
 * Execution flow:
 * 1. Load environment & configuration
 * 2. Connect to Kafka event bus
 * 3. Initialize gRPC server and client pools
 * 4. Register all agents (Planning, Execution, Reflexion)
 * 5. Start ReWOO orchestration executor
 * 6. Begin autonomous execution cycles
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const KafkaCoordinator = require('./event-bus/kafka-coordinator');
const gRPCGateway = require('./grpc-gateway');
const ReWOOExecutor = require('./orchestration/rewoo-executor');

class BootstrapOrchestrator {
  constructor() {
    this.config = {
      kafka: {
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
        clientId: 'tree-of-life-orchestrator',
      },
      grpc: {
        host: process.env.GRPC_HOST || 'localhost',
        port: parseInt(process.env.GRPC_PORT || '50051'),
      },
      executionConfig: {
        maxIterations: 3,
        planningTimeout: 30000,
        executionTimeout: 60000,
        synthesisTimeout: 30000,
      },
    };

    this.kafkaCoordinator = null;
    this.grpcGateway = null;
    this.rewooExecutor = null;
    this.agents = new Map();
    this.isRunning = false;
  }

  async initialize() {
    console.log('\n⏳ BOOTSTRAP PHASE 1: Initializing infrastructure...');

    try {
      // Step 1: Initialize Kafka Event Bus
      console.log('🔄 [1/5] Initializing Kafka Event Bus Coordinator...');
      this.kafkaCoordinator = new KafkaCoordinator(this.config.kafka);
      await this.kafkaCoordinator.connect();
      console.log('✅ Kafka connected and ready');

      // Create event topics
      await this.kafkaCoordinator.createTopics([
        'task.planning',
        'task.execution',
        'task.synthesis',
        'agent.heartbeat',
        'system.error',
        'system.metrics',
      ]);
      console.log('✅ Event topics created');

      // Step 2: Initialize gRPC Gateway
      console.log('🔄 [2/5] Initializing gRPC Inter-Agent Gateway...');
      this.grpcGateway = new gRPCGateway(this.config.grpc);
      await this.grpcGateway.startServer();
      console.log(`✅ gRPC server running on ${this.config.grpc.host}:${this.config.grpc.port}`);

      // Step 3: Initialize ReWOO Executor
      console.log('🔄 [3/5] Initializing ReWOO Orchestration Executor...');
      this.rewooExecutor = new ReWOOExecutor(this.config.executionConfig);
      console.log('✅ ReWOO executor initialized');

      // Step 4: Register Agents
      console.log('🔄 [4/5] Registering autonomous agents...');
      await this.registerAgents();
      console.log(`✅ ${this.agents.size} agents registered and ready`);

      // Step 5: Setup Event Subscriptions
      console.log('🔄 [5/5] Setting up event subscriptions and metrics...');
      await this.setupEventSubscriptions();
      console.log('✅ Event subscriptions active');

      this.isRunning = true;
      console.log('\n✅ BOOTSTRAP COMPLETE - System ready for autonomous execution');
      return true;
    } catch (error) {
      console.error('\n❌ BOOTSTRAP FAILED:', error.message);
      throw error;
    }
  }

  async registerAgents() {
    // Create mock agent instances for now
    // These will be replaced by actual agent implementations

    const planningAgent = {
      id: 'planning-agent',
      role: 'planner',
      createPlan: async (task, context) => {
        console.log(`[Planning] Analyzing task: ${task}`);
        return {
          taskId: context.taskId || 'task-' + Date.now(),
          steps: [
            {
              id: 'step-1',
              agentId: 'execution-agent',
              type: 'execute_subtask',
              description: 'Execute primary task',
            },
            {
              id: 'step-2',
              agentId: 'execution-agent',
              type: 'validate_output',
              description: 'Validate execution results',
            },
          ],
        };
      },
    };

    const executionAgent = {
      id: 'execution-agent',
      role: 'executor',
      executeStep: async (step, context) => {
        console.log(`[Execution] Running step: ${step.id}`);
        return {
          stepId: step.id,
          success: true,
          output: `Completed ${step.type}`,
          timestamp: new Date().toISOString(),
        };
      },
    };

    const reflexionAgent = {
      id: 'reflexion-agent',
      role: 'critic',
      synthesize: async (outputs, plan, context) => {
        console.log(`[Reflexion] Synthesizing ${outputs.length} outputs`);
        return {
          result: {
            success: true,
            summary: `Synthesis of ${outputs.length} steps completed`,
          },
          critiques: [
            {
              id: 'critique-1',
              severity: 'info',
              message: 'All steps executed successfully',
            },
          ],
        };
      },
    };

    // Register agents with ReWOO executor
    this.rewooExecutor.registerAgent('planning-agent', planningAgent);
    this.rewooExecutor.registerAgent('execution-agent', executionAgent);
    this.rewooExecutor.registerAgent('reflexion-agent', reflexionAgent);

    // Register agents with gRPC gateway
    this.grpcGateway.registerAgent('planning-agent', planningAgent);
    this.grpcGateway.registerAgent('execution-agent', executionAgent);
    this.grpcGateway.registerAgent('reflexion-agent', reflexionAgent);

    this.agents.set('planning-agent', planningAgent);
    this.agents.set('execution-agent', executionAgent);
    this.agents.set('reflexion-agent', reflexionAgent);
  }

  async setupEventSubscriptions() {
    // Subscribe to planning events
    await this.kafkaCoordinator.subscribeToEvents(
      'task.planning',
      async (event) => {
        console.log(`[Event] Planning task received: ${event.id}`);
        this.emit('task:planning', event);
      }
    );

    // Subscribe to metrics
    await this.kafkaCoordinator.subscribeToEvents(
      ['system.metrics', 'agent.heartbeat'],
      async (event) => {
        console.log(`[Metrics] ${event.type}: ${JSON.stringify(event.payload)}`);
      }
    );

    // Setup periodic metrics collection
    setInterval(() => {
      this.collectMetrics();
    }, 10000); // Every 10 seconds
  }

  async collectMetrics() {
    const metrics = {
      kafka: await this.kafkaCoordinator.getMetrics(),
      grpc: this.grpcGateway.getMetrics(),
      rewoo: this.rewooExecutor.getMetrics(),
      timestamp: new Date().toISOString(),
    };

    await this.kafkaCoordinator.publishEvent('system.metrics', metrics, {
      source: 'bootstrap-orchestrator',
    });
  }

  async executeAutonomousTask(taskDescription, context = {}) {
    if (!this.isRunning) {
      throw new Error('Bootstrap orchestrator not running');
    }

    console.log(`\n🚀 EXECUTING AUTONOMOUS TASK: ${taskDescription}`);

    try {
      // Publish task to planning event
      await this.kafkaCoordinator.publishEvent('task.planning', {
        description: taskDescription,
        context,
      });

      // Execute via ReWOO orchestrator
      const result = await this.rewooExecutor.execute(taskDescription, context);

      console.log(`✅ Task execution completed:`, result.stages);

      return result;
    } catch (error) {
      console.error('❌ Task execution failed:', error.message);
      throw error;
    }
  }

  async shutdown() {
    console.log('\n⏸️  Shutting down bootstrap orchestrator...');

    try {
      if (this.kafkaCoordinator) {
        await this.kafkaCoordinator.disconnect();
      }
      if (this.grpcGateway) {
        await this.grpcGateway.shutdown();
      }

      this.isRunning = false;
      console.log('✅ Shutdown complete');
    } catch (error) {
      console.error('❌ Shutdown error:', error.message);
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      kafka: this.kafkaCoordinator ? 'connected' : 'disconnected',
      grpc: this.grpcGateway ? 'running' : 'stopped',
      rewoo: this.rewooExecutor ? 'ready' : 'not initialized',
      agentsRegistered: this.agents.size,
      timestamp: new Date().toISOString(),
    };
  }
}

// Main execution
if (require.main === module) {
  const orchestrator = new BootstrapOrchestrator();

  orchestrator
    .initialize()
    .then(() => {
      console.log('\n🎯 READY FOR AUTONOMOUS EXECUTION');
      console.log('\nBootstrap status:', orchestrator.getStatus());

      // Example autonomous task
      return orchestrator.executeAutonomousTask('Test autonomous execution cycle', {
        taskId: 'test-task-1',
        mode: 'autonomous',
      });
    })
    .then(() => {
      console.log('\n✅ Autonomous execution test passed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

module.exports = BootstrapOrchestrator;
