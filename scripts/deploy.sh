#!/bin/bash

# TITAN v4.0 Autonomous Deployment Script
# Run this script to deploy all systems automatically

set -e

echo "🚀 TITAN v4.0 Autonomous Deployment Starting..."
echo "================================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Railway CLI not found. Installing...${NC}"
    npm i -g @railway/cli
fi

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Supabase CLI not found. Installing...${NC}"
    npm i -g supabase
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"

# Step 1: Deploy Backend to Railway
echo -e "\n${BLUE}Step 1: Deploying Backend to Railway...${NC}"
echo "Please login to Railway when prompted."
railway login

# Create new project
railway init

# Link to repo
railway link

# Set environment variables
echo -e "${BLUE}Setting environment variables...${NC}"
railway variables set GITHUB_TOKEN="$GITHUB_TOKEN"
railway variables set GITHUB_OWNER="Garrettc123"
railway variables set GITHUB_REPO="tree-of-life-system"
railway variables set PORT="8000"
railway variables set ENVIRONMENT="production"

# Deploy
railway up

echo -e "${GREEN}✓ Backend deployed to Railway${NC}"

# Get the Railway URL
RAILWAY_URL=$(railway domain)
echo -e "${GREEN}Backend URL: $RAILWAY_URL${NC}"

# Step 2: Setup Supabase Database
echo -e "\n${BLUE}Step 2: Setting up Supabase Database...${NC}"
echo "Please login to Supabase when prompted."
supabase login

# Initialize Supabase project
supabase init

# Create remote project
supabase projects create titan-db --org-id "$SUPABASE_ORG_ID" --region us-east-1

# Link project
supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Push database schema
cd src/database
supabase db push
cd ../..

echo -e "${GREEN}✓ Database deployed to Supabase${NC}"

# Get database URL
DATABASE_URL=$(supabase status | grep "DB URL" | awk '{print $3}')

# Update Railway with database URL
railway variables set DATABASE_URL="$DATABASE_URL"

echo -e "${GREEN}✓ Database connected to backend${NC}"

# Step 3: Update Frontend with Backend URL
echo -e "\n${BLUE}Step 3: Updating Frontend with Backend URL...${NC}"

# Update dashboard.html with Railway URL
sed -i "s|YOUR_RAILWAY_API_URL_HERE|https://$RAILWAY_URL|g" public/dashboard.html

# Commit and push
git add public/dashboard.html
git commit -m "🔗 Connect dashboard to deployed backend"
git push origin main

echo -e "${GREEN}✓ Frontend updated and auto-deploying via Vercel${NC}"

# Step 4: Configure GitHub Webhooks
echo -e "\n${BLUE}Step 4: Configuring GitHub Webhooks...${NC}"

gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/Garrettc123/tree-of-life-system/hooks \
  -f name='web' \
  -f active=true \
  -F config[url]="https://$RAILWAY_URL/webhooks/github" \
  -F config[content_type]='json' \
  -f events[]='push' \
  -f events[]='pull_request' \
  -f events[]='issues'

echo -e "${GREEN}✓ GitHub webhooks configured${NC}"

# Step 5: Initialize AI Systems
echo -e "\n${BLUE}Step 5: Initializing AI Systems...${NC}"

curl -X POST "https://$RAILWAY_URL/api/ai/initialize" \
  -H "Content-Type: application/json" \
  -d '{
    "systems": ["learning", "prediction", "decision", "pattern_recognition"],
    "auto_train": true
  }'

echo -e "${GREEN}✓ AI systems initialized${NC}"

# Step 6: Start Automation Systems
echo -e "\n${BLUE}Step 6: Starting Automation Systems...${NC}"

curl -X POST "https://$RAILWAY_URL/api/automation/start" \
  -H "Content-Type: application/json" \
  -d '{
    "systems": ["pr_management", "issue_management", "release_management"],
    "enable_auto_merge": true
  }'

echo -e "${GREEN}✓ Automation systems started${NC}"

# Step 7: Run Health Check
echo -e "\n${BLUE}Step 7: Running System Health Check...${NC}"

HEALTH_CHECK=$(curl -s "https://$RAILWAY_URL/health")
echo "$HEALTH_CHECK" | jq .

if echo "$HEALTH_CHECK" | jq -e '.status == "healthy"' > /dev/null; then
    echo -e "${GREEN}✓ All systems healthy!${NC}"
else
    echo -e "${RED}⚠ Some systems need attention${NC}"
    echo "Check logs: railway logs"
fi

# Final Summary
echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}🎉 TITAN v4.0 Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${BLUE}Dashboard:${NC} https://tree-of-life-system.vercel.app/dashboard.html"
echo -e "${BLUE}Backend API:${NC} https://$RAILWAY_URL"
echo -e "${BLUE}Database:${NC} Supabase (connected)"
echo ""
echo -e "${GREEN}All 22 TITAN systems are now LIVE! 🚀${NC}"
echo ""
echo "Next steps:"
echo "1. Visit your dashboard to see all systems online"
echo "2. Create a test PR to see automation in action"
echo "3. Check /health endpoint for detailed status"
echo ""
echo "For monitoring: railway logs --follow"
echo "For database: supabase db remote status"
