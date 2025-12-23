# 🚀 TITAN v4.0 Deployment Guide

Complete deployment instructions for all 22 TITAN systems across multiple platforms.

## 📋 Quick Start

### Prerequisites
- GitHub account (✅ Done)
- Vercel account (✅ Frontend deployed)
- Railway account (for backend)
- Supabase account (for database)
- GitHub API token

---

## 🌐 Frontend Deployment (✅ COMPLETE)

**Platform**: Vercel  
**Status**: ✅ Live  
**URL**: https://tree-of-life-system.vercel.app  

### What's Deployed:
- Homepage
- TITAN Dashboard
- Static assets
- API routes

---

## 🔧 Backend Deployment

### Option 1: Railway (Recommended - Free Tier)

1. **Connect Repository**:
   ```bash
   # Go to https://railway.app
   # Click "New Project" → "Deploy from GitHub"
   # Select: Garrettc123/tree-of-life-system
   ```

2. **Configure Environment Variables**:
   ```env
   GITHUB_TOKEN=your_github_token
   GITHUB_OWNER=Garrettc123
   GITHUB_REPO=tree-of-life-system
   PORT=8000
   ENVIRONMENT=production
   ```

3. **Deploy**: Railway auto-deploys from main branch

4. **Get URL**: Copy your Railway URL (e.g., `titan-backend.up.railway.app`)

5. **Update Dashboard**:
   - Edit `public/dashboard.html`
   - Replace `YOUR_RAILWAY_API_URL_HERE` with your Railway URL
   - Commit changes

### Option 2: Heroku (Free Tier)

```bash
# Install Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Login
heroku login

# Create app
heroku create titan-backend-system

# Set environment variables
heroku config:set GITHUB_TOKEN=your_token
heroku config:set GITHUB_OWNER=Garrettc123
heroku config:set GITHUB_REPO=tree-of-life-system

# Deploy
git push heroku main

# Scale dynos
heroku ps:scale web=1 worker=1 scheduler=1
```

### Option 3: Render (Free Tier)

1. Go to https://render.com
2. New → Web Service
3. Connect GitHub repo
4. Settings:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python src/main.py`
5. Add environment variables
6. Deploy

---

## 🗄️ Database Deployment

### Supabase (Recommended - Free Tier)

1. **Create Project**:
   ```bash
   # Go to https://supabase.com
   # New Project → "TITAN-DB"
   # Region: Choose closest to you
   ```

2. **Run Migrations**:
   ```sql
   -- Go to SQL Editor in Supabase
   -- Copy paste from src/database/schema.sql
   -- Execute
   ```

3. **Get Connection String**:
   ```
   Settings → Database → Connection String
   ```

4. **Update Environment Variables**:
   ```env
   DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
   ```

---

## 🤖 GitHub Actions (Auto-Deployment)

### Already Configured:
- ✅ PR automation
- ✅ Issue management
- ✅ Code quality checks
- ✅ Security scanning
- ✅ CI/CD pipeline

### Activate:
1. Go to repo Settings → Secrets and variables → Actions
2. Add secrets:
   ```
   GITHUB_TOKEN (automatic)
   RAILWAY_TOKEN (from Railway dashboard)
   VERCEL_TOKEN (from Vercel dashboard)
   ```

---

## 🧠 AI Systems Activation

### 1. Learning Engine
```bash
# Automatically starts with backend
# Monitors: PRs, Issues, Code patterns
# Storage: src/data/knowledge_base.json
```

### 2. Prediction Engine
```bash
# Analyzes: Historical data
# Predicts: Issue resolution time, PR approval probability
# Trains: Every 6 hours
```

### 3. Decision Engine
```bash
# Auto-decisions on:
# - PR merging (if checks pass + 95% confidence)
# - Issue prioritization
# - Resource allocation
```

### 4. Pattern Recognition
```bash
# Detects:
# - Code patterns
# - Bug patterns
# - Performance patterns
# Updates: Real-time
```

---

## ⚙️ Automation Systems

### PR Management System
```yaml
# .github/workflows/pr-automation.yml
# Already active!
Triggers:
  - Auto-label PRs
  - Run tests
  - Request reviews
  - Auto-merge (if configured)
```

### Issue Management System
```yaml
# .github/workflows/issue-automation.yml
# Already active!
Triggers:
  - Auto-label issues
  - Auto-assign
  - Stale issue detection
  - Priority calculation
```

### Release Management
```yaml
# .github/workflows/release.yml
# Triggers on version tags
Steps:
  - Build
  - Test
  - Create release
  - Deploy
```

---

## 🔗 Integration Activations

### GitHub Projects Integration
1. Create Project Board:
   ```
   Projects → New → "TITAN Development"
   ```
2. Link automation:
   ```bash
   # Already configured in workflows
   # Auto-moves cards based on PR/issue status
   ```

### GitHub Wiki Integration
```bash
# Initialize wiki
gh repo clone Garrettc123/tree-of-life-system.wiki
cd tree-of-life-system.wiki

# Wiki auto-updates from:
# - docs/ folder
# - README.md
# - ARCHITECTURE.md
```

---

## 💰 Revenue Systems Setup

### 1. SaaS Subscription (Stripe)
```bash
# Create Stripe account
# Add to backend:
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...

# Pricing tiers already defined in:
# src/revenue/subscription_tiers.py
```

### 2. API Monetization
```bash
# Already configured:
# - Rate limiting
# - Usage tracking
# - Billing endpoints

# Activate by setting:
API_MONETIZATION_ENABLED=true
```

### 3. Content Revenue
```bash
# YouTube API:
YOUTUBE_API_KEY=your_key

# Medium Integration:
MEDIUM_TOKEN=your_token

# Dev.to Integration:
DEV_TO_API_KEY=your_key
```

---

## 🚨 Monitoring & Alerts

### Health Checks
```bash
# Endpoints:
GET /health          # Overall system health
GET /health/ai       # AI systems status
GET /health/automation  # Automation status
GET /metrics         # Performance metrics
```

### Alerts Setup
```bash
# Configure in backend:
ALERT_EMAIL=your_email@example.com
ALERT_WEBHOOK=your_slack_webhook

# Alert triggers:
# - System downtime
# - Error rate > 5%
# - Response time > 2s
# - AI confidence < 80%
```

---

## 📊 Analytics Integration

### Google Analytics
```html
<!-- Already in public/index.html -->
<!-- Add your GA tracking ID -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
```

### Mixpanel
```javascript
// Add to dashboard:
mixpanel.init('YOUR_PROJECT_TOKEN');
```

---

## ✅ Deployment Checklist

### Phase 1: Core Infrastructure
- [x] Frontend deployed (Vercel)
- [ ] Backend deployed (Railway/Heroku/Render)
- [ ] Database deployed (Supabase)
- [ ] Environment variables configured

### Phase 2: AI Systems
- [ ] Learning Engine activated
- [ ] Prediction Engine trained
- [ ] Decision Engine configured
- [ ] Knowledge base initialized

### Phase 3: Automation
- [x] GitHub Actions enabled
- [ ] Webhooks configured
- [ ] Scheduled tasks running
- [ ] Auto-deployment active

### Phase 4: Integrations
- [ ] GitHub Projects linked
- [ ] Wiki initialized
- [ ] API keys configured
- [ ] Third-party services connected

### Phase 5: Revenue
- [ ] Stripe account created
- [ ] API monetization enabled
- [ ] Content platforms connected
- [ ] Analytics tracking active

### Phase 6: Monitoring
- [ ] Health checks responding
- [ ] Alerts configured
- [ ] Logs aggregation setup
- [ ] Performance monitoring active

---

## 🆘 Troubleshooting

### Backend Won't Start
```bash
# Check logs:
railway logs
# or
heroku logs --tail

# Common fixes:
# 1. Check Python version (3.9+)
# 2. Verify all dependencies installed
# 3. Check environment variables
# 4. Ensure PORT is set
```

### Database Connection Failed
```bash
# Test connection:
psql $DATABASE_URL

# Fix:
# 1. Check connection string
# 2. Verify IP whitelist (Supabase)
# 3. Check SSL mode
# 4. Test from backend server
```

### GitHub Actions Failing
```bash
# Check:
# 1. GITHUB_TOKEN has correct permissions
# 2. Secrets are set
# 3. Workflow syntax is valid
# 4. Check Actions tab for detailed logs
```

---

## 🎯 Next Steps After Deployment

1. **Test All Systems**:
   ```bash
   # Run health check
   curl https://your-backend-url.com/health
   
   # Test AI endpoint
   curl https://your-backend-url.com/api/intelligence
   
   # Check automation
   curl https://your-backend-url.com/api/automation/status
   ```

2. **Initialize AI Training**:
   ```bash
   # Trigger initial training
   curl -X POST https://your-backend-url.com/api/ai/train
   ```

3. **Configure Webhooks**:
   ```bash
   # GitHub → Settings → Webhooks
   # Add: https://your-backend-url.com/webhooks/github
   # Events: Push, Pull Request, Issues
   ```

4. **Monitor Dashboard**:
   - Open: https://tree-of-life-system.vercel.app/dashboard.html
   - Should show: "✅ Backend Online"
   - Verify: All metrics updating

---

## 📞 Support

- **Documentation**: [README.md](README.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Issues**: [GitHub Issues](https://github.com/Garrettc123/tree-of-life-system/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Garrettc123/tree-of-life-system/discussions)

---

## 🎉 Success Indicators

Your TITAN system is fully deployed when:

✅ Dashboard shows "Backend Online"  
✅ Health endpoint returns 200 OK  
✅ AI systems show > 80% confidence  
✅ Automation triggers on PR/issues  
✅ Database queries respond < 100ms  
✅ All 22 systems show "Active" status  

**Welcome to the future of autonomous development! 🚀**