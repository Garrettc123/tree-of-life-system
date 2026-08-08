/**
 * Transport security configuration for the agent control plane.
 *
 * Both the Kafka event bus and the gRPC gateway carry agent task payloads and
 * can trigger task execution, so they must not run unencrypted or
 * unauthenticated outside of a local developer machine. This module translates
 * the environment variables documented in `.env.template` into the config
 * objects consumed by `KafkaCoordinator` and `gRPCGateway`.
 */

const fs = require('fs');

const SECURE_KAFKA_PROTOCOLS = ['SSL', 'SASL_SSL'];
const SASL_PROTOCOLS = ['SASL_SSL', 'SASL_PLAINTEXT'];

function isEnabled(value) {
  return String(value).toLowerCase() === 'true';
}

/**
 * Build the kafkajs `ssl`/`sasl` options from KAFKA_* environment variables.
 */
function buildKafkaSecurityConfig(env = process.env) {
  const protocol = (env.KAFKA_SECURITY_PROTOCOL || 'PLAINTEXT').toUpperCase();
  const config = {
    ssl: false,
    sasl: null,
    allowPlaintext: isEnabled(env.KAFKA_ALLOW_PLAINTEXT),
  };

  if (SECURE_KAFKA_PROTOCOLS.includes(protocol)) {
    config.ssl = env.KAFKA_SSL_CA_CERT
      ? { ca: [fs.readFileSync(env.KAFKA_SSL_CA_CERT, 'utf8')] }
      : true;
  }

  if (SASL_PROTOCOLS.includes(protocol)) {
    if (!env.KAFKA_SASL_USERNAME || !env.KAFKA_SASL_PASSWORD) {
      throw new Error(
        `KAFKA_SECURITY_PROTOCOL=${protocol} requires KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD.`
      );
    }

    config.sasl = {
      mechanism: (env.KAFKA_SASL_MECHANISM || 'scram-sha-512').toLowerCase(),
      username: env.KAFKA_SASL_USERNAME,
      password: env.KAFKA_SASL_PASSWORD,
    };
  }

  return config;
}

/**
 * Build the gRPC TLS and caller-authentication options from GRPC_* environment
 * variables.
 */
function buildGrpcSecurityConfig(env = process.env) {
  return {
    tlsEnabled: isEnabled(env.GRPC_TLS_ENABLED),
    tlsCertPath: env.GRPC_TLS_CERT_PATH || null,
    tlsKeyPath: env.GRPC_TLS_KEY_PATH || null,
    tlsCaPath: env.GRPC_TLS_CA_PATH || null,
    requireClientCert: isEnabled(env.GRPC_REQUIRE_CLIENT_CERT),
    authToken: env.GRPC_AUTH_TOKEN || null,
    allowInsecure: isEnabled(env.GRPC_ALLOW_INSECURE),
  };
}

module.exports = {
  buildKafkaSecurityConfig,
  buildGrpcSecurityConfig,
};
