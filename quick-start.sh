#!/bin/bash
# Simple Quick Start Script for Tree of Life Agents

set -e

echo ""
echo "🤖 Tree of Life Autonomous Agent System"
echo "========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    echo "Install with: pkg install nodejs -y"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"
echo ""

# Ensure we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Not in agents directory"
    echo "Run: cd ~/tree-of-life-system/agents"
    exit 1
fi

echo "📁 Working in: $(pwd)"
echo ""

# Check .env file
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    
    if [ -f ".env.template" ]; then
        cp .env.template .env
    else
        cat > .env << 'EOF'
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=Garrettc123
LINEAR_API_KEY=your_linear_api_key_here
LINEAR_TEAM_ID=0a42fa2d-5df2-45f5-a1c2-1dd78749fe93
NOTION_TOKEN=your_notion_token_here
AGENT_MODE=development
AGENT_AUTO_EXECUTE=false
LOG_LEVEL=info
EOF
    fi
    
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Add your API keys to .env"
    echo ""
    echo "1. GitHub Token: https://github.com/settings/tokens"
    echo "2. Linear API Key: https://linear.app/settings/api"
    echo ""
    echo "Edit with: nano .env"
    echo ""
    exit 0
fi

echo "✅ .env file exists"
echo ""

# Show menu
echo "Choose an option:"
echo ""
echo "1) 🚀 Start agent system"
echo "2) 🤖 Run Planning Agent only"
echo "3) 🧪 Test API connections"
echo "4) 📝 Edit .env file"
echo "5) ❌ Exit"
echo ""
echo -n "Enter choice [1-5]: "
read choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting agent system..."
        echo ""
        node index.js
        ;;
    2)
        echo ""
        echo "🤖 Running Planning Agent..."
        echo ""
        if [ -f "planning/index.js" ]; then
            node planning/index.js
        else
            echo "❌ Planning agent not found"
        fi
        ;;
    3)
        echo ""
        echo "🧪 Testing APIs..."
        echo ""
        node -e '
const fs = require("fs");
const https = require("https");

// Load .env
const env = {};
const envFile = fs.readFileSync(".env", "utf8");
envFile.split("\n").forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

// Test GitHub
if (env.GITHUB_TOKEN && env.GITHUB_TOKEN !== "your_github_token_here") {
  const opts = {
    hostname: "api.github.com",
    path: "/user",
    headers: {
      "Authorization": "token " + env.GITHUB_TOKEN,
      "User-Agent": "Tree-of-Life"
    }
  };
  https.get(opts, res => {
    let data = "";
    res.on("data", d => data += d);
    res.on("end", () => {
      try {
        const user = JSON.parse(data);
        console.log("✅ GitHub:", user.login || "Connected");
      } catch(e) {
        console.log("❌ GitHub: Failed");
      }
    });
  }).on("error", () => console.log("❌ GitHub: Error"));
} else {
  console.log("⏭️  GitHub: Not configured");
}

// Test Linear
if (env.LINEAR_API_KEY && env.LINEAR_API_KEY !== "your_linear_api_key_here") {
  const postData = JSON.stringify({query: "{ viewer { name } }"});
  const opts = {
    hostname: "api.linear.app",
    path: "/graphql",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.LINEAR_API_KEY,
      "Content-Length": postData.length
    }
  };
  const req = https.request(opts, res => {
    let data = "";
    res.on("data", d => data += d);
    res.on("end", () => {
      try {
        const result = JSON.parse(data);
        console.log("✅ Linear:", result.data?.viewer?.name || "Connected");
      } catch(e) {
        console.log("❌ Linear: Failed");
      }
    });
  });
  req.on("error", () => console.log("❌ Linear: Error"));
  req.write(postData);
  req.end();
} else {
  console.log("⏭️  Linear: Not configured");
}
'
        ;;
    4)
        echo ""
        nano .env
        echo "✅ Updated"
        ;;
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Done!"
echo ""
