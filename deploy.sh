#!/bin/bash

# Tree of Life System - Deployment Script
# Run this after adding your API keys to .env

set -e

echo "🌳 Tree of Life System - Automated Deployment"
echo "================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and add your API keys:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "Please start Docker and try again."
    exit 1
fi

echo "✅ .env file found"
echo "✅ Docker is running"
echo ""

# Load environment variables
source .env

# Validate required API keys
echo "🔍 Validating API keys..."

if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "your_github_personal_access_token" ]; then
    echo "⚠️  Warning: GITHUB_TOKEN not set or using default"
fi

if [ -z "$LINEAR_API_KEY" ] || [ "$LINEAR_API_KEY" = "your_linear_api_key" ]; then
    echo "⚠️  Warning: LINEAR_API_KEY not set or using default"
fi

if [ -z "$NOTION_API_KEY" ] || [ "$NOTION_API_KEY" = "your_notion_integration_token" ]; then
    echo "⚠️  Warning: NOTION_API_KEY not set or using default"
fi

if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key" ]; then
    echo "⚠️  Warning: OPENAI_API_KEY not set or using default"
fi

echo ""
echo "📦 Building Docker images..."
docker-compose build --no-cache

echo ""
echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for databases to initialize (30 seconds)..."
sleep 30

echo ""
echo "🔍 Checking service health..."
docker-compose ps

echo ""
echo "🧪 Testing service endpoints..."

echo "  - Testing Auth Service..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "    ✅ Auth Service is running"
else
    echo "    ⚠️  Auth Service may not be ready yet"
fi

echo "  - Testing AI Engine..."
if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "    ✅ AI Engine is running"
else
    echo "    ⚠️  AI Engine may not be ready yet"
fi

echo "  - Testing Orchestrator..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "    ✅ Orchestrator is running"
else
    echo "    ⚠️  Orchestrator may not be ready yet"
fi

echo ""
echo "================================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo "================================================"
echo ""
echo "🌐 Your services are now available at:"
echo "  - Main Dashboard:  http://localhost:80"
echo "  - Orchestrator:    http://localhost:3000"
echo "  - Auth Service:    http://localhost:3001"
echo "  - AI Engine:       http://localhost:3002"
echo "  - Marketing:       http://localhost:3003"
echo ""
echo "🔄 To start autonomous systems, run:"
echo "  curl -X POST http://localhost:3000/orchestrator/start"
echo "  curl -X POST http://localhost:3003/marketing/activate"
echo "  curl -X POST http://localhost:3002/ai/start"
echo ""
echo "📊 View logs with:"
echo "  docker-compose logs -f"
echo ""
echo "🛑 Stop services with:"
echo "  docker-compose down"
echo ""
echo "🎉 Your Tree of Life System is now live!"
echo ""