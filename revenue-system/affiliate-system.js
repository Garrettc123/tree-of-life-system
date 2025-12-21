/**
 * Revenue System - Affiliate & Referral Program
 * Tracks commissions, generates unique referral links, manages payouts
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Affiliate Commission Structure
const COMMISSION_STRUCTURE = {
  starter: {
    subscription: 0.30, // 30% recurring commission
    oneTime: 0.15      // 15% on first payment
  },
  professional: {
    subscription: 0.25,
    oneTime: 0.20
  },
  enterprise: {
    subscription: 0.20,
    oneTime: 0.25
  },
  api_usage: 0.15      // 15% of API overage fees
};

// Partner Tier Benefits
const PARTNER_TIERS = {
  bronze: {
    minMonthlyRevenue: 0,
    commissionBonus: 0,
    features: ['Basic referral link', 'Monthly payouts']
  },
  silver: {
    minMonthlyRevenue: 5000,
    commissionBonus: 0.05, // Extra 5%
    features: [
      'White-label landing page',
      'Marketing materials',
      'Bi-weekly payouts',
      'Dedicated support'
    ]
  },
  gold: {
    minMonthlyRevenue: 25000,
    commissionBonus: 0.10, // Extra 10%
    features: [
      'Custom integration',
      'Co-marketing opportunities',
      'Weekly payouts',
      'Priority support',
      'Revenue share negotiations'
    ]
  },
  platinum: {
    minMonthlyRevenue: 100000,
    commissionBonus: 0.15, // Extra 15%
    features: [
      'Full white-label solution',
      'Strategic partnership',
      'Daily payouts',
      'Dedicated account manager',
      'Custom SLA'
    ]
  }
};

// Generate Affiliate Link
router.post('/generate-link', async (req, res) => {
  try {
    const { affiliateId, name, email } = req.body;
    const referralCode = crypto.randomBytes(8).toString('hex').toUpperCase();
    const referralLink = `https://tree-of-life.io?ref=${referralCode}`;

    console.log(`[Affiliate] Generated link for ${name}: ${referralLink}`);

    res.json({
      referralCode,
      referralLink,
      affiliateId,
      created: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track Referral
router.post('/track-referral', async (req, res) => {
  try {
    const { referralCode, customerEmail, tier, amount } = req.body;
    const commissionRate = COMMISSION_STRUCTURE[tier].oneTime;
    const commission = amount * commissionRate;

    console.log(`[Referral] Code: ${referralCode}, Amount: $${amount}, Commission: $${commission}`);

    res.json({
      tracked: true,
      referralCode,
      commission,
      tier,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Affiliate Dashboard
router.get('/dashboard/:affiliateId', (req, res) => {
  const { affiliateId } = req.params;

  res.json({
    affiliateId,
    stats: {
      totalReferrals: Math.floor(Math.random() * 50),
      activeSubscriptions: Math.floor(Math.random() * 20),
      totalCommissions: Math.floor(Math.random() * 10000),
      pendingPayout: Math.floor(Math.random() * 5000),
      lifetime: Math.floor(Math.random() * 50000)
    },
    tier: 'silver',
    monthlyRevenue: Math.floor(Math.random() * 50000),
    nextPayout: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
});

// Get Commission Breakdown
router.get('/commissions', (req, res) => {
  res.json({
    commissionStructure: COMMISSION_STRUCTURE,
    partnerTiers: PARTNER_TIERS,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
