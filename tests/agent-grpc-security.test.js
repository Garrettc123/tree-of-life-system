const gRPCGateway = require('../agents/grpc-gateway');

describe('gRPC listener security defaults', () => {
  test.each(['localhost', '127.0.0.1', '::1'])(
    'allows loopback host %s without remote-bind opt-in',
    (host) => {
      expect(() => gRPCGateway.assertSafeBinding(host)).not.toThrow();
    },
  );

  test.each(['0.0.0.0', '192.0.2.5', '::'])(
    'rejects non-loopback host %s unless explicitly allowed',
    (host) => {
      expect(() => gRPCGateway.assertSafeBinding(host)).toThrow(/unauthenticated gRPC/);
    },
  );

  test('permits explicit opt-in for a trusted private network', () => {
    expect(() => gRPCGateway.assertSafeBinding('0.0.0.0', true)).not.toThrow();
  });
});
