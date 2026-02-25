/**
 * TITAN Analytics Engine
 * Track usage, performance, and revenue metrics
 */

class Analytics {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byEndpoint: {},
        byStatus: {}
      },
      performance: {
        avgResponseTime: 0,
        responseTimes: [],
        runningSum: 0  // Track running sum to avoid O(n) reduce
      },
      automation: {
        prReviews: 0,
        issuesLabeled: 0,
        deploymentsCompleted: 0,
        codeQualityScans: 0
      },
      revenue: {
        apiCalls: 0,
        subscriptions: 0,
        consultingHours: 0,
        affiliateClicks: 0
      },
      errors: {
        total: 0,
        byType: {}
      }
    };
  }
  
  trackRequest(endpoint, status, responseTime) {
    this.metrics.requests.total++;

    // Track by endpoint
    if (!this.metrics.requests.byEndpoint[endpoint]) {
      this.metrics.requests.byEndpoint[endpoint] = 0;
    }
    this.metrics.requests.byEndpoint[endpoint]++;

    // Track by status
    if (!this.metrics.requests.byStatus[status]) {
      this.metrics.requests.byStatus[status] = 0;
    }
    this.metrics.requests.byStatus[status]++;

    // Track response time efficiently with running sum
    this.metrics.performance.responseTimes.push(responseTime);
    this.metrics.performance.runningSum += responseTime;

    if (this.metrics.performance.responseTimes.length > 1000) {
      // Remove oldest entry and subtract from running sum
      const removed = this.metrics.performance.responseTimes.shift();
      this.metrics.performance.runningSum -= removed;
    }

    // Calculate average from running sum (O(1) instead of O(n))
    this.metrics.performance.avgResponseTime =
      this.metrics.performance.runningSum / this.metrics.performance.responseTimes.length;
  }
  
  trackAutomation(type) {
    switch(type) {
      case 'pr_review':
        this.metrics.automation.prReviews++;
        break;
      case 'issue_labeled':
        this.metrics.automation.issuesLabeled++;
        break;
      case 'deployment':
        this.metrics.automation.deploymentsCompleted++;
        break;
      case 'quality_scan':
        this.metrics.automation.codeQualityScans++;
        break;
    }
  }
  
  trackRevenue(type, amount = 1) {
    switch(type) {
      case 'api_call':
        this.metrics.revenue.apiCalls += amount;
        break;
      case 'subscription':
        this.metrics.revenue.subscriptions += amount;
        break;
      case 'consulting':
        this.metrics.revenue.consultingHours += amount;
        break;
      case 'affiliate':
        this.metrics.revenue.affiliateClicks += amount;
        break;
    }
  }
  
  trackError(type, error) {
    this.metrics.errors.total++;
    if (!this.metrics.errors.byType[type]) {
      this.metrics.errors.byType[type] = 0;
    }
    this.metrics.errors.byType[type]++;
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      summary: {
        totalRequests: this.metrics.requests.total,
        avgResponseTime: `${this.metrics.performance.avgResponseTime.toFixed(2)}ms`,
        errorRate: `${((this.metrics.errors.total / this.metrics.requests.total) * 100).toFixed(2)}%`,
        totalAutomations: 
          this.metrics.automation.prReviews +
          this.metrics.automation.issuesLabeled +
          this.metrics.automation.deploymentsCompleted +
          this.metrics.automation.codeQualityScans,
        revenueMetrics: this.calculateRevenue()
      }
    };
  }
  
  calculateRevenue() {
    // Rough estimates based on pricing
    const apiRevenue = this.metrics.revenue.apiCalls * 0.01; // $0.01 per call
    const subscriptionRevenue = this.metrics.revenue.subscriptions * 99; // Avg $99/mo
    const consultingRevenue = this.metrics.revenue.consultingHours * 175; // $175/hr avg
    const affiliateRevenue = this.metrics.revenue.affiliateClicks * 5; // $5 per click avg
    
    return {
      api: `$${apiRevenue.toFixed(2)}`,
      subscriptions: `$${subscriptionRevenue.toFixed(2)}`,
      consulting: `$${consultingRevenue.toFixed(2)}`,
      affiliates: `$${affiliateRevenue.toFixed(2)}`,
      total: `$${(apiRevenue + subscriptionRevenue + consultingRevenue + affiliateRevenue).toFixed(2)}`
    };
  }
  
  getDashboard() {
    const metrics = this.getMetrics();
    return {
      timestamp: new Date().toISOString(),
      status: 'operational',
      metrics: metrics.summary,
      topEndpoints: this.getTopEndpoints(5),
      recentErrors: this.getRecentErrors(5)
    };
  }
  
  getTopEndpoints(limit = 5) {
    return Object.entries(this.metrics.requests.byEndpoint)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([endpoint, count]) => ({ endpoint, count }));
  }
  
  getRecentErrors(limit = 5) {
    return Object.entries(this.metrics.errors.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([type, count]) => ({ type, count }));
  }
}

// Singleton instance
const analytics = new Analytics();

module.exports = analytics;
