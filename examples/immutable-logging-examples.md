# Immutable Logging Examples

## Overview

Immutable logging provides tamper-proof, append-only audit trails for your autonomous business systems.

---

## Features

- ✅ **Append-only** - Logs cannot be modified
- ✅ **Blockchain verification** - Cryptographic integrity
- ✅ **Hash chain** - Every log linked to previous
- ✅ **Read-only files** - File system protection
- ✅ **Automatic rotation** - Archives when size limit reached
- ✅ **Compression** - Gzip for archived logs
- ✅ **Fast search** - Indexed search capabilities
- ✅ **Multiple levels** - INFO, WARN, ERROR, AUDIT, REVENUE, etc.
- ✅ **Metadata support** - Rich contextual data
- ✅ **Verification** - Instant integrity checks

---

## Usage (Node.js)

### Basic Logging

```javascript
const ImmutableLogger = require('./core/immutable-logger');

const logger = new ImmutableLogger('./logs', {
    enableBlockchain: true,
    enableEncryption: false,
    rotateSize: 100 * 1024 * 1024 // 100MB
});

// Log entries
logger.info('Application started', { version: '1.0.0' });
logger.warn('High memory usage', { usage: '85%' });
logger.error('Database connection failed', { error: 'ECONNREFUSED' });
```

### Audit Logging

```javascript
// User actions
logger.audit('User login', {
    userId: 'user_123',
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0...'
});

logger.audit('Data access', {
    userId: 'user_123',
    resource: '/api/customers',
    action: 'READ'
});

logger.audit('Permission change', {
    admin: 'admin_456',
    target: 'user_123',
    newRole: 'manager'
});
```

### Revenue Tracking

```javascript
// Payment events
logger.revenue('Payment received', {
    orderId: 'order_789',
    amount: 1299.99,
    currency: 'USD',
    customer: 'cust_123',
    paymentMethod: 'card_ending_4242'
});

logger.revenue('Refund issued', {
    orderId: 'order_789',
    amount: -1299.99,
    reason: 'Customer request'
});

logger.revenue('Subscription renewed', {
    subscriptionId: 'sub_456',
    amount: 99.00,
    plan: 'Pro Annual'
});
```

### Security Events

```javascript
logger.security('Failed login attempt', {
    username: 'admin',
    ip: '203.0.113.42',
    attempts: 5
});

logger.security('API key compromised', {
    keyId: 'key_abc123',
    action: 'revoked',
    notified: true
});

logger.security('Suspicious activity detected', {
    userId: 'user_789',
    anomalies: ['unusual_location', 'high_request_rate']
});
```

### System Events

```javascript
logger.system('Deployment started', {
    version: '2.0.0',
    environment: 'production',
    deployedBy: 'ci-system'
});

logger.system('Auto-scaling triggered', {
    from: 3,
    to: 8,
    reason: 'cpu_threshold',
    threshold: 80
});

logger.system('Backup completed', {
    size: '45GB',
    duration: '12m 34s',
    destination: 's3://backups/'
});
```

---

## Usage (Python)

### Basic Logging

```python
from immutable_logger import ImmutableLogger

logger = ImmutableLogger('./logs', enable_blockchain=True)

# Log entries
logger.info('Application started', {'version': '1.0.0'})
logger.warn('High memory usage', {'usage': '85%'})
logger.error('Database connection failed', {'error': 'ECONNREFUSED'})
```

### Revenue Tracking

```python
logger.revenue('Payment received', {
    'orderId': 'order_789',
    'amount': 1299.99,
    'currency': 'USD',
    'customer': 'cust_123'
})
```

---

## Reading Logs

### Read Recent Logs

```javascript
// Get last 100 logs
const logs = logger.read({ limit: 100 });
console.log(logs);

// Get only errors
const errors = logger.read({ limit: 50, level: 'ERROR' });

// Get logs from date range
const todayLogs = logger.read({
    startDate: '2025-12-21T00:00:00Z',
    endDate: '2025-12-21T23:59:59Z'
});
```

### Search Logs

```javascript
// Search for keyword
const results = logger.search('payment');

// Search in specific level
const revenueSearch = logger.search('subscription', { level: 'REVENUE' });
```

---

## Verification

### Verify Log Integrity

```javascript
// Verify entire log chain
const isValid = logger.verify();
if (isValid) {
    console.log('✅ Logs are intact and tamper-proof');
} else {
    console.log('❌ Log tampering detected!');
}
```

### Get Statistics

```javascript
const stats = logger.stats();
console.log(stats);
/*
{
    totalEntries: 1543,
    fileSize: 5242880,
    blockchainLength: 1543,
    levels: {
        INFO: 800,
        WARN: 120,
        ERROR: 43,
        AUDIT: 380,
        REVENUE: 150,
        SECURITY: 50
    },
    verified: true,
    oldestEntry: '2025-12-01T00:00:00Z',
    newestEntry: '2025-12-21T12:34:56Z'
}
*/
```

---

## Integration Examples

### Express.js Middleware

```javascript
const express = require('express');
const ImmutableLogger = require('./core/immutable-logger');

const app = express();
const logger = new ImmutableLogger('./logs');

// Log all requests
app.use((req, res, next) => {
    logger.audit('HTTP request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Log errors
app.use((err, req, res, next) => {
    logger.error('Request error', {
        error: err.message,
        stack: err.stack,
        path: req.path
    });
    res.status(500).send('Internal error');
});
```

### Revenue System Integration

```javascript
const logger = new ImmutableLogger('./logs');

// Payment processor webhook
app.post('/webhooks/stripe', async (req, res) => {
    const event = req.body;
    
    if (event.type === 'payment_intent.succeeded') {
        logger.revenue('Payment successful', {
            amount: event.data.object.amount / 100,
            currency: event.data.object.currency,
            customer: event.data.object.customer,
            paymentMethod: event.data.object.payment_method
        });
    }
    
    res.json({ received: true });
});
```

### Security System Integration

```javascript
const logger = new ImmutableLogger('./logs');

// Failed login handler
function handleFailedLogin(username, ip) {
    logger.security('Failed login', {
        username,
        ip,
        timestamp: new Date().toISOString()
    });
    
    // Check for brute force
    const recentFailures = logger.search('Failed login', {
        level: 'SECURITY',
        startDate: new Date(Date.now() - 3600000).toISOString() // Last hour
    });
    
    const ipFailures = recentFailures.filter(log => 
        log.metadata.ip === ip
    ).length;
    
    if (ipFailures >= 5) {
        logger.security('Brute force detected', {
            ip,
            failures: ipFailures,
            action: 'blocked'
        });
        // Block IP
    }
}
```

---

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// INFO - General information
logger.info('Service started');

// WARN - Warning conditions
logger.warn('Cache miss rate high');

// ERROR - Error conditions
logger.error('API call failed');

// CRITICAL - Critical conditions
logger.critical('Database offline');

// AUDIT - User actions
logger.audit('User deleted account');

// SECURITY - Security events
logger.security('Unauthorized access attempt');

// REVENUE - Money events
logger.revenue('Payment processed');

// SYSTEM - System events
logger.system('Auto-scaling activated');
```

### 2. Include Rich Metadata

```javascript
logger.audit('Purchase completed', {
    // Transaction details
    orderId: 'order_123',
    amount: 99.99,
    currency: 'USD',
    
    // User details
    userId: 'user_456',
    email: 'user@example.com',
    
    // Context
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    referrer: 'https://example.com/products',
    
    // Timing
    duration: 1234, // ms
    retries: 0
});
```

### 3. Regular Verification

```javascript
// Verify logs daily
setInterval(() => {
    const isValid = logger.verify();
    if (!isValid) {
        // Alert security team
        logger.critical('Log tampering detected!');
    }
}, 24 * 60 * 60 * 1000);
```

### 4. Monitor Log Size

```javascript
// Check stats periodically
setInterval(() => {
    const stats = logger.stats();
    
    if (stats.fileSize > 0.9 * logger.rotateSize) {
        logger.system('Log rotation imminent', {
            currentSize: stats.fileSize,
            rotateSize: logger.rotateSize
        });
    }
}, 60 * 60 * 1000); // Every hour
```

---

## Testing

```javascript
// Test logging
const logger = new ImmutableLogger('./test-logs');

logger.info('Test entry 1');
logger.info('Test entry 2');
logger.info('Test entry 3');

// Verify integrity
assert(logger.verify() === true);

// Check count
const stats = logger.stats();
assert(stats.totalEntries === 3);

// Search works
const results = logger.search('Test');
assert(results.length === 3);

console.log('✅ All tests passed');
```

---

**Your logs are now immutable, tamper-proof, and audit-ready!** 🔒
