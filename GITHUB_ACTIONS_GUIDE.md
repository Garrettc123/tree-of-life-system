# GitHub Actions Deployment Guide

## 🚀 Quick Start

Your autonomous business system is ready to deploy with GitHub Actions! Follow these steps:

### Step 1: Add Required Secrets

**Go to:** [Repository Secrets](https://github.com/Garrettc123/tree-of-life-system/settings/secrets/actions)

**Required secrets:**

```
GH_TOKEN              = Your GitHub Personal Access Token
RAILWAY_TOKEN         = Your Railway API Token
OPENAI_API_KEY        = Your OpenAI API Key
```

**Optional secrets (for full features):**

```
ANTHROPIC_API_KEY     = Your Anthropic/Claude API Key
STRIPE_API_KEY        = Your Stripe API Key
SENDGRID_API_KEY      = Your SendGrid API Key
```

### Step 2: Get Your API Tokens

#### GitHub Token
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `workflow`, `admin:org`
4. Click "Generate token"
5. Copy the token (starts with `ghp_`)

#### Railway Token
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Get your token
railway whoami --token
```

#### OpenAI API Key
1. Go to: https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)

### Step 3: Deploy!

**Option A: Via GitHub Web Interface** (Easiest)

1. Go to: [Actions Tab](https://github.com/Garrettc123/tree-of-life-system/actions)
2. Click "Deploy Autonomous Business" workflow
3. Click "Run workflow" button
4. Select deployment mode:
   - **`railway`** - Full deployment to Railway ($85-170/month)
   - **`free`** - Free tier deployment (limited features)
   - **`gcp`** - Google Cloud Platform deployment
   - **`hybrid`** - Mixed deployment strategy
5. Click "Run workflow"
6. Watch the magic happen! 🪄

**Option B: Via GitHub CLI**

```bash
# Deploy to Railway (recommended)
gh workflow run deploy-autonomous-business.yml \
  -f deployment_mode=railway \
  -f tier=all

# Deploy free tier
gh workflow run deploy-autonomous-business.yml \
  -f deployment_mode=free

# Deploy specific tier
gh workflow run deploy-autonomous-business.yml \
  -f deployment_mode=railway \
  -f tier=1-3
```

**Option C: Automatic on Push**

The deployment workflow automatically runs when you push changes to:
- `scripts/deploy-autonomous-business.sh`
- `scripts/deploy-*.sh`
- `.github/workflows/deploy-autonomous-business.yml`

---

## 📊 Available Workflows

### 1. Deploy Autonomous Business
**File:** `.github/workflows/deploy-autonomous-business.yml`

**Purpose:** Deploys all 17 autonomous systems

**Triggers:**
- ✅ Manual button click
- ✅ Push to main (when deployment files change)

**Duration:** ~10-15 minutes

**What it does:**
1. Installs Railway CLI and GitHub CLI
2. Configures authentication
3. Runs deployment scripts
4. Deploys all autonomous systems
5. Verifies health
6. Generates deployment report

**View:** [Run Deployment](https://github.com/Garrettc123/tree-of-life-system/actions/workflows/deploy-autonomous-business.yml)

---

### 2. CI/CD Pipeline
**File:** `.github/workflows/ci-cd.yml`

**Purpose:** Tests and validates code on every push

**Triggers:**
- ✅ Push to main or develop
- ✅ Pull requests to main
- ✅ Manual run

**Duration:** ~5 minutes

**What it does:**
1. Installs dependencies
2. Runs linter
3. Runs tests
4. Validates deployment scripts
5. Checks required files
6. Runs security audit
7. Auto-deploys to Railway (if main branch)

**View:** [CI/CD Runs](https://github.com/Garrettc123/tree-of-life-system/actions/workflows/ci-cd.yml)

---

### 3. Security Scan
**File:** `.github/workflows/security-scan.yml`

**Purpose:** Scans for vulnerabilities and leaked secrets

**Triggers:**
- ✅ Push to main or develop
- ✅ Pull requests
- ✅ Daily at 2 AM UTC
- ✅ Manual run

**Duration:** ~3-5 minutes

**What it does:**
1. Runs Trivy vulnerability scanner
2. Scans for leaked API keys
3. Checks for sensitive files
4. Audits dependencies
5. Checks repository security settings
6. Generates security report

**View:** [Security Scans](https://github.com/Garrettc123/tree-of-life-system/actions/workflows/security-scan.yml)

---

### 4. Health Check
**File:** `.github/workflows/health-check.yml`

**Purpose:** Monitors system health 24/7

**Triggers:**
- ✅ Every hour (automated)
- ✅ Manual run

**Duration:** ~2 minutes

**What it does:**
1. Checks repository status
2. Monitors collaborators
3. Tracks forks and stars
4. Verifies system health
5. Generates health report

**View:** [Health Checks](https://github.com/Garrettc123/tree-of-life-system/actions/workflows/health-check.yml)

---

### 5. Auto Update Dependencies
**File:** `.github/workflows/auto-update-dependencies.yml`

**Purpose:** Keeps dependencies up-to-date automatically

**Triggers:**
- ✅ Weekly (Monday at 3 AM UTC)
- ✅ Manual run

**Duration:** ~3-5 minutes

**What it does:**
1. Updates npm packages
2. Applies security fixes
3. Creates pull request
4. Auto-merges if tests pass

**View:** [Dependency Updates](https://github.com/Garrettc123/tree-of-life-system/actions/workflows/auto-update-dependencies.yml)

---

## 🔧 Troubleshooting

### Workflow Failed?

**Common issues and fixes:**

#### 1. Authentication Failed
```
Error: Failed to authenticate with Railway/GitHub
```

**Fix:**
- Verify tokens are added to repository secrets
- Check token hasn't expired
- Ensure token has correct permissions

#### 2. Missing Dependencies
```
Error: Cannot find module 'express'
```

**Fix:**
- Ensure `package.json` exists
- Run `npm install` locally first
- Push `package-lock.json` to repository

#### 3. Script Permission Denied
```
Error: Permission denied: scripts/deploy-autonomous-business.sh
```

**Fix:**
- Workflows now automatically fix permissions
- Or manually: `git update-index --chmod=+x scripts/*.sh`

#### 4. Railway Deployment Failed
```
Error: Railway deployment failed
```

**Fix:**
- Check Railway dashboard for errors
- Verify RAILWAY_TOKEN is valid
- Ensure Railway project exists
- Check Railway service logs

#### 5. Timeout
```
Error: Job was cancelled because maximum execution time was exceeded
```

**Fix:**
- Increase timeout in workflow file
- Deploy fewer systems at once
- Use `free` tier for testing

---

## 📊 Monitoring Your Deployment

### View Workflow Runs

**Via Web:**
1. Go to: [Actions Tab](https://github.com/Garrettc123/tree-of-life-system/actions)
2. Click on any workflow
3. View real-time logs

**Via CLI:**
```bash
# List recent runs
gh run list --limit 10

# Watch specific workflow
gh run watch

# View logs
gh run view <run-id> --log

# Download artifacts
gh run download <run-id>
```

### Check Deployment Status

```bash
# View Railway deployments
railway status

# List Railway services
railway list

# View service logs
railway logs
```

---

## 🐛 Debug Mode

Enable debug logging for workflows:

1. Go to: [Repository Settings](https://github.com/Garrettc123/tree-of-life-system/settings)
2. Add secret: `ACTIONS_STEP_DEBUG` = `true`
3. Re-run workflow
4. View detailed debug logs

---

## 💰 Cost Tracking

### GitHub Actions Usage

**Free tier:**
- 2,000 minutes/month (public repos)
- 500 MB artifact storage

**After free tier:**
- $0.008/minute for private repos
- $0.25/GB for storage

**View usage:**
https://github.com/settings/billing

### Railway Costs

**Current deployment:**
- Estimated: $85-170/month
- Pay-as-you-go pricing
- First $5 free each month

**View usage:**
https://railway.app/account/usage

---

## ✅ Deployment Checklist

Before deploying, ensure:

- [ ] All secrets added to GitHub
- [ ] GitHub token has correct permissions
- [ ] Railway account created and linked
- [ ] OpenAI API key added
- [ ] Payment method added to Railway (if using paid tier)
- [ ] Repository is backed up
- [ ] You've read the deployment guide
- [ ] You're ready to make $10M+/year! 💸

---

## 🎉 Next Steps After Deployment

### 1. Verify Deployment
```bash
# Check Railway services
railway status

# View deployment URLs
railway open

# Check logs
railway logs
```

### 2. Configure Webhooks
```bash
# Run webhook setup
node scripts/setup-webhooks.js
```

### 3. Monitor Health
- Check hourly health reports in Actions
- Monitor Railway dashboard
- Review security scan results

### 4. Scale Up
Once revenue starts flowing:
```bash
# Run scaling script
bash scripts/scale-after-revenue.sh
```

---

## 🔗 Important Links

- **Actions Dashboard:** https://github.com/Garrettc123/tree-of-life-system/actions
- **Repository Secrets:** https://github.com/Garrettc123/tree-of-life-system/settings/secrets/actions
- **Railway Dashboard:** https://railway.app/dashboard
- **GitHub Billing:** https://github.com/settings/billing
- **Workflow Files:** https://github.com/Garrettc123/tree-of-life-system/tree/main/.github/workflows

---

## ❓ Need Help?

**Check these resources:**

1. **GitHub Actions Docs:** https://docs.github.com/en/actions
2. **Railway Docs:** https://docs.railway.app/
3. **Deployment Logs:** Check artifacts in completed workflows
4. **Security Reports:** Review security scan results
5. **System Health:** Check health-check workflow runs

---

**Your autonomous business is ready to generate $10M+/year! 🚀💰**

Just add your secrets and click "Run workflow" - the AI does the rest!
