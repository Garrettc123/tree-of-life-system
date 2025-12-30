# 🔑 Environment Setup Guide

## Quick Setup (Copy-Paste Ready)

```bash
# In the agents/ directory, create your .env file
cp .env.template .env

# Edit the file
nano .env  # or vim, code, etc.
```

## Required API Keys

### 1. GitHub Personal Access Token

**Get it here**: https://github.com/settings/tokens

**Steps**:
1. Click "Generate new token (classic)"
2. Name it: `Tree of Life Agents`
3. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
   - ✅ `admin:org` (Full control of orgs and teams) - if using org features
4. Click "Generate token"
5. **Copy the token immediately** (you won't see it again)
6. Paste into `.env` as `GITHUB_TOKEN=ghp_xxxxx...`

**Example**:
```env
GITHUB_TOKEN=ghp_ABcd1234EFgh5678IJkl9012MNop3456QRst7890
```

### 2. Linear API Key

**Get it here**: https://linear.app/settings/api

**Steps**:
1. Scroll to "Personal API keys"
2. Click "Create key"
3. Name it: `Tree of Life Agents`
4. Copy the key
5. Paste into `.env` as `LINEAR_API_KEY=lin_api_xxxxx...`

**Your Team ID is already configured**: `0a42fa2d-5df2-45f5-a1c2-1dd78749fe93`

**Example**:
```env
LINEAR_API_KEY=lin_api_abcd1234efgh5678ijkl9012mnop3456
LINEAR_TEAM_ID=0a42fa2d-5df2-45f5-a1c2-1dd78749fe93
```

### 3. Notion Integration Token (Optional)

**Get it here**: https://www.notion.so/my-integrations

**Steps**:
1. Click "+ New integration"
2. Name: `Tree of Life Agents`
3. Select workspace
4. Copy the "Internal Integration Token"
5. Paste into `.env` as `NOTION_TOKEN=secret_xxxxx...`

**Important**: After creating the integration, you must:
- Open the Notion pages you want agents to access
- Click "⋯" (three dots) → "Add connections"
- Select "Tree of Life Agents"

**Example**:
```env
NOTION_TOKEN=secret_abcd1234efgh5678ijkl9012mnop3456
```

## Complete .env Example

```env
# GitHub Configuration
GITHUB_TOKEN=ghp_ABcd1234EFgh5678IJkl9012MNop3456QRst7890
GITHUB_OWNER=Garrettc123

# Linear Configuration
LINEAR_API_KEY=lin_api_abcd1234efgh5678ijkl9012mnop3456
LINEAR_TEAM_ID=0a42fa2d-5df2-45f5-a1c2-1dd78749fe93

# Notion Configuration (Optional)
NOTION_TOKEN=secret_abcd1234efgh5678ijkl9012mnop3456

# Perplexity AI (Optional)
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxxx

# Agent Configuration
AGENT_MODE=development
AGENT_SCHEDULE=0 * * * *
AGENT_AUTO_EXECUTE=false

# Logging
LOG_LEVEL=info
```

## Verification

After configuring your `.env`, test it:

```bash
node index.js
```

You should see:
```
┌────────────────────────────────────────────────┐
│  🤖 Tree of Life Autonomous Agent System  │
└────────────────────────────────────────────────┘

✅ Configuration loaded
   Mode: development
   Owner: Garrettc123
```

If you see errors:
- ❌ `GITHUB_TOKEN not configured` → Check your GitHub token
- ❌ `LINEAR_API_KEY not configured` → Check your Linear key
- ❌ Connection errors → Verify tokens are valid and have correct permissions

## Security Notes

⚠️ **NEVER commit your .env file to git!**

The `.env` file is already in `.gitignore`, but double-check:

```bash
# Verify .env is ignored
git status
# Should NOT show .env as a tracked file
```

## Token Permissions

### GitHub Token Scopes Explained
- `repo`: Allows agents to create files, branches, PRs in your repos
- `workflow`: Allows agents to create/modify GitHub Actions
- `admin:org`: (Optional) For organization-level features

### Linear API Key Permissions
- Full API access to your Linear workspace
- Can create issues, update projects, manage cycles
- Scoped to the team: `Garrettc (GAR)`

### Notion Integration Capabilities
- Read/write access to connected pages
- Must explicitly share pages with the integration
- Cannot access pages that aren't shared

## Troubleshooting

### "401 Unauthorized" - GitHub
- Token is invalid or expired
- Regenerate at https://github.com/settings/tokens

### "401 Unauthorized" - Linear  
- API key is invalid
- Regenerate at https://linear.app/settings/api

### "403 Forbidden" - Notion
- Integration not connected to pages
- Share pages with your integration in Notion

### "Missing environment variables"
- Check `.env` file exists in `agents/` directory
- Verify no typos in variable names
- Make sure no extra spaces around `=` signs

## Next Steps

Once configured:

1. **Test the system**:
   ```bash
   node index.js
   ```

2. **Run Planning Agent**:
   ```bash
   npm run agent:planning
   ```

3. **Enable auto-execution**:
   ```env
   AGENT_AUTO_EXECUTE=true
   ```
   Then run `node index.js`

4. **View generated tasks**:
   - Check console output
   - View Linear for new issues
   - Check GitHub for new PRs

## Support

- **GitHub PR**: https://github.com/Garrettc123/tree-of-life-system/pull/18
- **Linear Issue**: https://linear.app/garrettc/issue/GAR-45
- **Notion Hub**: https://www.notion.so/2d9024e8799b817ea73fdb88ac4225c8
