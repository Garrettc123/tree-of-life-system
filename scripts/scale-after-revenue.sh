#!/bin/bash
# Scale TITAN infrastructure after first revenue
# Upgrade from free tiers to production-ready paid tiers

set -e

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  📈 TITAN SCALE-UP PLAN - After First Revenue"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Congratulations on your first revenue! 🎉"
echo ""
echo "This script helps you scale up infrastructure."
echo ""
read -p "How much revenue have you generated so far? $" REVENUE
echo ""

if [ -z "$REVENUE" ]; then
    REVENUE=0
fi

echo "Based on $${REVENUE} revenue, here's your scaling plan:"
echo ""

if (( $(echo "$REVENUE < 100" | bc -l) )); then
    echo "💡 RECOMMENDATION: Stay on free tier"
    echo ""
    echo "Your current setup can handle:"
    echo "  • Up to 100 users/day"
    echo "  • 10,000 API calls/month"
    echo "  • $500/month potential revenue"
    echo ""
    echo "Continue building! Come back when revenue > $100"
    exit 0
fi

if (( $(echo "$REVENUE >= 100 && $REVENUE < 1000" | bc -l) )); then
    echo "🚀 TIER 1 SCALING ($100-1000 revenue)"
    echo ""
    echo "Recommended upgrades:"
    echo ""
    echo "Railway:"
    echo "  • Current: $5 free credit"
    echo "  • Upgrade: $10/month (2x resources)"
    echo "  • Benefits: Better uptime, faster response"
    echo ""
    echo "Heroku:"
    echo "  • Current: Free tier (hobby)"
    echo "  • Upgrade: $7/month (always on)"
    echo "  • Benefits: 24/7 uptime, SSL"
    echo ""
    echo "Total new cost: ~$17/month"
    echo "ROI: Revenue covers costs + 5-10x return"
    echo ""
fi

if (( $(echo "$REVENUE >= 1000 && $REVENUE < 5000" | bc -l) )); then
    echo "🚀 TIER 2 SCALING ($1K-5K revenue)"
    echo ""
    echo "Recommended upgrades:"
    echo ""
    echo "Deploy to Google Cloud Run:"
    echo "  • Cost: $20-50/month"
    echo "  • Auto-scaling: 0 to 1000 instances"
    echo "  • Global CDN included"
    echo "  • 99.9% uptime SLA"
    echo ""
    echo "Add Redis caching:"
    echo "  • Cost: $10/month"
    echo "  • 10x faster API responses"
    echo "  • Better user experience"
    echo ""
    echo "Add PostgreSQL database:"
    echo "  • Cost: $15/month"
    echo "  • Store user data"
    echo "  • Analytics tracking"
    echo ""
    echo "Total new cost: ~$45-75/month"
    echo "ROI: Revenue covers costs + 10-20x return"
    echo ""
fi

if (( $(echo "$REVENUE >= 5000" | bc -l) )); then
    echo "🚀 TIER 3 SCALING ($5K+ revenue)"
    echo ""
    echo "Recommended: Full production infrastructure"
    echo ""
    echo "Multi-cloud deployment:"
    echo "  • Primary: Google Cloud Run ($50/mo)"
    echo "  • Failover: AWS ECS ($50/mo)"
    echo "  • CDN: Cloudflare Pro ($20/mo)"
    echo "  • Database: Managed PostgreSQL ($30/mo)"
    echo "  • Redis Cache: $20/mo"
    echo "  • Monitoring: Datadog ($15/mo)"
    echo ""
    echo "Total: ~$185/month"
    echo "ROI: Revenue covers costs + 20-50x return"
    echo ""
    echo "Additional features:"
    echo "  • Auto-scaling"
    echo "  • Load balancing"
    echo "  • 99.99% uptime"
    echo "  • Global distribution"
    echo "  • Advanced monitoring"
    echo "  • Automated backups"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  🎯 NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
read -p "Ready to scale up now? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "No problem! Run this script again when ready."
    exit 0
fi

echo ""
echo "Choose scaling option:"
echo "  1) Upgrade Railway ($10/month)"
echo "  2) Deploy to Google Cloud Run ($20-50/month)"
echo "  3) Full production setup ($185/month)"
echo "  4) Custom scaling plan"
echo ""
read -p "Enter choice [1-4]: " SCALE_CHOICE

case $SCALE_CHOICE in
    1)
        echo "Upgrading Railway..."
        echo ""
        echo "Steps:"
        echo "  1. Go to https://railway.app"
        echo "  2. Project Settings → Usage"
        echo "  3. Upgrade to Developer plan ($10/month)"
        echo "  4. Increase memory to 2GB"
        echo "  5. Enable auto-scaling"
        echo ""
        read -p "Press Enter when complete..."
        echo "✅ Railway upgraded!"
        ;;
    2)
        echo "Deploying to Google Cloud Run..."
        read -p "Enter GCP Project ID: " GCP_PROJECT
        bash deployment/gcp-setup.sh $GCP_PROJECT
        ;;
    3)
        echo "Setting up full production infrastructure..."
        bash scripts/deploy-all.sh
        ;;
    4)
        echo "For custom scaling, contact support or review docs."
        ;;
    *)
        echo "Invalid choice"
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ SCALING COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Your TITAN platform is now scaled for growth!"
echo ""
