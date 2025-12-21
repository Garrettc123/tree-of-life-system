#!/bin/bash
# Quick deploy to the easiest/fastest cloud platform

echo "🚀 TITAN Quick Deploy - Fastest Path to Production"
echo ""
echo "This will deploy TITAN to the easiest platform."
echo ""
echo "Choose deployment target:"
echo "  1) Heroku (easiest, 5 min)"
echo "  2) Google Cloud Run (recommended, 10 min)"
echo "  3) Railway (via GitHub, manual)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo "Deploying to Heroku..."
        bash deployment/heroku-setup.sh
        ;;
    2)
        echo "Deploying to Google Cloud Run..."
        read -p "Enter GCP Project ID: " project
        bash deployment/gcp-setup.sh $project
        ;;
    3)
        echo "Railway deploys automatically from GitHub."
        echo "Visit: https://railway.app"
        echo "Connect your GitHub repo and Railway will auto-deploy."
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
