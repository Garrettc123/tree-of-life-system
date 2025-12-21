/**
 * Revenue System - Services Marketplace
 * Sells custom integrations, automation services, and consulting
 */

const express = require('express');
const router = express.Router();

// Service Offerings
const SERVICES = {
  // Pre-built Services
  github_automation: {
    name: 'GitHub Automation Package',
    category: 'integration',
    price: 299,
    description: 'Complete GitHub CI/CD automation setup',
    deliveryTime: '3 days',
    includes: [
      'Webhook configuration',
      'Automated testing',
      'Deployment pipeline',
      'Code review automation'
    ]
  },
  linear_optimization: {
    name: 'Linear Workflow Optimization',
    category: 'integration',
    price: 199,
    description: 'Optimize your Linear project management',
    deliveryTime: '2 days',
    includes: [
      'Workflow analysis',
      'Custom automation',
      'Integration setup',
      'Team training'
    ]
  },
  ai_content_pipeline: {
    name: 'AI Content Generation Pipeline',
    category: 'automation',
    price: 499,
    description: 'Set up automated content generation',
    deliveryTime: '5 days',
    includes: [
      'Content template setup',
      'AI model configuration',
      'Publishing automation',
      'Analytics dashboard'
    ]
  },
  notion_migration: {
    name: 'Notion Data Migration',
    category: 'integration',
    price: 399,
    description: 'Migrate and optimize your Notion workspace',
    deliveryTime: '4 days',
    includes: [
      'Database migration',
      'Workflow setup',
      'Template creation',
      'Training included'
    ]
  },
  // Custom Services
  custom_integration: {
    name: 'Custom Integration Development',
    category: 'custom',
    basePrice: 1500,
    description: 'Custom API integration for your needs',
    billingModel: 'hourly', // $150/hour
    minimum: 10 // 10 hours minimum
  },
  strategy_consulting: {
    name: 'AI Strategy Consulting',
    category: 'consulting',
    hourlyRate: 200,
    description: 'Strategic planning for AI implementation',
    minimumHours: 4,
    includes: [
      'Assessment',
      'Roadmap creation',
      'Implementation guide',
      'Follow-up support'
    ]
  }
};

// Service Tiers
const SERVICE_TIERS = {
  standard: {
    name: 'Standard',
    turnaround: '5-7 days',
    revisions: 2,
    support: 'Email',
    discount: 0
  },
  priority: {
    name: 'Priority',
    turnaround: '2-3 days',
    revisions: 4,
    support: 'Phone + Email',
    discount: 0.10 // 10% higher price
  },
  premium: {
    name: 'Premium',
    turnaround: '24 hours',
    revisions: 'Unlimited',
    support: 'Dedicated support',
    discount: 0.25 // 25% higher price
  }
};

// Purchase Service
router.post('/purchase-service', async (req, res) => {
  try {
    const { serviceId, tier, quantity, buyerEmail } = req.body;
    const service = SERVICES[serviceId];
    const tierConfig = SERVICE_TIERS[tier || 'standard'];

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const basePrice = service.price || service.basePrice;
    const tierMultiplier = 1 + tierConfig.discount;
    const totalPrice = basePrice * tierMultiplier * (quantity || 1);

    console.log(`[Services] Purchase: ${serviceId}, Tier: ${tier}, Total: $${totalPrice}`);

    res.json({
      orderId: `ORDER_${Date.now()}`,
      service: service.name,
      tier: tierConfig.name,
      basePrice,
      totalPrice,
      deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      includes: service.includes,
      support: tierConfig.support
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Available Services
router.get('/services', (req, res) => {
  const serviceList = Object.entries(SERVICES).map(([id, service]) => ({
    id,
    ...service
  }));

  res.json({
    services: serviceList,
    tiers: SERVICE_TIERS,
    timestamp: new Date().toISOString()
  });
});

// Services Dashboard
router.get('/dashboard', (req, res) => {
  res.json({
    services: {
      active: Math.floor(Math.random() * 20),
      completed: Math.floor(Math.random() * 100),
      monthlyRevenue: Math.floor(Math.random() * 100000),
      averageRating: (Math.random() * 1 + 4.5).toFixed(1)
    },
    topServices: [
      { name: 'GitHub Automation Package', sales: 25, revenue: 7475 },
      { name: 'Linear Optimization', sales: 18, revenue: 3582 },
      { name: 'AI Content Pipeline', sales: 12, revenue: 5988 }
    ],
    upcomingDeliveries: Math.floor(Math.random() * 10),
    teamCapacity: '75%'
  });
});

module.exports = router;
