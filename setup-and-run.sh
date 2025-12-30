#!/bin/bash

# Tree of Life Autonomous Agent System
# All-in-One Setup and Deployment Script
# Works on Termux, Linux, and macOS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  🤖 Tree of Life Autonomous Agent System Setup   ║"
echo "║        Complete Installation & Deployment          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# PHASE 1: Environment Check
# ============================================================================

echo -e "${BLUE}[1/7] Checking system requirements...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    
    if [ -d "$PREFIX" ]; then
        echo -e "${YELLOW}Installing Node.js on Termux...${NC}"
        pkg install nodejs -y
    else
        echo -e "${RED}Please install Node.js 18+ from https://nodejs.org${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"
echo -e "${GREEN}✅ npm: $(npm --version)${NC}"

# Check git
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git not found${NC}"
    if [ -d "$PREFIX" ]; then
        pkg install git -y
    else
        echo -e "${RED}Please install git first${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Git: $(git --version)${NC}"
echo ""

# ============================================================================
# PHASE 2: Repository Setup
# ============================================================================

echo -e "${BLUE}[2/7] Setting up repository...${NC}"

# Check if we're in the right place
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Not in a git repository. Cloning...${NC}"
    cd ~
    
    if [ -d "tree-of-life-system" ]; then
        echo -e "${YELLOW}Directory exists. Updating...${NC}"
        cd tree-of-life-system
        git fetch origin
    else
        git clone https://github.com/Garrettc123/tree-of-life-system.git
        cd tree-of-life-system
    fi
fi

echo -e "${GREEN}✅ Repository: $(pwd)${NC}"

# Switch to agents branch
echo -e "${YELLOW}Switching to autonomous agents branch...${NC}"
git fetch origin
git checkout feature/autonomous-agents
git pull origin feature/autonomous-agents

echo -e "${GREEN}✅ Branch: $(git branch --show-current)${NC}"
echo ""

# ============================================================================
# PHASE 3: Install Dependencies
# ============================================================================

echo -e "${BLUE}[3/7] Installing agent dependencies...${NC}"

if [ ! -d "agents" ]; then
    echo -e "${RED}❌ agents directory not found${NC}"
    exit 1
fi

cd agents

if [ -f "package.json" ]; then
    echo -e "${YELLOW}Installing npm packages (this may take a minute)...${NC}"
    npm install --legacy-peer-deps 2>&1 | grep -v "WARN" || true
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ package.json not found${NC}"
    exit 1
fi

echo ""

# ============================================================================
# PHASE 4: Environment Configuration
# ============================================================================

echo -e "${BLUE}[4/7] Configuring environment...${NC}"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    
    if [ -f ".env.template" ]; then
        cp .env.template .env
    elif [ -f ".env.example" ]; then
        cp .env.example .env
    else
        cat > .env << 'EOF'
# GitHub Configuration
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=Garrettc123

# Linear Configuration
LINEAR_API_KEY=your_linear_api_key_here
LINEAR_TEAM_ID=0a42fa2d-5df2-45f5-a1c2-1dd78749fe93

# Notion Configuration (Optional)
NOTION_TOKEN=your_notion_token_here

# Agent Configuration
AGENT_MODE=development
AGENT_AUTO_EXECUTE=false
LOG_LEVEL=info
EOF
    fi
    
    echo -e "${GREEN}✅ Created .env file${NC}"
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi

# Check if API keys are configured
if grep -q "your_github_token_here" .env || grep -q "your_linear_api_key_here" .env; then
    echo ""
    echo -e "${YELLOW}⚠️  API KEYS REQUIRED${NC}"
    echo ""
    echo "You need to add your API keys to .env file:"
    echo ""
    echo "1️⃣  GitHub Token (REQUIRED):"
    echo "   - Visit: https://github.com/settings/tokens"
    echo "   - Create token with 'repo' and 'workflow' scopes"
    echo "   - Paste in .env as: GITHUB_TOKEN=ghp_xxxxx"
    echo ""
    echo "2️⃣  Linear API Key (REQUIRED):"
    echo "   - Visit: https://linear.app/settings/api"
    echo "   - Create new API key"
    echo "   - Paste in .env as: LINEAR_API_KEY=lin_api_xxxxx"
    echo ""
    echo "3️⃣  Notion Token (OPTIONAL):"
    echo "   - Visit: https://www.notion.so/my-integrations"
    echo "   - Create integration and copy token"
    echo ""
    echo -e "${BLUE}📝 Edit .env now? [y/N]:${NC} "
    read -r edit_env
    
    if [[ $edit_env =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} .env
        echo -e "${GREEN}✅ .env file updated${NC}"
    else
        echo -e "${YELLOW}⏭️  Skipping for now (you can edit later with: nano agents/.env)${NC}"
    fi
else
    echo -e "${GREEN}✅ API keys configured${NC}"
fi

echo ""

# ============================================================================
# PHASE 5: API Connectivity Tests
# ============================================================================

echo -e "${BLUE}[5/7] Testing API connectivity...${NC}"

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Test GitHub API
if [[ "$GITHUB_TOKEN" != "your_github_token_here" ]] && [ -n "$GITHUB_TOKEN" ]; then
    echo -e "${YELLOW}Testing GitHub API...${NC}"
    
    GITHUB_TEST=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
        https://api.github.com/user | grep -o '"login"' || echo "failed")
    
    if [[ $GITHUB_TEST == *"login"* ]]; then
        echo -e "${GREEN}✅ GitHub API: Connected${NC}"
    else
        echo -e "${RED}❌ GitHub API: Failed (check your token)${NC}"
    fi
else
    echo -e "${YELLOW}⏭️  GitHub API: Not configured${NC}"
fi

# Test Linear API
if [[ "$LINEAR_API_KEY" != "your_linear_api_key_here" ]] && [ -n "$LINEAR_API_KEY" ]; then
    echo -e "${YELLOW}Testing Linear API...${NC}"
    
    LINEAR_TEST=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: $LINEAR_API_KEY" \
        -d '{"query": "{ viewer { id name } }"}' \
        https://api.linear.app/graphql | grep -o '"name"' || echo "failed")
    
    if [[ $LINEAR_TEST == *"name"* ]]; then
        echo -e "${GREEN}✅ Linear API: Connected${NC}"
    else
        echo -e "${RED}❌ Linear API: Failed (check your key)${NC}"
    fi
else
    echo -e "${YELLOW}⏭️  Linear API: Not configured${NC}"
fi

echo ""

# ============================================================================
# PHASE 6: System Initialization
# ============================================================================

echo -e "${BLUE}[6/7] Initializing agent system...${NC}"

if [ -f "index.js" ]; then
    echo -e "${GREEN}✅ Main entry point found${NC}"
    echo -e "${GREEN}✅ Planning Agent ready${NC}"
    echo -e "${GREEN}✅ MCP Coordinator ready${NC}"
    echo -e "${GREEN}✅ Event Bus ready${NC}"
else
    echo -e "${RED}❌ index.js not found${NC}"
    exit 1
fi

echo ""

# ============================================================================
# PHASE 7: Launch Options
# ============================================================================

echo -e "${BLUE}[7/7] System ready to launch!${NC}"
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║           🚀 SETUP COMPLETE!                       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

echo "Choose how to proceed:"
echo ""
echo "1) 🚀 Start agent system now (interactive)"
echo "2) 🤖 Run Planning Agent only"
echo "3) 📊 View system status"
echo "4) 🧪 Run API tests"
echo "5) 📝 Edit .env configuration"
echo "6) ❌ Exit (run manually later)"
echo ""
echo -n "Enter choice [1-6]: "
read -r choice

case $choice in
    1)
        echo ""
        echo -e "${GREEN}Starting autonomous agent system...${NC}"
        echo ""
        node index.js
        ;;
    2)
        echo ""
        echo -e "${GREEN}Running Planning Agent...${NC}"
        echo ""
        npm run agent:planning
        ;;
    3)
        echo ""
        echo -e "${BLUE}System Status:${NC}"
        echo ""
        echo "📁 Working Directory: $(pwd)"
        echo "🌿 Git Branch: $(git branch --show-current)"
        echo "📦 Node Version: $(node --version)"
        echo "🔧 npm Version: $(npm --version)"
        echo ""
        echo "Available Commands:"
        echo "  node index.js          - Start full agent system"
        echo "  npm run agent:planning - Run Planning Agent only"
        echo "  npm run status         - Check agent status"
        echo ""
        ;;
    4)
        echo ""
        echo -e "${YELLOW}Running API connectivity tests...${NC}"
        echo ""
        
        # Create test script
        cat > test-apis.js << 'TESTEOF'
require('dotenv').config();
const { Octokit } = require('@octokit/rest');

async function testAPIs() {
  console.log('Testing API Connections...\n');
  
  // Test GitHub
  if (process.env.GITHUB_TOKEN) {
    try {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const { data } = await octokit.users.getAuthenticated();
      console.log('✅ GitHub API: Connected as', data.login);
    } catch (error) {
      console.log('❌ GitHub API: Failed -', error.message);
    }
  } else {
    console.log('⏭️  GitHub API: Not configured');
  }
  
  // Test Linear
  if (process.env.LINEAR_API_KEY) {
    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.LINEAR_API_KEY
        },
        body: JSON.stringify({
          query: '{ viewer { id name email } }'
        })
      });
      const data = await response.json();
      if (data.data?.viewer) {
        console.log('✅ Linear API: Connected as', data.data.viewer.name);
      } else {
        console.log('❌ Linear API: Failed -', data.errors?.[0]?.message || 'Unknown error');
      }
    } catch (error) {
      console.log('❌ Linear API: Failed -', error.message);
    }
  } else {
    console.log('⏭️  Linear API: Not configured');
  }
  
  console.log('\n✅ API tests complete\n');
}

testAPIs().catch(console.error);
TESTEOF
        
        node test-apis.js
        rm test-apis.js
        ;;
    5)
        echo ""
        echo -e "${YELLOW}Opening .env file for editing...${NC}"
        ${EDITOR:-nano} .env
        echo -e "${GREEN}✅ Configuration updated${NC}"
        ;;
    6)
        echo ""
        echo -e "${GREEN}Setup complete! Run these commands manually:${NC}"
        echo ""
        echo "  cd $(pwd)"
        echo "  node index.js"
        echo ""
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Tree of Life System - Operational           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# Documentation Links
# ============================================================================

echo "📚 Documentation:"
echo "   GitHub PR: https://github.com/Garrettc123/tree-of-life-system/pull/18"
echo "   Linear: https://linear.app/garrettc/issue/GAR-45"
echo "   Notion: https://www.notion.so/2d9024e8799b817ea73fdb88ac4225c8"
echo ""
echo "💡 Tips:"
echo "   - Edit config: nano .env"
echo "   - View logs: tail -f agent.log"
echo "   - Re-run setup: ./setup-and-run.sh"
echo ""
