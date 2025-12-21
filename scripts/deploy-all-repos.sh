#!/bin/bash
# Deploy ALL GitHub repositories to cloud platforms
# Universal deployment for entire portfolio

set -e

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  🚀 UNIVERSAL MULTI-REPO DEPLOYMENT SYSTEM"
echo "  Deploy ALL 68+ GitHub repositories to ANY cloud"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Define your repositories (key projects to deploy)
REPOS=(
    "tree-of-life-system"
    "revenue-agent-system"
    "product-development-branch"
    "customer-intelligence-branch"
    "marketing-automation-branch"
    "APEX-Universal-AI-Operating-System"
    "NEXUS-Quantum-Intelligence-Framework"
    "intelligent-customer-data-platform"
    "enterprise-feature-flag-system"
    "intelligent-ci-cd-orchestrator"
    "conversational-ai-engine"
    "security-sentinel-framework"
    "distributed-job-orchestration-engine"
    "real-time-streaming-analytics"
    "enterprise-mlops-platform"
    "SINGULARITY-AGI-Research-Platform"
    "TITAN-Autonomous-Business-Empire"
    "ai-ops-studio"
)

GITHUB_USER="Garrettc123"

echo "Found ${#REPOS[@]} repositories to deploy."
echo ""
read -p "Select deployment target:
  1) Railway (Recommended - $5 free/month)
  2) Heroku (Free tier available)
  3) Google Cloud Run (Best performance)
  4) Show all repos and select
  5) Deploy specific repo only
Enter choice [1-5]: " DEPLOY_CHOICE

echo ""

if [ "$DEPLOY_CHOICE" = "4" ]; then
    echo "Available repositories:"
    for i in "${!REPOS[@]}"; do
        echo "  $((i+1)). ${REPOS[$i]}"
    done
    echo ""
    read -p "Enter repo numbers to deploy (space-separated, or 'all'): " SELECTION
    
    if [ "$SELECTION" = "all" ]; then
        SELECTED_REPOS=("${REPOS[@]}")
    else
        SELECTED_REPOS=()
        for num in $SELECTION; do
            idx=$((num-1))
            SELECTED_REPOS+=("${REPOS[$idx]}")
        done
    fi
elif [ "$DEPLOY_CHOICE" = "5" ]; then
    echo "Available repositories:"
    for i in "${!REPOS[@]}"; do
        echo "  $((i+1)). ${REPOS[$i]}"
    done
    echo ""
    read -p "Enter repo number: " REPO_NUM
    idx=$((REPO_NUM-1))
    SELECTED_REPOS=("${REPOS[$idx]}")
else
    SELECTED_REPOS=("${REPOS[@]}")
fi

echo ""
echo "Will deploy ${#SELECTED_REPOS[@]} repositories"
echo ""

# Collect API keys (reuse for all repos)
read -sp "GitHub Token: " GITHUB_TOKEN
echo
read -sp "OpenAI API Key: " OPENAI_API_KEY
echo
read -sp "Other API keys (optional, press Enter to skip): " OTHER_KEYS
echo

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  📦 CLONING AND DEPLOYING REPOSITORIES"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

DEPLOYED_COUNT=0
FAILED_COUNT=0
DEPLOYMENT_URLS=()

for REPO in "${SELECTED_REPOS[@]}"; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  📦 Deploying: $REPO"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Clone if not exists
    if [ ! -d "/tmp/deploy/$REPO" ]; then
        echo "📥 Cloning $REPO..."
        mkdir -p /tmp/deploy
        git clone "https://github.com/$GITHUB_USER/$REPO.git" "/tmp/deploy/$REPO" 2>/dev/null || {
            echo "❌ Failed to clone $REPO"
            FAILED_COUNT=$((FAILED_COUNT + 1))
            continue
        }
    fi
    
    cd "/tmp/deploy/$REPO"
    
    # Detect project type
    if [ -f "package.json" ]; then
        PROJECT_TYPE="node"
        START_CMD="npm start"
    elif [ -f "requirements.txt" ] || [ -f "setup.py" ]; then
        PROJECT_TYPE="python"
        START_CMD="python main.py"
    elif [ -f "go.mod" ]; then
        PROJECT_TYPE="go"
        START_CMD="./main"
    else
        PROJECT_TYPE="unknown"
        START_CMD="npm start"
    fi
    
    echo "🔍 Detected: $PROJECT_TYPE project"
    
    case $DEPLOY_CHOICE in
        1) # Railway
            echo "🚂 Deploying to Railway..."
            echo ""
            echo "Manual Railway setup required:"
            echo "  1. Go to https://railway.app"
            echo "  2. New Project → Deploy from GitHub"
            echo "  3. Select: $REPO"
            echo "  4. Set environment variables:"
            echo "       GITHUB_TOKEN=$GITHUB_TOKEN"
            echo "       OPENAI_API_KEY=$OPENAI_API_KEY"
            echo ""
            read -p "Press Enter when Railway deployment is complete..."
            DEPLOYMENT_URLS+=("$REPO|https://railway.app (manual)")
            DEPLOYED_COUNT=$((DEPLOYED_COUNT + 1))
            ;;
            
        2) # Heroku
            if command -v heroku &> /dev/null; then
                echo "💜 Deploying to Heroku..."
                APP_NAME="$(echo $REPO | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
                
                heroku create $APP_NAME 2>/dev/null || echo "App exists"
                
                heroku config:set \
                    GITHUB_TOKEN=$GITHUB_TOKEN \
                    OPENAI_API_KEY=$OPENAI_API_KEY \
                    --app $APP_NAME 2>/dev/null
                
                git push heroku main 2>/dev/null || git push heroku master 2>/dev/null || {
                    echo "⚠️  Heroku deploy failed, continuing..."
                    FAILED_COUNT=$((FAILED_COUNT + 1))
                    continue
                }
                
                DEPLOYMENT_URLS+=("$REPO|https://$APP_NAME.herokuapp.com")
                DEPLOYED_COUNT=$((DEPLOYED_COUNT + 1))
            else
                echo "⚠️  Heroku CLI not installed"
                FAILED_COUNT=$((FAILED_COUNT + 1))
            fi
            ;;
            
        3) # Google Cloud Run
            if command -v gcloud &> /dev/null; then
                echo "☁️  Deploying to Google Cloud Run..."
                read -p "Enter GCP Project ID: " GCP_PROJECT
                
                gcloud config set project $GCP_PROJECT 2>/dev/null
                gcloud builds submit --tag gcr.io/$GCP_PROJECT/$REPO:latest 2>/dev/null
                
                gcloud run deploy $REPO \
                    --image gcr.io/$GCP_PROJECT/$REPO:latest \
                    --platform managed \
                    --region us-central1 \
                    --set-env-vars GITHUB_TOKEN=$GITHUB_TOKEN,OPENAI_API_KEY=$OPENAI_API_KEY \
                    --quiet 2>/dev/null || {
                    echo "⚠️  GCP deploy failed, continuing..."
                    FAILED_COUNT=$((FAILED_COUNT + 1))
                    continue
                }
                
                URL=$(gcloud run services describe $REPO --region us-central1 --format 'value(status.url)' 2>/dev/null)
                DEPLOYMENT_URLS+=("$REPO|$URL")
                DEPLOYED_COUNT=$((DEPLOYED_COUNT + 1))
            else
                echo "⚠️  gcloud CLI not installed"
                FAILED_COUNT=$((FAILED_COUNT + 1))
            fi
            ;;
    esac
    
    echo "✅ Completed: $REPO"
    echo ""
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  📊 MULTI-REPO DEPLOYMENT SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "Total repositories: ${#SELECTED_REPOS[@]}"
echo "Successfully deployed: $DEPLOYED_COUNT"
echo "Failed: $FAILED_COUNT"
echo ""
echo "Deployment URLs:"
for url_info in "${DEPLOYMENT_URLS[@]}"; do
    IFS='|' read -r repo url <<< "$url_info"
    echo "  • $repo: $url"
done
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "✅ Multi-repo deployment complete!"
echo ""
