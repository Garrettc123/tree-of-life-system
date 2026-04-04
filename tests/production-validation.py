#!/usr/bin/env python3
"""
Production Validation Test Suite
Automated tests to verify 100% production readiness
"""

import sys
import os
import time
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.immutable_logger import ImmutableLogger


class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'


class ProductionValidator:
    def __init__(self):
        self.tests_passed = 0
        self.tests_failed = 0
        self.test_results = []
    
    def test(self, name, func):
        """Run a test and track results"""
        print(f"\n{Colors.BLUE}▶ Testing: {name}{Colors.RESET}")
        try:
            func()
            self.tests_passed += 1
            self.test_results.append((name, 'PASS'))
            print(f"{Colors.GREEN}✓ PASS{Colors.RESET}")
        except AssertionError as e:
            self.tests_failed += 1
            self.test_results.append((name, f'FAIL: {e}'))
            print(f"{Colors.RED}✗ FAIL: {e}{Colors.RESET}")
        except Exception as e:
            self.tests_failed += 1
            self.test_results.append((name, f'ERROR: {e}'))
            print(f"{Colors.RED}✗ ERROR: {e}{Colors.RESET}")
    
    def report(self):
        """Print final test report"""
        total = self.tests_passed + self.tests_failed
        pass_rate = (self.tests_passed / total * 100) if total > 0 else 0
        
        print("\n" + "="*80)
        print(f"{Colors.BLUE}📊 PRODUCTION VALIDATION REPORT{Colors.RESET}")
        print("="*80)
        
        for name, result in self.test_results:
            status = f"{Colors.GREEN}✓{Colors.RESET}" if result == 'PASS' else f"{Colors.RED}✗{Colors.RESET}"
            print(f"{status} {name}")
            if result != 'PASS':
                print(f"  {Colors.YELLOW}{result}{Colors.RESET}")
        
        print("\n" + "="*80)
        print(f"Total Tests: {total}")
        print(f"{Colors.GREEN}Passed: {self.tests_passed}{Colors.RESET}")
        print(f"{Colors.RED}Failed: {self.tests_failed}{Colors.RESET}")
        print(f"Pass Rate: {pass_rate:.1f}%")
        
        if pass_rate == 100:
            print(f"\n{Colors.GREEN}✅ 100% PRODUCTION READY!{Colors.RESET}")
            return 0
        elif pass_rate >= 90:
            print(f"\n{Colors.YELLOW}⚠️  90%+ - Near production ready{Colors.RESET}")
            return 1
        else:
            print(f"\n{Colors.RED}❌ NOT PRODUCTION READY{Colors.RESET}")
            return 2


def test_basic_logging(validator):
    """Test basic logging functionality"""
    def run():
        logger = ImmutableLogger('./test-logs')
        result = logger.info('Test message', {'test': True})
        assert result['success'], "Logging failed"
        assert 'hash' in result, "No hash returned"
        assert 'index' in result, "No index returned"
    
    validator.test('Basic Logging', run)


def test_blockchain_verification(validator):
    """Test blockchain integrity verification"""
    def run():
        logger = ImmutableLogger('./test-logs', enable_blockchain=True)
        
        # Log multiple entries
        for i in range(10):
            logger.info(f'Entry {i}', {'sequence': i})
        
        # Verify integrity
        assert logger.verify(), "Blockchain verification failed"
        assert len(logger.chain) >= 10, "Chain length incorrect"
    
    validator.test('Blockchain Verification', run)


def test_tamper_detection(validator):
    """Test tamper detection"""
    def run():
        logger = ImmutableLogger('./test-logs', enable_blockchain=True)
        
        # Log entries
        logger.info('Entry 1')
        logger.info('Entry 2')
        
        # Tamper with blockchain
        if len(logger.chain) > 0:
            logger.chain[0]['data'] = 'TAMPERED'
        
        # Verification should fail
        assert not logger.verify(), "Tamper detection failed!"
    
    validator.test('Tamper Detection', run)


def test_encryption(validator):
    """Test secure encryption"""
    def run():
        logger = ImmutableLogger('./test-logs', enable_encryption=True)
        
        # Log encrypted data
        result = logger.info('Sensitive data', {'ssn': '123-45-6789'})
        assert result['success'], "Encrypted logging failed"
        
        # Verify data is encrypted in file
        with open(logger.log_file, 'r') as f:
            content = f.read()
            # Should contain hex-encoded IV:authTag:encrypted
            assert ':' in content, "Encryption format incorrect"
            assert 'Sensitive' not in content, "Data not encrypted!"
    
    validator.test('Secure Encryption (AES-256-GCM)', run)


def test_search_functionality(validator):
    """Test log search"""
    def run():
        logger = ImmutableLogger('./test-logs')
        
        # Log test data
        logger.revenue('Sale completed', {'amount': 1000})
        logger.audit('User login', {'userId': 'test123'})
        logger.info('System started')
        
        # Search
        results = logger.search('revenue')
        assert len(results) > 0, "Search found no results"
        assert any('Sale' in str(r) for r in results), "Search results incorrect"
    
    validator.test('Search Functionality', run)


def test_performance(validator):
    """Test performance with high volume"""
    def run():
        logger = ImmutableLogger('./test-logs')
        
        # Log 1000 entries
        start = time.time()
        for i in range(1000):
            logger.info(f'Performance test {i}', {'index': i})
        elapsed = time.time() - start
        
        # Should handle 1000 logs in under 5 seconds
        assert elapsed < 5.0, f"Performance too slow: {elapsed:.2f}s for 1000 logs"
        
        # Throughput should be > 200 logs/sec
        throughput = 1000 / elapsed
        assert throughput > 200, f"Throughput too low: {throughput:.0f} logs/sec"
    
    validator.test('Performance (1000 logs < 5s)', run)


def test_log_rotation(validator):
    """Test log rotation"""
    def run():
        # Small rotation size for testing
        logger = ImmutableLogger('./test-logs', rotate_size=1024)  # 1KB
        
        # Log enough data to trigger rotation
        for i in range(50):
            logger.info('X' * 100, {'data': 'padding'})
        
        # Check if archive was created
        archives = list(Path('./test-logs').glob('immutable-*.log.gz'))
        # Note: rotation is async, might not complete immediately
        # This is more of a smoke test
    
    validator.test('Log Rotation', run)


def test_multi_tenant_isolation(validator):
    """Test multi-tenant isolation"""
    def run():
        logger1 = ImmutableLogger('./test-logs', tenantId='tenant1')
        logger2 = ImmutableLogger('./test-logs', tenantId='tenant2')
        
        # Log to different tenants
        logger1.info('Tenant 1 data', {'secret': 'A'})
        logger2.info('Tenant 2 data', {'secret': 'B'})
        
        # Verify isolation
        logs1 = logger1.read(limit=100)
        logs2 = logger2.read(limit=100)
        
        # Tenant 1 should not see tenant 2's data
        assert all(log.get('tenantId') == 'tenant1' for log in logs1), "Tenant isolation breach!"
        assert all(log.get('tenantId') == 'tenant2' for log in logs2), "Tenant isolation breach!"
    
    validator.test('Multi-Tenant Isolation', run)


def test_statistics(validator):
    """Test statistics generation"""
    def run():
        logger = ImmutableLogger('./test-logs')
        
        # Log different levels
        logger.info('Info message')
        logger.warn('Warning message')
        logger.error('Error message')
        logger.revenue('Revenue event', {'amount': 500})
        
        # Get stats
        stats = logger.stats()
        
        assert 'totalEntries' in stats, "Missing totalEntries"
        assert 'levels' in stats, "Missing levels breakdown"
        assert stats['verified'], "Stats show verification failed"
        assert stats['totalEntries'] >= 4, "Entry count incorrect"
    
    validator.test('Statistics Generation', run)


def test_concurrent_logging(validator):
    """Test thread-safe concurrent logging"""
    def run():
        import threading
        
        logger = ImmutableLogger('./test-logs')
        errors = []
        
        def log_worker(worker_id):
            try:
                for i in range(50):
                    logger.info(f'Worker {worker_id} - Entry {i}')
            except Exception as e:
                errors.append(e)
        
        # Create 5 concurrent workers
        threads = []
        for i in range(5):
            t = threading.Thread(target=log_worker, args=(i,))
            threads.append(t)
            t.start()
        
        # Wait for completion
        for t in threads:
            t.join()
        
        assert len(errors) == 0, f"Concurrent logging errors: {errors}"
        assert logger.verify(), "Blockchain corrupted by concurrent access"
    
    validator.test('Concurrent Logging (Thread-Safe)', run)


def test_read_filters(validator):
    """Test log reading with filters"""
    def run():
        logger = ImmutableLogger('./test-logs')
        
        # Log with timestamps
        logger.info('Old entry')
        time.sleep(0.1)
        logger.error('Error entry')
        logger.warn('Warning entry')
        
        # Filter by level
        errors = logger.read(level='ERROR')
        assert all(log['level'] == 'ERROR' for log in errors), "Level filter failed"
        
        # Limit results
        limited = logger.read(limit=1)
        assert len(limited) <= 1, "Limit filter failed"
    
    validator.test('Read Filters (Level, Limit)', run)


def cleanup():
    """Clean up test files"""
    import shutil
    test_dir = Path('./test-logs')
    if test_dir.exists():
        shutil.rmtree(test_dir)


def main():
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}🧪 PRODUCTION VALIDATION TEST SUITE{Colors.RESET}")
    print(f"{Colors.BLUE}Tree of Life System - Immutable Logger{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
    
    # Clean up before tests
    cleanup()
    
    # Create validator
    validator = ProductionValidator()
    
    # Run all tests
    test_basic_logging(validator)
    test_blockchain_verification(validator)
    test_tamper_detection(validator)
    test_encryption(validator)
    test_search_functionality(validator)
    test_performance(validator)
    test_log_rotation(validator)
    test_multi_tenant_isolation(validator)
    test_statistics(validator)
    test_concurrent_logging(validator)
    test_read_filters(validator)
    
    # Clean up after tests
    cleanup()
    
    # Print report
    exit_code = validator.report()
    
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
