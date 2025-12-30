# 🚀 Quick Start - Autonomous Agents

## Prerequisites

1. Node.js 18+ installed
2. Git repository cloned
3. API keys ready:
   - GitHub Personal Access Token
   - Linear API Key
   - Notion Integration Token (optional)

## Step 1: Switch to Agents Branch

```bash
# Make sure you're in the repo root
cd tree-of-life-system

# Fetch latest changes
git fetch origin

# Switch to agents branch
git checkout feature/autonomous-agents

# Pull latest code
git pull origin feature/autonomous-agents
```

## Step 2: Navigate to Agents Directory

```bash
cd agents
```

## Step 3: Install Dependencies

```bash
npm install
```

If you see dependency conflicts, use:
```bash
npm install --legacy-peer-deps
```

## Step 4: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your tokens
nano .env  # or use any text editor
```

Required variables:
```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=Garrettc123
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxx
LINEAR_TEAM_ID=0a42fa2d-5df2-45f5-a1c2-1dd78749fe93
```

## Step 5: Run the System

### Option A: Full System (Manual Mode)
```bash
node index.js
```

This starts the agent system in manual mode. You can then trigger agents programmatically.

### Option B: Auto-Execute Planning Agent
```bash
# Set auto-execute in .env
AGENT_AUTO_EXECUTE=true

# Run system
node index.js
```

### Option C: Run Specific Agent
```bash
# Run Planning Agent directly
npm run agent:planning
```

## What Happens

1. **System Initialization**
   - Loads configuration from .env
   - Initializes MCP Coordinator
   - Sets up Event Bus
   - Registers Planning Agent

2. **Planning Agent Execution** (if auto-execute enabled)
   - Scans GitHub repositories for gaps
   - Analyzes Linear projects
   - Generates prioritized tasks
   - Distributes tasks to other agents

3. **Output**
   - Displays system status
   - Shows registered agents
   - Lists identified gaps
   - Shows generated tasks

## Example Output

```
┌────────────────────────────────────────────────┐
│  🤖 Tree of Life Autonomous Agent System  │
└────────────────────────────────────────────────┘

✅ Configuration loaded
   Mode: development
   Owner: Garrettc123

Initializing Planning Agent...
[MCP] Agent registered: planning
✅ Planning Agent ready

✨ Agent system initialized

[GapAnalyzer] Starting system analysis...
[GapAnalyzer] Found 12 gaps
[TaskGenerator] Generating tasks from 12 gaps...
[TaskGenerator] Generated 12 tasks
[PlanningAgent] Assigned 8 tasks to development
[PlanningAgent] Assigned 3 tasks to project-management
[PlanningAgent] Assigned 1 tasks to documentation

┌──────────────────────────┐
│   Agent System Status   │
└──────────────────────────┘

• planning: idle
  Capabilities: gap-analysis, task-generation, priority-planning, coordination
  Pending tasks: 12

MCP Agents: 1 registered
Event Bus: 15 events, 3 subscribers
```

## Troubleshooting

### "agents: No such file or directory"
**Solution**: You're on the wrong branch. Run:
```bash
git checkout feature/autonomous-agents
cd agents
```

### "GITHUB_TOKEN not configured"
**Solution**: Create .env file with your API keys:
```bash
cp .env.example .env
# Edit .env and add your tokens
```

### Dependency conflicts
**Solution**: Use legacy peer deps:
```bash
npm install --legacy-peer-deps
```

### "Module not found"
**Solution**: Make sure you're in the agents directory:
```bash
cd agents
npm install
```

## Next Steps

1. **Review Generated Tasks**: Check what the Planning Agent identified
2. **Merge PR #18**: Integrate agents into main branch
3. **Deploy to Production**: Set up scheduled execution
4. **Add More Agents**: Implement Development, PM, Documentation agents
5. **Monitor Performance**: Use the Event Bus to track agent activity

## Getting API Keys

### GitHub Token
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `workflow`, `admin:org`
4. Copy token to .env

### Linear API Key
1. Go to https://linear.app/settings/api
2. Create new API key
3. Copy to .env

### Linear Team ID
```bash
# Already configured for you:
LINEAR_TEAM_ID=0a42fa2d-5df2-45f5-a1c2-1dd78749fe93
```

## Support

- **GitHub PR**: https://github.com/Garrettc123/tree-of-life-system/pull/18
- **Linear Issue**: https://linear.app/garrettc/issue/GAR-45
- **Notion Hub**: https://www.notion.so/2d9024e8799b817ea73fdb88ac4225c8
