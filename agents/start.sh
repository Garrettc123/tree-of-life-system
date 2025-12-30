#!/bin/bash
# Simple launcher for Tree of Life Agents

echo ""
echo "🤖 Tree of Life Agent System"
echo "============================"
echo ""

if [ ! -f "package.json" ]; then
    echo "❌ Run this from agents directory"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "📝 Creating .env from template..."
    cp .env.template .env 2>/dev/null || cat > .env << 'EOF'
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=Garrettc123
LINEAR_API_KEY=your_linear_api_key_here
LINEAR_TEAM_ID=0a42fa2d-5df2-45f5-a1c2-1dd78749fe93
NOTION_TOKEN=your_notion_token_here
AGENT_MODE=development
AGENT_AUTO_EXECUTE=false
LOG_LEVEL=info
EOF
    echo "✅ Created .env"
    echo ""
    echo "Edit your API keys:"
    echo "  nano .env"
    echo ""
    echo "Get API keys from:"
    echo "  GitHub: https://github.com/settings/tokens"
    echo "  Linear: https://linear.app/settings/api"
    echo ""
    exit 0
fi

echo "Select option:"
echo ""
echo "  1 - Start agent system"
echo "  2 - Test API connections"
echo "  3 - Edit .env file"
echo ""
read -p "Choice: " choice

if [ "$choice" = "1" ]; then
    echo ""
    echo "🚀 Starting agents..."
    echo ""
    node index.js
elif [ "$choice" = "2" ]; then
    echo ""
    echo "🧪 Testing APIs..."
    node -e 'require("dotenv").config();const h=require("https");if(process.env.GITHUB_TOKEN&&process.env.GITHUB_TOKEN!=="your_github_token_here"){h.get({hostname:"api.github.com",path:"/user",headers:{Authorization:"token "+process.env.GITHUB_TOKEN,"User-Agent":"Test"}},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{console.log("✅ GitHub:",JSON.parse(d).login)}catch(e){console.log("❌ GitHub failed")}})}).on("error",()=>console.log("❌ GitHub error"))}else{console.log("⏭️ GitHub: Not configured")}if(process.env.LINEAR_API_KEY&&process.env.LINEAR_API_KEY!=="your_linear_api_key_here"){const p=JSON.stringify({query:"{viewer{name}}"});const r=h.request({hostname:"api.linear.app",path:"/graphql",method:"POST",headers:{"Content-Type":"application/json",Authorization:process.env.LINEAR_API_KEY,"Content-Length":p.length}},s=>{let d="";s.on("data",c=>d+=c);s.on("end",()=>{try{console.log("✅ Linear:",JSON.parse(d).data.viewer.name)}catch(e){console.log("❌ Linear failed")}})});r.on("error",()=>console.log("❌ Linear error"));r.write(p);r.end()}else{console.log("⏭️ Linear: Not configured")}'
    echo ""
elif [ "$choice" = "3" ]; then
    nano .env
    echo "✅ Updated"
else
    echo "❌ Invalid choice"
    exit 1
fi

echo ""
echo "✅ Done"
