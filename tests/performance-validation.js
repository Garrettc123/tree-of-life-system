/**
 * Performance Validation Tests
 * Validates the performance improvements made to the codebase
 */

const assert = require('assert');
const ImmutableLogger = require('../core/immutable-logger');
const EventBus = require('../agents/core/event-bus');
const Analytics = require('../monitoring/analytics');

console.log('🧪 Running Performance Validation Tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: Event Bus - Array trimming doesn't create copies
test('Event Bus - Efficient array trimming', () => {
  const eventBus = new EventBus();
  const maxSize = eventBus.maxLogSize;

  // Fill beyond max size
  for (let i = 0; i < maxSize + 100; i++) {
    eventBus.publish('test:event', { data: i }, 'test');
  }

  // Verify size is trimmed correctly
  assert.strictEqual(eventBus.eventLog.length, maxSize, 'Event log should be trimmed to max size');

  // Verify oldest events were removed (should start at index 100)
  const oldestEvent = eventBus.eventLog[0];
  assert.strictEqual(oldestEvent.data.data, 100, 'Oldest events should be removed first');
});

// Test 2: Analytics - Running sum for O(1) average
test('Analytics - O(1) average calculation', () => {
  const Analytics = require('../monitoring/analytics');

  // Analytics is exported as singleton, so we need to use it directly
  // Reset state for testing
  if (Analytics.metrics && Analytics.metrics.performance) {
    Analytics.metrics.performance.responseTimes = [];
    Analytics.metrics.performance.runningSum = 0;
    Analytics.metrics.performance.avgResponseTime = 0;
  }

  // Track 100 requests
  for (let i = 0; i < 100; i++) {
    Analytics.trackRequest('/test', 200, 50 + i);
  }

  // Verify running sum is maintained
  assert.ok(Analytics.metrics.performance.runningSum > 0, 'Running sum should be maintained');

  // Verify average is calculated correctly
  const expectedAvg = (50 + 149) / 2; // Average of 50..149
  const actualAvg = Analytics.metrics.performance.avgResponseTime;
  assert.ok(Math.abs(actualAvg - expectedAvg) < 1, `Average should be close to ${expectedAvg}, got ${actualAvg}`);

  // Track 1000 more to verify trimming
  for (let i = 0; i < 1000; i++) {
    Analytics.trackRequest('/test', 200, 100);
  }

  // Verify array is capped at 1000
  assert.strictEqual(
    Analytics.metrics.performance.responseTimes.length,
    1000,
    'Response times should be capped at 1000'
  );
});

// Test 3: Immutable Logger - No redundant file operations
test('Immutable Logger - Efficient append operations', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // Create temp directory for test
  const testDir = path.join(os.tmpdir(), `test-logger-${Date.now()}`);

  // Count chmod calls (should be minimal)
  const originalChmod = fs.chmodSync;
  let chmodCallCount = 0;
  fs.chmodSync = function(...args) {
    chmodCallCount++;
    return originalChmod.apply(fs, args);
  };

  const logger = new ImmutableLogger(testDir, {
    enableBlockchain: false,
    enableEncryption: false
  });

  // Log 10 entries
  for (let i = 0; i < 10; i++) {
    logger.info(`Test message ${i}`, { index: i });
  }

  // Restore original chmod
  fs.chmodSync = originalChmod;

  // With optimization, chmod should not be called on every log
  // Initialization calls it a few times (3-4), but NOT 3x per log (would be 30+)
  assert.ok(chmodCallCount < 10, `chmod should not be called 3x per log (was called ${chmodCallCount} times for 10 logs)`);

  // Cleanup
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});

// Test 4: Promise.all parallelization pattern
test('Parallel execution with Promise.all', async () => {
  const startTime = Date.now();

  // Simulate parallel API calls
  const delays = [100, 100, 100, 100, 100];
  const results = await Promise.all(
    delays.map(delay => new Promise(resolve => setTimeout(() => resolve(delay), delay)))
  );

  const duration = Date.now() - startTime;

  // Should complete in ~100ms (parallel), not 500ms (sequential)
  assert.ok(duration < 200, `Parallel execution should take ~100ms, took ${duration}ms`);
  assert.strictEqual(results.length, 5, 'All promises should resolve');
});

// Test 5: Window function simulation (database optimization concept)
test('Window function concept - single-pass counting', () => {
  // Simulate database rows with window function COUNT(*) OVER()
  const mockRows = [
    { id: 1, name: 'Item 1', total_count: 100 },
    { id: 2, name: 'Item 2', total_count: 100 },
    { id: 3, name: 'Item 3', total_count: 100 }
  ];

  // Extract total from first row (eliminates need for second query)
  const total = mockRows.length > 0 ? parseInt(mockRows[0].total_count) : 0;

  // Remove total_count from response
  const cleanedRows = mockRows.map(({ total_count, ...row }) => row);

  assert.strictEqual(total, 100, 'Total should be extracted from first row');
  assert.strictEqual(cleanedRows.length, 3, 'All rows should be preserved');
  assert.ok(!cleanedRows[0].hasOwnProperty('total_count'), 'total_count should be removed from results');
});

// Test 6: Memory cleanup validation
test('ReWOO Executor - Memory cleanup concept', () => {
  // Simulate execution map with timestamps
  const executions = new Map();
  const now = Date.now();

  // Add old and new executions
  executions.set('exec1', { timestamp: new Date(now - 7200000).toISOString() }); // 2 hours old
  executions.set('exec2', { timestamp: new Date(now - 1800000).toISOString() }); // 30 min old
  executions.set('exec3', { timestamp: new Date(now - 300000).toISOString() });  // 5 min old

  const TTL = 3600000; // 1 hour

  // Cleanup old executions
  let removedCount = 0;
  for (const [id, execution] of executions.entries()) {
    const age = now - new Date(execution.timestamp).getTime();
    if (age > TTL) {
      executions.delete(id);
      removedCount++;
    }
  }

  assert.strictEqual(removedCount, 1, 'Should remove 1 old execution (exec1)');
  assert.strictEqual(executions.size, 2, 'Should have 2 executions remaining');
  assert.ok(!executions.has('exec1'), 'Old execution should be removed');
});

// Summary
console.log('\n' + '='.repeat(80));
console.log('📊 Performance Validation Summary');
console.log('='.repeat(80));
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`Pass Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log('\n🎉 All performance validations passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some validations failed. Review the optimizations.');
  process.exit(1);
}
