#!/bin/bash
# Deploy TITAN to Google Cloud Run
echo "🚀 Google Cloud Run Deployment"

PROJECT_ID="${1:-your-project}"
REGION="us-central1"

echo "Setting up Google Cloud..."
gcloud config set project $PROJECT_ID

echo "Building container..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/titan:latest

echo "Deploying to Cloud Run..."
gcloud run deploy titan-orchestrator \
  --image gcr.io/$PROJECT_ID/titan:latest \
  --platform managed \
  --region $REGION \
  --memory 2Gi \
  --cpu 4 \
  --timeout 3600 \
  --set-env-vars NODE_ENV=production

echo "✅ TITAN deployed to Google Cloud Run!"
