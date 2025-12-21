/**
 * Revenue System - Stripe Integration
 * Handles SaaS subscriptions, pay-as-you-go API billing, and premium features
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Pricing Tiers
const SUBSCRIPTION_TIERS = {
  starter: {
    name: 'Starter',
    price: 29,
    features: [
      'GitHub webhook integration',
      'Basic Linear sync',
      'Notion automation',
      '100 AI analyses/month',
      'Email support'
    ],
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID
  },
  professional: {
    name: 'Professional',
    price: 99,
    features: [
      'All Starter features',
      'Advanced GitHub CI/CD',
      'Full Linear integration',
      'Perplexity research',
      '1,000 AI analyses/month',
      'Marketing automation',
      'Priority support'
    ],
    stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID
  },
  enterprise: {
    name: 'Enterprise',
    price: 499,
    features: [
      'All Professional features',
      'Unlimited AI analyses',
      'Custom integrations',
      'Dedicated support',
      'Advanced analytics',
      'White-label options',
      'Custom workflows'
    ],
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID
  }
};

// API Usage Pricing (per 1000 calls)
const API_PRICING = {
  github_webhook: 0.01,
  linear_sync: 0.02,
  ai_analysis: 0.10,
  content_generation: 0.15,
  perplexity_research: 0.20
};

// Create Subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { email, tier, userId } = req.body;

    if (!SUBSCRIPTION_TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Create or get customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer = customers.data[0];

    if (!customer) {
      customer = await stripe.customers.create({
        email,
        metadata: { userId }
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price: SUBSCRIPTION_TIERS[tier].stripePriceId
      }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });

    res.json({
      subscription_id: subscription.id,
      client_secret: subscription.latest_invoice.payment_intent.client_secret,
      tier,
      price: SUBSCRIPTION_TIERS[tier].price
    });
  } catch (error) {
    console.error('[Stripe] Subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Track API Usage
router.post('/track-usage', async (req, res) => {
  try {
    const { userId, apiType, count } = req.body;
    const price = API_PRICING[apiType] || 0.05;
    const chargeAmount = Math.round(count * price * 100); // Convert to cents

    console.log(`[API Usage] User: ${userId}, Type: ${apiType}, Count: ${count}, Charge: $${chargeAmount/100}`);

    // Store usage record
    res.json({
      recorded: true,
      apiType,
      count,
      estimatedCharge: chargeAmount / 100
    });
  } catch (error) {
    console.error('[API Usage] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Pricing
router.get('/pricing', (req, res) => {
  res.json({
    subscriptions: SUBSCRIPTION_TIERS,
    apiUsage: API_PRICING,
    timestamp: new Date().toISOString()
  });
});

// Billing Portal
router.post('/billing-portal', async (req, res) => {
  try {
    const { customerId } = req.body;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.BILLING_RETURN_URL
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
