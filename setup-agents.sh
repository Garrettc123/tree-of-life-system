#!/bin/bash

# Tree of Life Autonomous Agent Setup Script
# Works on Termux and standard Linux/macOS

set -e

echo ""
echo "┌────────────────────────────────────────────────┐"
echo "│  🤖 Tree of Life Agent Setup  │"
echo "└────────────────────────────────────────────────┘"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git not found. Please install git first."
    exit 1
fi

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing..."
    
    # Detect if we're on Termux
    if [ -d "$PREFIX" ]; then
        echo "Detected Termux environment"
        pkg install nodejs -y
    else
        echo "Please install Node.js 18+ from https://nodejs.org"
        exit 1
    fi
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Check current location
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository. Please cd into tree-of-life-system first."
    exit 1
fi

echo "🔄 Fetching latest changes..."
git fetch origin

echo "🌱 Switching to autonomous agents branch..."
git checkout feature/autonomous-agents
git pull origin feature/autonomous-agents

echo ""
echo "✅ On branch: $(git branch --show-current)"
echo ""

# Navigate to agents directory
if [ ! -d "agents" ]; then
    echo "❌ agents directory not found. This branch may not have the latest code."
    exit 1
fi

cd agents
echo "📁 Working directory: $(pwd)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
echo "   (This may take a minute)"
echo ""

npm install --legacy-peer-deps

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Dependencies installed successfully!"
else
    echo ""
    echo "⚠️  Warning: Some dependencies had issues but continuing..."
fi

echo ""

# Setup environment file
if [ ! -f ".env" ]; then
    echo "🔑 Creating .env file..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: You need to add your API keys to .env"
    echo ""
    echo "Edit .env and add:"
    echo "  - GITHUB_TOKEN (from https://github.com/settings/tokens)"
    echo "  - LINEAR_API_KEY (from https://linear.app/settings/api)"
    echo "  - NOTION_TOKEN (optional)"
    echo ""
    echo "Then run: node index.js"
    echo ""
else
    echo "✅ .env file already exists"
    
    # Check if tokens are configured
    if grep -q "your_github_personal_access_token" .env; then
        echo "⚠️  Warning: .env still has placeholder values"
        echo "   Please add your actual API keys"
    else
        echo "✅ API keys appear to be configured"
        echo ""
        echo "🚀 Ready to run!"
        echo ""
        echo "Start the agent system:"
        echo "  node index.js"
        echo ""
        echo "Or run Planning Agent directly:"
        echo "  npm run agent:planning"
    fi
fi

echo ""
echo "┌────────────────────────────────────────────────┐"
echo "│           Setup Complete!           │"
echo "└────────────────────────────────────────────────┘"
echo ""
echo "Next steps:"
echo "1. Configure .env with your API keys"
echo "2. Run: node index.js"
echo ""
echo "Documentation:"
echo "  GitHub PR: https://github.com/Garrettc123/tree-of-life-system/pull/18"
echo "  Linear: https://linear.app/garrettc/issue/GAR-45"
echo "  Notion: https://www.notion.so/2d9024e8799b817ea73fdb88ac4225c8"
echo ""
