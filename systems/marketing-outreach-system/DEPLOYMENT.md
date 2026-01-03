# Marketing Outreach System - Deployment Guide

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- API keys for:
  - SendGrid/Mailchimp (Email)
  - LinkedIn/Twitter/Facebook (Social)
  - Salesforce/HubSpot/Pipedrive (CRM)
  - OpenAI (Content generation)

### Deploy to Production

```bash
# 1. Clone the repository
git clone https://github.com/Garrettc123/tree-of-life-system.git
cd systems/marketing-outreach-system

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials and API keys

# 3. Deploy with Docker Compose
docker-compose up -d

# 4. Verify health
curl http://localhost:8000/health

# 5. Access API
http://localhost:8000/docs  # OpenAPI documentation
```

## Configuration

Edit `config.yaml` to:
- Select primary CRM (Salesforce/HubSpot/Pipedrive)
- Configure email providers (SendGrid/Mailchimp/Amazon SES)
- Set social media platforms
- Enable compliance frameworks (CAN-SPAM/GDPR/CCPA/CASL)
- Configure AI models and analytics providers

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/marketing_outreach

# API
API_HOST=0.0.0.0
API_PORT=8000
API_LOG_LEVEL=INFO

# Email Providers
SENDGRID_API_KEY=your_sendgrid_key
MAILCHIMP_API_KEY=your_mailchimp_key

# CRM Integrations
SALESFORCE_CLIENT_ID=your_sf_client_id
SALESFORCE_CLIENT_SECRET=your_sf_secret
HUBSPOT_API_KEY=your_hubspot_key

# Social Media
LINKEDIN_ACCESS_TOKEN=your_linkedin_token
TWITTER_API_KEY=your_twitter_key
FACEBOOK_ACCESS_TOKEN=your_fb_token

# AI Services
OPENAI_API_KEY=your_openai_key
CLAUDE_API_KEY=your_claude_key
```

## Monitoring

### Health Checks

```bash
# API Health
curl http://localhost:8000/health

# Database Health
curl http://localhost:8000/health/db

# Cache Health
curl http://localhost:8000/health/cache

# Email Provider Health
curl http://localhost:8000/health/email

# Social APIs Health
curl http://localhost:8000/health/social
```

### Logs

```bash
# View API logs
docker-compose logs api

# View database logs
docker-compose logs postgres

# Watch logs in real-time
docker-compose logs -f api
```

### Metrics

Metrics are available at `http://localhost:8000/metrics` in Prometheus format.

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.yml
api:
  deploy:
    replicas: 3
```

### Load Balancing

Use nginx or HAProxy to load balance across multiple API instances.

## Database Migrations

```bash
# Run migrations
docker-compose exec api python manage.py migrate

# Create superuser
docker-compose exec api python manage.py createsuperuser

# Rollback migration
docker-compose exec api python manage.py migrate --rollback
```

## Backup & Recovery

### Backup Database

```bash
docker-compose exec postgres pg_dump -U marketing marketing_outreach > backup.sql
```

### Restore Database

```bash
docker-compose exec -T postgres psql -U marketing marketing_outreach < backup.sql
```

## Security

### SSL/TLS Setup

```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365

# Update docker-compose.yml to use HTTPS
```

### Firewall Rules

```bash
# Allow API traffic
sudo ufw allow 8000

# Allow database (internal only)
sudo ufw allow from 0.0.0.0/0 to any port 5432
```

## Troubleshooting

### API Won't Start

1. Check logs: `docker-compose logs api`
2. Verify configuration: `cat config.yaml`
3. Test database connection
4. Check environment variables

### Database Connection Errors

1. Verify PostgreSQL is running: `docker-compose ps postgres`
2. Check credentials in DATABASE_URL
3. Test connection: `psql postgresql://user:password@host/db`

### Email Delivery Issues

1. Verify SendGrid API key
2. Check sender email authentication (SPF/DKIM)
3. Review bounce handling: `/api/v1/analytics/email/bounces`
4. Check spam score: `/api/v1/health/email`

## Integration with Tree of Life

The system automatically integrates with your Tree of Life infrastructure:

```bash
# Verify integration
curl http://localhost:8000/api/v1/system/status

# Expected response
{
  "status": "operational",
  "tree_of_life_integration": "connected",
  "components": {
    "lead_engine": "active",
    "email_automation": "active",
    "social_outreach": "active",
    "compliance": "active",
    "analytics": "active"
  }
}
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/Garrettc123/tree-of-life-system/issues
- Documentation: https://github.com/Garrettc123/tree-of-life-system/docs
- Email: support@example.com

---

**Version**: 1.0.0 | **Last Updated**: 2026-01-03
