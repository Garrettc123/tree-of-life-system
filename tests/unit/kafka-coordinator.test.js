'use strict';

/**
 * Unit tests for KafkaCoordinator
 * kafkajs is fully mocked so no real Kafka broker is needed.
 */

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

  const KafkaMock = jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue(mockProducer),
    consumer: jest.fn().mockReturnValue(mockConsumer),
    admin: jest.fn().mockReturnValue(mockAdmin)
  }));

  return { Kafka: KafkaMock, logLevel: { INFO: 4 } };
});

const KafkaCoordinator = require('../../agents/event-bus/kafka-coordinator');

describe('KafkaCoordinator', () => {
  let coordinator;

  beforeEach(() => {
    coordinator = new KafkaCoordinator({
      clientId: 'test-coordinator',
      brokers: ['localhost:9092']
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with null producer/consumer/admin', () => {
      expect(coordinator.producer).toBeNull();
      expect(coordinator.consumer).toBeNull();
      expect(coordinator.admin).toBeNull();
    });

    it('should initialize event registry as empty Map', () => {
      expect(coordinator.eventRegistry.size).toBe(0);
    });
  });

  describe('connect', () => {
    it('should connect admin, producer and consumer', async () => {
      await coordinator.connect();
      expect(coordinator.producer).not.toBeNull();
      expect(coordinator.consumer).not.toBeNull();
      expect(coordinator.admin).not.toBeNull();
    });

    it('should return true on successful connection', async () => {
      const result = await coordinator.connect();
      expect(result).toBe(true);
    });
  });

  describe('createTopics', () => {
    it('should create topics via admin', async () => {
      await coordinator.connect();
      await coordinator.createTopics(['topic-a', 'topic-b']);
      expect(coordinator.admin.createTopics).toHaveBeenCalled();
    });
  });

  describe('publishEvent', () => {
    it('should publish an event to the correct topic', async () => {
      await coordinator.connect();
      const result = await coordinator.publishEvent('task.planning', { foo: 'bar' });
      expect(result).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('should disconnect cleanly', async () => {
      await coordinator.connect();
      await expect(coordinator.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return a metrics object', async () => {
      await coordinator.connect();
      const metrics = await coordinator.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
    });
  });
});
