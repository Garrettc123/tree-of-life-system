# ⚡ One-Click TITAN Deployment

## 🚀 Fastest Way to Deploy Everything

### Prerequisites (One-time setup - 5 minutes)

1. **Create Accounts** (if you don't have them):
   - Railway: https://railway.app (Sign in with GitHub)
   - Supabase: https://supabase.com (Sign in with GitHub)
   
2. **Get Your Tokens**:
   ```bash
   # Railway Token
   # 1. Go to railway.app/account/tokens
   # 2. Create new token
   # 3. Copy it
   export RAILWAY_TOKEN="your_token_here"
   
   # GitHub Token (already have this)
   export GITHUB_TOKEN="your_github_token"
   
   # Supabase Org ID
   # 1. Go to supabase.com/dashboard/organizations
   # 2. Copy organization ID from URL
   export SUPABASE_ORG_ID="your_org_id"
   ```

---

## 🎯 Option 1: Fully Automated (Recommended)

**Single command deploys everything:**

```bash
# Clone repo (if not already)
git clone https://github.com/Garrettc123/tree-of-life-system.git
cd tree-of-life-system

# Make script executable
chmod +x scripts/deploy.sh

# Set your tokens
export GITHUB_TOKEN="your_github_token"
export RAILWAY_TOKEN="your_railway_token"
export SUPABASE_ORG_ID="your_supabase_org_id"

# Deploy everything!
./scripts/deploy.sh
```

**What it does automatically:**
1. ✅ Installs required CLIs (Railway, Supabase)
2. ✅ Deploys backend to Railway
3. ✅ Creates and configures Supabase database
4. ✅ Connects backend to database
5. ✅ Updates frontend with backend URL
6. ✅ Configures GitHub webhooks
7. ✅ Initializes all 22 AI/automation systems
8. ✅ Runs health checks

**Time: 3-5 minutes** ⏱️

---

## 👆 Option 2: One-Click Web Deploy

### Backend (Railway)

**Click this button:**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/Garrettc123/tree-of-life-system)

**Then:**
1. Login with GitHub
2. Click "Deploy Now"
3. Set environment variables:
   - `GITHUB_TOKEN` = your token
   - `GITHUB_OWNER` = Garrettc123
   - `GITHUB_REPO` = tree-of-life-system
4. Copy your Railway URL (e.g., `abc123.railway.app`)

### Database (Supabase)

**Click this button:**

[![Deploy on Supabase](https://supabase.com/images/deploy-button.svg)](https://supabase.com/dashboard/new)

**Then:**
1. Login with GitHub
2. Create project: "TITAN-DB"
3. Copy connection string
4. Go back to Railway → Add environment variable:
   - `DATABASE_URL` = your Supabase connection string
5. Railway will auto-restart with database connected

### Update Frontend

```bash
# In your local repo
sed -i 's|YOUR_RAILWAY_API_URL_HERE|https://your-railway-url.railway.app|g' public/dashboard.html
git add .
git commit -m "Connect to deployed backend"
git push

# Vercel auto-deploys in 30 seconds!
```

**Time: 5-7 minutes** ⏱️

---

## 📱 Option 3: Mobile/No Terminal Deploy

### Using GitHub Codespaces (Browser-based)

1. **Open Codespace**:
   - Go to: https://github.com/Garrettc123/tree-of-life-system
   - Click green "Code" button → "Codespaces" tab
   - Click "Create codespace on main"

2. **Run deployment**:
   ```bash
   # In the Codespace terminal
   chmod +x scripts/deploy.sh
   export GITHUB_TOKEN="your_token"
   ./scripts/deploy.sh
   ```

3. **Done!** Everything deploys from your browser.

**Time: 4-6 minutes** ⏱️

---

## 🤖 Option 4: GitHub Actions Auto-Deploy

**Fully automated on every push:**

1. **Add Secrets to GitHub**:
   - Go to: https://github.com/Garrettc123/tree-of-life-system/settings/secrets/actions
   - Click "New repository secret"
   - Add:
     - `RAILWAY_TOKEN`
     - `SUPABASE_URL`
     - `SUPABASE_KEY`

2. **Push any commit**:
   ```bash
   git commit --allow-empty -m "Deploy TITAN"
   git push
   ```

3. **Watch it deploy**:
   - GitHub Actions tab
   - See all systems deploying automatically

**Time: Automatic on every push** ⏱️

---

## ✅ Verify Deployment

**Check if everything is online:**

```bash
# Health check
curl https://your-backend-url.railway.app/health

# Should return:
{
  "status": "healthy",
  "systems": {
    "ai": "online",
    "automation": "online",
    "database": "connected",
    "integrations": "active"
  },
  "version": "4.0",
  "uptime": "5 minutes"
}
```

**Visit your dashboard:**
https://tree-of-life-system.vercel.app/dashboard.html

Should show: "✅ Backend Online" with all systems active!

---

## 💰 Cost Breakdown

**Free Tier Usage:**
- Railway: $5 credit/month (covers 500 hours)
- Supabase: 500MB database free
- Vercel: Unlimited deploys free
- GitHub Actions: 2000 minutes/month free

**Total Cost: $0 for first 3 months** 🎉

**After free tier:**
- Railway: ~$5/month
- Supabase: ~$0-10/month (based on usage)
- **Total: ~$5-15/month for entire TITAN system**

---

## 🔧 Troubleshooting

### "Railway command not found"
```bash
npm install -g @railway/cli
```

### "Permission denied: deploy.sh"
```bash
chmod +x scripts/deploy.sh
```

### "Backend shows offline on dashboard"
```bash
# Wait 2-3 minutes for Railway to finish deploying
# Then check logs:
railway logs
```

### "Database connection failed"
```bash
# Verify DATABASE_URL is set in Railway:
railway variables

# Should show DATABASE_URL=postgresql://...
```

---

## 🎉 Success!

When deployment is complete, you'll have:

✅ **Frontend**: Live on Vercel  
✅ **Backend**: Live on Railway  
✅ **Database**: Live on Supabase  
✅ **AI Systems**: All 4 engines running  
✅ **Automation**: PR/Issue management active  
✅ **Integrations**: GitHub webhooks configured  
✅ **Monitoring**: Real-time dashboard  
✅ **Revenue**: Systems ready for monetization  

**All 22 TITAN systems deployed and operational!** 🚀

---

## 👁️ What's Next?

1. **Test automation**: Create a test PR and watch TITAN handle it
2. **Configure revenue**: Set up Stripe for subscriptions
3. **Add monitoring**: Connect analytics and alerts
4. **Scale up**: When ready, upgrade to paid tiers for more power

**Welcome to autonomous development!** 🤖
