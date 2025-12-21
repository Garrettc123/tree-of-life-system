/**
 * TITAN Health Monitoring
 * Continuous health checks for all systems
 */

const axios = require('axios');

const ENDPOINTS = [
  '/health',
  '/status',
  '/dashboard',
  '/github/pr/status',
  '/github/issue/status',
  '/github/cicd/status',
  '/github/quality/dashboard',
  '/github/security/dashboard',
  '/revenue/dashboard'
];

class HealthMonitor {
  constructor(baseUrl, interval = 60000) {
    this.baseUrl = baseUrl;
    this.interval = interval;
    this.stats = {
      totalChecks: 0,
      successCount: 0,
      failureCount: 0,
      lastCheck: null,
      uptime: 100
    };
  }
  
  async checkEndpoint(endpoint) {
    try {
      const start = Date.now();
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        timeout: 5000
      });
      const duration = Date.now() - start;
      
      return {
        endpoint,
        status: 'healthy',
        statusCode: response.status,
        responseTime: duration
      };
    } catch (error) {
      return {
        endpoint,
        status: 'unhealthy',
        error: error.message
      };
    }
  }
  
  async runHealthCheck() {
    console.log(`\n[${new Date().toISOString()}] Running health check...`);
    
    const results = await Promise.all(
      ENDPOINTS.map(endpoint => this.checkEndpoint(endpoint))
    );
    
    const healthy = results.filter(r => r.status === 'healthy');
    const unhealthy = results.filter(r => r.status === 'unhealthy');
    
    this.stats.totalChecks++;
    this.stats.successCount += healthy.length;
    this.stats.failureCount += unhealthy.length;
    this.stats.lastCheck = new Date().toISOString();
    this.stats.uptime = ((this.stats.successCount / (this.stats.successCount + this.stats.failureCount)) * 100).toFixed(2);
    
    console.log(`✅ Healthy: ${healthy.length}/${results.length}`);
    console.log(`❌ Unhealthy: ${unhealthy.length}/${results.length}`);
    console.log(`📊 Overall Uptime: ${this.stats.uptime}%`);
    
    if (unhealthy.length > 0) {
      console.log('\n⚠️  Unhealthy endpoints:');
      unhealthy.forEach(r => {
        console.log(`   - ${r.endpoint}: ${r.error}`);
      });
    }
    
    // Alert if too many failures
    if (unhealthy.length > ENDPOINTS.length / 2) {
      this.sendAlert('CRITICAL: More than 50% of endpoints are down!');
    }
  }
  
  sendAlert(message) {
    console.error(`\n🚨 ALERT: ${message}\n`);
    // TODO: Integrate with alerting service (PagerDuty, Slack, etc.)
  }
  
  start() {
    console.log('🏥 TITAN Health Monitor Started');
    console.log(`📡 Monitoring ${ENDPOINTS.length} endpoints every ${this.interval/1000}s\n`);
    
    // Run immediately
    this.runHealthCheck();
    
    // Then run on interval
    setInterval(() => this.runHealthCheck(), this.interval);
  }
  
  getStats() {
    return this.stats;
  }
}

// Start monitoring if run directly
if (require.main === module) {
  const baseUrl = process.env.RAILWAY_URL || 'http://localhost:3000';
  const monitor = new HealthMonitor(baseUrl, 60000); // Check every minute
  monitor.start();
}

module.exports = HealthMonitor;
