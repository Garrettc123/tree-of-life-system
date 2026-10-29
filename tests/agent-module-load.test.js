describe('agent modules load with the repository CommonJS runtime', () => {
  test.each([
    '../agents/runtime-agent',
    '../agents/core/mcp-coordinator',
    '../agents/grpc-gateway',
    '../agents/event-bus/kafka-coordinator',
    '../agents/orchestration/rewoo-executor',
  ])('%s can be required without module-format errors', (modulePath) => {
    expect(() => require(modulePath)).not.toThrow();
  });
});
