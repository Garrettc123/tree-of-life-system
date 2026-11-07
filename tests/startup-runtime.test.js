'use strict';

const http = require('http');
const StartupSequence = require('../agents/startup');
const KafkaCoordinator = require('../agents/event-bus/kafka-coordinator');

function readJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 2000 }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('health timeout')); });
  });
}

describe('real worker startup and shutdown', () => {
  let saved;
  let runtime;
  const keys = ['PORT', 'HEALTH_HOST', 'GRPC_HOST', 'GRPC_PORT', 'GRPC_ALLOW_INSECURE_REMOTE',
    'KAFKA_REQUIRED', 'KAFKA_BROKERS', 'RHNS_DURABLE_STORE_ENABLED', 'GARCAR_WORKER_DISPATCH_SECRET'];

  beforeEach(() => {
    saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    process.env.PORT = '0';
    process.env.GRPC_PORT = '0';
    process.env.HEALTH_HOST = '127.0.0.1';
    process.env.GARCAR_WORKER_DISPATCH_SECRET = 'startup-signed-worker-secret-at-least-32-bytes';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    runtime = new StartupSequence();
  });

  afterEach(async () => {
    await runtime.shutdown();
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    jest.restoreAllMocks();
  });

  test('boots without Kafka, serves HTTP and gRPC, and executes only read-only work', async () => {
    const connect = jest.spyOn(KafkaCoordinator.prototype, 'connect');
    const result = await runtime.execute();
    const gateway = result.grpcGateway;
    expect(connect).not.toHaveBeenCalled();
    expect(gateway.config.host).toBe('127.0.0.1');
    expect(gateway.config.port).toBeGreaterThan(0);
    expect(result.results.phase3.port).toBe(gateway.config.port);
    const url = `http://127.0.0.1:${runtime.healthServer.address().port}`;
    const ready = await readJson(`${url}/ready`);
    expect(ready.status).toBe(200);
    expect(ready.body.agents.operational).toBe(3);
    expect(ready.body.dependencies.kafka).toEqual({ status: 'optional_unavailable', required: false });
    expect(ready.body.durable_storage).toBe('disabled');

    const client = await gateway.createClientConnection('canary', '127.0.0.1', gateway.config.port);
    const status = await new Promise((resolve, reject) => client.getStatus(
      { agentId: 'planning-agent' }, { deadline: Date.now() + 2000 },
      (error, reply) => error ? reject(error) : resolve(reply),
    ));
    expect(status.status).toBe('active');
    const plan = await new Promise((resolve, reject) => client.executeTask({
      agentId: 'planning-agent', taskId: 'grpc-canary',
      payload: Buffer.from(JSON.stringify({ action: 'agent_inventory' })),
    }, { deadline: Date.now() + 2000 }, (error, reply) => error ? reject(error) : resolve(reply)));
    expect(JSON.parse(plan.result.toString()).readOnly).toBe(true);

    const directiveBody = JSON.stringify({ directive_id: 'integration-worker-123', action: 'agent_inventory', issued_at: Math.floor(Date.now()/1000) });
    const signature = 'sha256=' + require('crypto').createHmac('sha256', process.env.GARCAR_WORKER_DISPATCH_SECRET).update(directiveBody).digest('hex');
    const reply = await fetch(url + '/directives', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dispatch-sig': signature }, body: directiveBody });
    expect(reply.status).toBe(200);
    const taskReceipt = await reply.json();
    expect(taskReceipt.status).toBe('completed');
    expect(taskReceipt.result.stages.synthesis.result.observations[0].agents.map(a => a.id)).toEqual(['planning-agent', 'execution-agent', 'reflexion-agent']);
    const observation = await result.rewooExecutor.execute({ action: 'runtime_health_check' });
    expect(observation.success).toBe(true);
    expect(observation.stages.synthesis.result.observations[0].status.agents.operational).toBe(3);
    const denied = await result.rewooExecutor.execute({ action: 'send_invoice' });
    expect(denied.success).toBe(false);
    const server = runtime.healthServer;
    await runtime.shutdown();
    expect(server.listening).toBe(false);
    expect(gateway.server).toBeNull();
    expect(gateway.connections.size).toBe(0);
  });

  test('required Kafka without brokers fails closed and releases the HTTP listener', async () => {
    process.env.KAFKA_REQUIRED = 'true';
    await expect(runtime.execute()).rejects.toThrow('KAFKA_BROKERS is required');
    expect(runtime.status).toBe('failed');
    expect(runtime.healthServer).toBeNull();
  });

  test('a later startup failure disconnects Kafka and preserves the remote gRPC guard', async () => {
    process.env.KAFKA_BROKERS = '127.0.0.1:1';
    process.env.GRPC_HOST = '0.0.0.0';
    jest.spyOn(KafkaCoordinator.prototype, 'connect').mockResolvedValue(true);
    jest.spyOn(KafkaCoordinator.prototype, 'createTopics').mockResolvedValue(true);
    const disconnect = jest.spyOn(KafkaCoordinator.prototype, 'disconnect').mockResolvedValue();
    await expect(runtime.execute()).rejects.toThrow('Refusing to bind unauthenticated gRPC');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.healthServer).toBeNull();
  });

  test('an optional broker failure closes its partially connected resources', async () => {
    process.env.KAFKA_BROKERS = '127.0.0.1:1';
    jest.spyOn(KafkaCoordinator.prototype, 'connect').mockRejectedValue(new Error('broker unavailable'));
    const disconnect = jest.spyOn(KafkaCoordinator.prototype, 'disconnect').mockResolvedValue();
    const result = await runtime.execute();
    expect(result.kafkaCoordinator).toBeNull();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.getStatusSnapshot().dependencies.kafka.status).toBe('optional_unavailable');
  });
});
