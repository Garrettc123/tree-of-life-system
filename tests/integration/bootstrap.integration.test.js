'use strict';

/**
 * Integration tests for the Bootstrap Orchestration lifecycle.
 * All infrastructure (Kafka, gRPC) is mocked so no live services are needed.
 */

// Mock kafkajs before requiring any agent modules
jest.mock('kafkajs', () => {
  const mockProducer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue([{ topicName: 'test', partition: 0 }])
  };
  const mockConsumer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined)
  };
  const mockAdmin = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    createTopics: jest.fn().mockResolvedValue(true),
    listTopics: jest.fn().mockResolvedValue([])
  };
  const Kafka = jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue(mockProducer),
    consumer: jest.fn().mockReturnValue(mockConsumer),
    admin: jest.fn().mockReturnValue(mockAdmin)
  }));
  return { Kafka, logLevel: { INFO: 4 } };
});

// Mock @grpc/grpc-js and @grpc/proto-loader
jest.mock('@grpc/grpc-js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    addService: jest.fn(),
    bindAsync: jest.fn((addr, creds, cb) => cb(null, 50051)),
    start: jest.fn(),
    tryShutdown: jest.fn((cb) => cb(null))
  })),
  ServerCredentials: { createInsecure: jest.fn() },
  credentials: { createInsecure: jest.fn() },
  loadPackageDefinition: jest.fn().mockReturnValue({
    agentservice: {
      AgentService: Object.assign(
        jest.fn().mockImplementation(() => ({ close: jest.fn() })),
        { service: {} }
      )
    }
  })
}));

jest.mock('@grpc/proto-loader', () => ({
  loadSync: jest.fn().mockReturnValue({})
}));

const BootstrapOrchestrator = require('../../agents/bootstrap');

describe('Bootstrap Orchestrator Integration', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new BootstrapOrchestrator();
  });

  afterEach(async () => {
    if (orchestrator.isRunning) {
      await orchestrator.shutdown();
    }
    // Clean up any ReWOO cleanup intervals
    if (orchestrator.rewooExecutor && orchestrator.rewooExecutor.cleanupInterval) {
      clearInterval(orchestrator.rewooExecutor.cleanupInterval);
    }
  });

  describe('initialization', () => {
    it('should start with isRunning = false', () => {
      expect(orchestrator.isRunning).toBe(false);
    });

    it('should initialize successfully with mocked infrastructure', async () => {
      await orchestrator.initialize();
      expect(orchestrator.isRunning).toBe(true);
    });

    it('should register exactly 3 default agents after initialization', async () => {
      await orchestrator.initialize();
      expect(orchestrator.agents.size).toBe(3);
      expect(orchestrator.agents.has('planning-agent')).toBe(true);
      expect(orchestrator.agents.has('execution-agent')).toBe(true);
      expect(orchestrator.agents.has('reflexion-agent')).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should reflect not-running state before initialization', () => {
      const status = orchestrator.getStatus();
      expect(status.running).toBe(false);
    });

    it('should reflect running state after initialization', async () => {
      await orchestrator.initialize();
      const status = orchestrator.getStatus();
      expect(status.running).toBe(true);
      expect(status.agentsRegistered).toBe(3);
    });
  });

  describe('shutdown', () => {
    it('should shut down without throwing after initialization', async () => {
      await orchestrator.initialize();
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
      expect(orchestrator.isRunning).toBe(false);
    });
  });

  describe('executeAutonomousTask', () => {
    it('should throw when system is not running', async () => {
      await expect(
        orchestrator.executeAutonomousTask('test task')
      ).rejects.toThrow('Bootstrap orchestrator not running');
    });

    it('should return a result after initialization', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeAutonomousTask('test task', { taskId: 'int-test-1' });
      expect(result).toBeDefined();
    });
  });
});
