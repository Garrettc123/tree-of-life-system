#!/bin/bash
# Deploy TITAN on FREE/CHEAPEST tiers - $0-10/month total
# Scale up after first revenue

set -e

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  💰 TITAN FREE TIER DEPLOYMENT - Start at $0/month"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "This deploys TITAN using FREE tiers only:"
echo "  • Railway: $5 free credit/month"
echo "  • Heroku: Free hobby tier (550 hours/month)"
echo "  • Google Cloud: $300 credit for 90 days"
echo ""
echo "Total cost: $0-5/month until you get revenue"
echo ""
read -p "Continue with free tier deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo ""
echo "📋 Collecting credentials..."
echo ""

read -sp "GitHub Token: " GITHUB_TOKEN
echo
read -sp "OpenAI API Key: " OPENAI_API_KEY
echo
read -sp "Linear API Key (optional): " LINEAR_API_KEY
echo
read -sp "Notion API Key (optional): " NOTION_API_KEY
echo
read -sp "Stripe Secret Key (optional): " STRIPE_SECRET_KEY
echo

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 DEPLOYING TO FREE TIERS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# OPTION 1: RAILWAY (RECOMMENDED - $5 free credit/month)
# ============================================================================
echo "───────────────────────────────────────────────────────────────"
echo "  🚂 Railway Deployment (FREE $5 credit/month)"
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "Railway provides $5/month free credit."
echo "TITAN typically uses $5-10/month on Railway."
echo ""
echo "Setup:"
echo "  1. Visit https://railway.app"
echo "  2. Sign in with GitHub"
echo "  3. New Project → Deploy from GitHub"
echo "  4. Select: tree-of-life-system"
echo "  5. Add environment variables:"
echo ""
echo "Required Variables:"
echo "  NODE_ENV=production"
echo "  GITHUB_TOKEN=$GITHUB_TOKEN"
echo "  OPENAI_API_KEY=$OPENAI_API_KEY"
echo "  LINEAR_API_KEY=$LINEAR_API_KEY"
echo "  NOTION_API_KEY=$NOTION_API_KEY"
echo "  STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY"
echo ""
read -p "Press Enter when Railway is configured..."

# ============================================================================
# OPTION 2: HEROKU FREE TIER (Backup)
# ============================================================================
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "  💜 Heroku Free Tier (550 hours/month FREE)"
echo "───────────────────────────────────────────────────────────────"
echo ""
read -p "Deploy to Heroku as backup? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v heroku &> /dev/null; then
        echo "✓ Heroku CLI found"
        
        read -p "Enter Heroku app name: " HEROKU_APP
        
        echo "Creating Heroku app..."
        heroku create $HEROKU_APP 2>/dev/null || echo "App exists"
        
        echo "Setting environment variables..."
        heroku config:set \
            NODE_ENV=production \
            GITHUB_TOKEN=$GITHUB_TOKEN \
            OPENAI_API_KEY=$OPENAI_API_KEY \
            LINEAR_API_KEY=$LINEAR_API_KEY \
            NOTION_API_KEY=$NOTION_API_KEY \
            STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
            --app $HEROKU_APP
        
        echo "Deploying..."
        heroku container:login
        heroku container:push web --app $HEROKU_APP
        heroku container:release web --app $HEROKU_APP
        
        echo "✅ Heroku deployed: https://$HEROKU_APP.herokuapp.com"
    else
        echo "⚠️  Heroku CLI not installed"
        echo "Install: brew install heroku/brew/heroku"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  📊 FREE TIER DEPLOYMENT SUMMARY"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Deployed to:"
echo "  🚂 Railway: https://railway.app (Check your dashboard)"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  💜 Heroku: https://$HEROKU_APP.herokuapp.com"
fi
echo ""
echo "Current costs:"
echo "  • Railway: $0-5/month (within free credit)"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  • Heroku: $0/month (free tier)"
fi
echo "  • Total: $0-5/month"
echo ""
echo "💰 REVENUE FIRST, THEN SCALE:"
echo ""
echo "When you get first revenue ($100+):"
echo "  1. Run: bash scripts/scale-after-revenue.sh"
echo "  2. Upgrades to paid tiers with better performance"
echo "  3. Enables auto-scaling"
echo "  4. Adds monitoring & alerts"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ FREE TIER DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
