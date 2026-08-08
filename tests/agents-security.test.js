/**
 * Security regression tests for the agent transport layer.
 *
 * These cover the two ways the control plane can be exposed:
 * - the gRPC gateway accepting unauthenticated task execution
 * - the Kafka event bus talking to remote brokers in plaintext
 */

const assert = require('assert');
const grpc = require('@grpc/grpc-js');

// `uuid` v14 is ESM-only, which Jest's CommonJS runtime cannot load. The ids it
// produces are irrelevant to these tests, so stub it out.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

const gRPCGateway = require('../agents/grpc-gateway');
const KafkaCoordinator = require('../agents/event-bus/kafka-coordinator');
const { buildKafkaSecurityConfig, buildGrpcSecurityConfig } = require('../agents/config/security');

const TEST_TOKEN = 'unit-test-shared-secret';

function metadataWith(value) {
  const metadata = new grpc.Metadata();
  if (value !== undefined) {
    metadata.set('authorization', value);
  }
  return metadata;
}

describe('gRPCGateway security', function () {
  it('rejects a non-loopback bind without TLS', function () {
    assert.throws(
      () => new gRPCGateway({ host: '0.0.0.0', authToken: TEST_TOKEN }),
      /TLS is disabled/
    );
  });

  it('rejects a non-loopback bind without caller authentication', function () {
    assert.throws(
      () =>
        new gRPCGateway({
          host: '0.0.0.0',
          tlsEnabled: true,
          tlsCertPath: '/tmp/server.crt',
          tlsKeyPath: '/tmp/server.key',
        }),
      /no caller authentication/
    );
  });

  it('rejects TLS without a certificate and key', function () {
    assert.throws(
      () => new gRPCGateway({ host: '127.0.0.1', tlsEnabled: true }),
      /GRPC_TLS_CERT_PATH and GRPC_TLS_KEY_PATH/
    );
  });

  it('allows loopback binds and explicit insecure opt-in', function () {
    assert.ok(new gRPCGateway({ host: '127.0.0.1' }));
    assert.ok(new gRPCGateway({ host: '0.0.0.0', allowInsecure: true }));
  });

  it('rejects RPCs with a missing or wrong token', function () {
    const gateway = new gRPCGateway({ host: '127.0.0.1', authToken: TEST_TOKEN });

    assert.throws(() => gateway.authenticate({ metadata: metadataWith() }), /Unauthenticated/);
    assert.throws(
      () => gateway.authenticate({ metadata: metadataWith('wrong-secret-value') }),
      /Unauthenticated/
    );
    // Same length as TEST_TOKEN, so only the constant-time comparison rejects it.
    assert.throws(
      () => gateway.authenticate({ metadata: metadataWith('unit-test-shared-secreT') }),
      /Unauthenticated/
    );
    assert.strictEqual(gateway.metrics.unauthenticatedRequests, 3);
  });

  it('accepts RPCs presenting the configured token', function () {
    const gateway = new gRPCGateway({ host: '127.0.0.1', authToken: TEST_TOKEN });

    assert.doesNotThrow(() => gateway.authenticate({ metadata: metadataWith(TEST_TOKEN) }));
    assert.doesNotThrow(() =>
      gateway.authenticate({ metadata: metadataWith('Bearer ' + TEST_TOKEN) })
    );
    assert.strictEqual(gateway.metrics.unauthenticatedRequests, 0);
  });

  it('surfaces UNAUTHENTICATED to the caller instead of a generic error', function (done) {
    const gateway = new gRPCGateway({ host: '127.0.0.1', authToken: TEST_TOKEN });

    gateway.executeTask({ metadata: metadataWith(), request: { agentId: 'a' } }, (error) => {
      assert.ok(error);
      assert.strictEqual(error.code, grpc.status.UNAUTHENTICATED);
      done();
    });
  });

  it('skips authentication when no token is configured', function () {
    const gateway = new gRPCGateway({ host: '127.0.0.1' });
    assert.doesNotThrow(() => gateway.authenticate({ metadata: metadataWith() }));
  });
});

describe('KafkaCoordinator security', function () {
  it('rejects plaintext connections to remote brokers', function () {
    assert.throws(
      () => new KafkaCoordinator({ brokers: ['kafka.example.com:9092'] }),
      /Kafka TLS is disabled/
    );
  });

  it('allows plaintext for loopback brokers', function () {
    assert.ok(new KafkaCoordinator({ brokers: ['localhost:9092'] }));
    assert.ok(new KafkaCoordinator({ brokers: ['127.0.0.1:9092'] }));
  });

  it('allows remote brokers over TLS or with an explicit opt-in', function () {
    assert.ok(new KafkaCoordinator({ brokers: ['kafka.example.com:9092'], ssl: true }));
    assert.ok(
      new KafkaCoordinator({ brokers: ['kafka.example.com:9092'], allowPlaintext: true })
    );
  });
});

describe('security configuration builders', function () {
  it('defaults Kafka to plaintext with no credentials', function () {
    const config = buildKafkaSecurityConfig({});
    assert.strictEqual(config.ssl, false);
    assert.strictEqual(config.sasl, null);
    assert.strictEqual(config.allowPlaintext, false);
  });

  it('builds SASL_SSL credentials from the environment', function () {
    const config = buildKafkaSecurityConfig({
      KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
      KAFKA_SASL_USERNAME: 'admin',
      KAFKA_SASL_PASSWORD: 'example-password',
    });

    assert.strictEqual(config.ssl, true);
    assert.strictEqual(config.sasl.mechanism, 'scram-sha-512');
    assert.strictEqual(config.sasl.username, 'admin');
  });

  it('fails fast when SASL is selected without credentials', function () {
    assert.throws(
      () => buildKafkaSecurityConfig({ KAFKA_SECURITY_PROTOCOL: 'SASL_SSL' }),
      /KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD/
    );
  });

  it('reads gRPC TLS and auth settings from the environment', function () {
    const config = buildGrpcSecurityConfig({
      GRPC_TLS_ENABLED: 'true',
      GRPC_TLS_CERT_PATH: '/etc/secrets/server.crt',
      GRPC_TLS_KEY_PATH: '/etc/secrets/server.key',
      GRPC_REQUIRE_CLIENT_CERT: 'true',
      GRPC_AUTH_TOKEN: TEST_TOKEN,
    });

    assert.strictEqual(config.tlsEnabled, true);
    assert.strictEqual(config.requireClientCert, true);
    assert.strictEqual(config.authToken, TEST_TOKEN);
    assert.strictEqual(config.allowInsecure, false);
  });
});
