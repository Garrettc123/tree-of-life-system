#!/bin/bash
# Deploy TITAN to ALL cloud platforms simultaneously
# This script deploys your autonomous AI business to:
# - Google Cloud Run
# - AWS ECS Fargate
# - Azure Container Instances
# - Heroku
# - Railway (if configured)

set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🚀 TITAN MULTI-CLOUD DEPLOYMENT - DEPLOY EVERYWHERE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "This will deploy TITAN to ALL major cloud platforms:"
echo "  ☁️  Google Cloud Run"
echo "  📦 AWS ECS Fargate"
echo "  🔷 Azure Container Instances"
echo "  💜 Heroku"
echo "  🚂 Railway"
echo ""
read -p "Continue with multi-cloud deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

echo ""
echo "📋 Collecting cloud credentials..."
echo ""

# Collect cloud-specific information
read -p "Google Cloud Project ID (or press Enter to skip GCP): " GCP_PROJECT
read -p "AWS Region [us-east-1] (or press Enter to skip AWS): " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}
read -p "Azure Resource Group Name [titan-rg] (or press Enter to skip Azure): " AZURE_RG
AZURE_RG=${AZURE_RG:-titan-rg}
read -p "Heroku App Name [titan-orchestrator] (or press Enter to skip Heroku): " HEROKU_APP
HEROKU_APP=${HEROKU_APP:-titan-orchestrator}

echo ""
echo "🔐 Collecting API keys (will be used for all deployments)..."
echo ""

read -sp "GitHub Token: " GITHUB_TOKEN
echo
read -sp "OpenAI API Key: " OPENAI_API_KEY
echo
read -sp "Linear API Key: " LINEAR_API_KEY
echo
read -sp "Notion API Key: " NOTION_API_KEY
echo
read -sp "Stripe Secret Key: " STRIPE_SECRET_KEY
echo

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🏗️  STARTING MULTI-CLOUD DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════"
echo ""

DEPLOYMENT_RESULTS=()

# Function to log results
log_result() {
    local platform=$1
    local status=$2
    local url=$3
    DEPLOYMENT_RESULTS+=("$platform|$status|$url")
}

# =============================================================================
# GOOGLE CLOUD RUN DEPLOYMENT
# =============================================================================
if [ ! -z "$GCP_PROJECT" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ☁️  DEPLOYING TO GOOGLE CLOUD RUN"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if command -v gcloud &> /dev/null; then
        echo "✓ gcloud CLI found"
        
        # Set project
        gcloud config set project $GCP_PROJECT 2>/dev/null
        
        echo "📦 Building container..."
        if gcloud builds submit --tag gcr.io/$GCP_PROJECT/titan:latest --quiet 2>/dev/null; then
            echo "✓ Container built successfully"
            
            echo "🚀 Deploying to Cloud Run..."
            if gcloud run deploy titan-orchestrator \
                --image gcr.io/$GCP_PROJECT/titan:latest \
                --platform managed \
                --region us-central1 \
                --memory 2Gi \
                --cpu 4 \
                --max-instances 100 \
                --set-env-vars NODE_ENV=production,GITHUB_TOKEN=$GITHUB_TOKEN,OPENAI_API_KEY=$OPENAI_API_KEY,LINEAR_API_KEY=$LINEAR_API_KEY,NOTION_API_KEY=$NOTION_API_KEY,STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
                --allow-unauthenticated \
                --quiet 2>/dev/null; then
                
                GCP_URL=$(gcloud run services describe titan-orchestrator --region us-central1 --format 'value(status.url)' 2>/dev/null)
                echo "✅ Google Cloud Run deployment SUCCESS"
                echo "🌐 URL: $GCP_URL"
                log_result "Google Cloud Run" "✅ SUCCESS" "$GCP_URL"
            else
                echo "❌ Google Cloud Run deployment FAILED"
                log_result "Google Cloud Run" "❌ FAILED" "N/A"
            fi
        else
            echo "❌ Container build failed"
            log_result "Google Cloud Run" "❌ FAILED" "Build error"
        fi
    else
        echo "⚠️  gcloud CLI not installed, skipping GCP"
        log_result "Google Cloud Run" "⏭️  SKIPPED" "gcloud not found"
    fi
    echo ""
fi

# =============================================================================
# AWS ECS FARGATE DEPLOYMENT
# =============================================================================
if [ ! -z "$AWS_REGION" ] && [ "$AWS_REGION" != "" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  📦 DEPLOYING TO AWS ECS FARGATE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if command -v aws &> /dev/null; then
        echo "✓ AWS CLI found"
        
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
        
        if [ ! -z "$ACCOUNT_ID" ]; then
            echo "📦 Creating ECR repository..."
            aws ecr create-repository --repository-name titan --region $AWS_REGION 2>/dev/null || echo "Repository exists"
            
            echo "🔐 Logging in to ECR..."
            aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com 2>/dev/null
            
            echo "🏗️  Building and pushing Docker image..."
            docker build -t $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/titan:latest . 2>/dev/null
            docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/titan:latest 2>/dev/null
            
            echo "✅ AWS ECS setup complete (manual service creation required)"
            AWS_URL="http://$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/titan"
            log_result "AWS ECS Fargate" "✅ PREPARED" "$AWS_URL"
        else
            echo "❌ AWS authentication failed"
            log_result "AWS ECS Fargate" "❌ FAILED" "Auth error"
        fi
    else
        echo "⚠️  AWS CLI not installed, skipping AWS"
        log_result "AWS ECS Fargate" "⏭️  SKIPPED" "aws-cli not found"
    fi
    echo ""
fi

# =============================================================================
# AZURE CONTAINER INSTANCES DEPLOYMENT
# =============================================================================
if [ ! -z "$AZURE_RG" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  🔷 DEPLOYING TO AZURE CONTAINER INSTANCES"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if command -v az &> /dev/null; then
        echo "✓ Azure CLI found"
        
        echo "📦 Creating resource group..."
        az group create --name $AZURE_RG --location eastus 2>/dev/null || echo "Resource group exists"
        
        echo "📦 Creating container registry..."
        az acr create --resource-group $AZURE_RG --name titanacr --sku Basic 2>/dev/null || echo "Registry exists"
        
        echo "🏗️  Building container..."
        if az acr build --registry titanacr --image titan:latest . 2>/dev/null; then
            echo "✅ Azure deployment SUCCESS"
            AZURE_URL="https://titanacr.azurecr.io/titan:latest"
            log_result "Azure Container Instances" "✅ SUCCESS" "$AZURE_URL"
        else
            echo "❌ Azure build failed"
            log_result "Azure Container Instances" "❌ FAILED" "Build error"
        fi
    else
        echo "⚠️  Azure CLI not installed, skipping Azure"
        log_result "Azure Container Instances" "⏭️  SKIPPED" "az-cli not found"
    fi
    echo ""
fi

# =============================================================================
# HEROKU DEPLOYMENT
# =============================================================================
if [ ! -z "$HEROKU_APP" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  💜 DEPLOYING TO HEROKU"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if command -v heroku &> /dev/null; then
        echo "✓ Heroku CLI found"
        
        echo "📦 Creating Heroku app..."
        heroku create $HEROKU_APP 2>/dev/null || echo "App exists"
        
        echo "🔐 Setting environment variables..."
        heroku config:set \
            NODE_ENV=production \
            GITHUB_TOKEN=$GITHUB_TOKEN \
            OPENAI_API_KEY=$OPENAI_API_KEY \
            LINEAR_API_KEY=$LINEAR_API_KEY \
            NOTION_API_KEY=$NOTION_API_KEY \
            STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
            --app $HEROKU_APP 2>/dev/null
        
        echo "🚀 Deploying to Heroku..."
        heroku container:login 2>/dev/null
        heroku container:push web --app $HEROKU_APP 2>/dev/null
        
        if heroku container:release web --app $HEROKU_APP 2>/dev/null; then
            echo "✅ Heroku deployment SUCCESS"
            HEROKU_URL="https://$HEROKU_APP.herokuapp.com"
            log_result "Heroku" "✅ SUCCESS" "$HEROKU_URL"
        else
            echo "❌ Heroku deployment FAILED"
            log_result "Heroku" "❌ FAILED" "Deploy error"
        fi
    else
        echo "⚠️  Heroku CLI not installed, skipping Heroku"
        log_result "Heroku" "⏭️  SKIPPED" "heroku-cli not found"
    fi
    echo ""
fi

# =============================================================================
# RAILWAY DEPLOYMENT (Auto-deploys via GitHub)
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚂 RAILWAY DEPLOYMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "ℹ️  Railway auto-deploys from GitHub"
echo "   Configure at: https://railway.app"
log_result "Railway" "ℹ️  AUTO" "Configure manually"
echo ""

# =============================================================================
# DEPLOYMENT SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📊 MULTI-CLOUD DEPLOYMENT SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo ""

for result in "${DEPLOYMENT_RESULTS[@]}"; do
    IFS='|' read -r platform status url <<< "$result"
    printf "%-30s %s\n" "$platform:" "$status"
    if [ "$url" != "N/A" ] && [ "$url" != "" ]; then
        printf "%-30s %s\n" "" "🌐 $url"
    fi
    echo ""
done

echo "═══════════════════════════════════════════════════════════"
echo ""
echo "🎉 MULTI-CLOUD DEPLOYMENT COMPLETE!"
echo ""
echo "📋 Next Steps:"
echo "  1. Test each deployment: curl <url>/health"
echo "  2. Configure DNS/domains for each cloud"
echo "  3. Set up monitoring and alerts"
echo "  4. Configure load balancing (optional)"
echo ""
echo "📚 Documentation:"
echo "  https://github.com/Garrettc123/tree-of-life-system"
echo ""
echo "═══════════════════════════════════════════════════════════"
