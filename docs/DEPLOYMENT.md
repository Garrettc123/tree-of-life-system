# TITAN Deployment Guide

## 🚀 Quick Deploy to Railway

### Step 1: Prepare Repository
```bash
git clone https://github.com/Garrettc123/tree-of-life-system.git
cd tree-of-life-system
npm install
```

### Step 2: Railway Setup

1. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `tree-of-life-system`

3. **Configure Environment Variables**
   - Go to project settings → Variables
   - Add all variables from `.env.example`

### Step 3: Deploy

```bash
# Railway will auto-deploy on push
git push origin main

# Or deploy manually
railway up
```

### Step 4: Verify Deployment

```bash
# Get your Railway URL
railway open

# Check health
curl https://your-app.railway.app/health

# Activate TITAN
node scripts/titan-activate.js
```

### Step 5: Configure Webhooks

```bash
RAILWAY_URL=https://your-app.railway.app node scripts/setup-webhooks.js
```

---

## 🔧 Environment Variables

### Required
```bash
GITHUB_TOKEN=ghp_xxx          # GitHub personal access token
GITHUB_USERNAME=Garrettc123   # Your GitHub username
OPENAI_API_KEY=sk-proj-xxx    # OpenAI API key for AI features
```

### Recommended
```bash
LINEAR_API_KEY=lin_api_xxx    # Linear integration
NOTION_API_KEY=secret_xxx     # Notion integration
GITHUB_WEBHOOK_SECRET=xxx     # Webhook security
```

### Optional (Revenue)
```bash
STRIPE_SECRET_KEY=sk_live_xxx # For subscription billing
STRIPE_PUBLISHABLE_KEY=pk_xxx # For checkout
```

---

## ⚙️ Railway Configuration

### Auto-Deploy
Railway automatically deploys when you push to `main` branch.

### Custom Domain
1. Go to project settings
2. Click "Add Domain"
3. Enter your domain
4. Update DNS records

### Scaling
Railway auto-scales based on traffic:
- **Memory**: Up to 8GB
- **CPU**: Up to 8 vCPUs
- **Replicas**: Auto-scaling

### Monitoring
- View logs: `railway logs`
- View metrics: Railway dashboard
- Health checks: `/health` endpoint

---

## 🛡️ Security

### Webhook Security
```bash
# Generate secure webhook secret
openssl rand -hex 32

# Add to Railway variables
GITHUB_WEBHOOK_SECRET=your_generated_secret
```

### API Keys
- Store all keys in Railway variables
- Never commit keys to repository
- Rotate keys regularly

### HTTPS
- Railway provides SSL automatically
- All traffic encrypted

---

## 📊 Monitoring

### Built-in Health Checks
```bash
# Check all systems
curl https://your-app.railway.app/health

# Check status
curl https://your-app.railway.app/status

# View dashboard
curl https://your-app.railway.app/dashboard
```

### Continuous Monitoring
```bash
# Run health monitor
node monitoring/health-check.js
```

### Logging
```bash
# View live logs
railway logs --tail

# View logs by service
railway logs orchestrator
```

---

## 🔄 Updates

### Deploy Updates
```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Railway auto-deploys
```

### Rollback
```bash
# Via Railway dashboard
# Go to deployments → Select previous version → Redeploy
```

---

## 🎯 Post-Deployment Checklist

- [ ] Railway deployment successful
- [ ] Health check passes
- [ ] Environment variables set
- [ ] Webhooks configured
- [ ] Custom domain added (optional)
- [ ] Monitoring enabled
- [ ] SSL certificate active
- [ ] All 17 systems operational
- [ ] Test automation flows
- [ ] Revenue streams configured

---

## 🐛 Troubleshooting

### Deployment Fails
```bash
# Check build logs
railway logs --build

# Check Railway status
railway status
```

### Health Check Fails
```bash
# Run activation script
node scripts/titan-activate.js

# Check individual systems
curl https://your-app.railway.app/github/pr/status
```

### Webhooks Not Working
```bash
# Verify webhook configuration
# GitHub repo → Settings → Webhooks

# Check delivery logs
# Recent Deliveries → View details
```

---

## 📞 Support

- **Documentation**: https://github.com/Garrettc123/tree-of-life-system
- **Issues**: https://github.com/Garrettc123/tree-of-life-system/issues
- **Railway Docs**: https://docs.railway.app

---

**TITAN is now deployed and operational!** 🎉
