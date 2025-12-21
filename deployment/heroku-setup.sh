#!/bin/bash
# Deploy TITAN to Heroku
echo "🚀 Heroku Deployment"

APP_NAME="${1:-titan-orchestrator}"

if ! command -v heroku &> /dev/null; then
  echo "❌ Heroku CLI not installed"
  exit 1
fi

echo "Creating Heroku app..."
heroku create $APP_NAME

echo "Setting environment variables..."
echo "Enter your API keys (will be hidden):"
read -sp "GITHUB_TOKEN: " GITHUB_TOKEN && heroku config:set GITHUB_TOKEN=$GITHUB_TOKEN --app $APP_NAME
read -sp "OPENAI_API_KEY: " OPENAI_API_KEY && heroku config:set OPENAI_API_KEY=$OPENAI_API_KEY --app $APP_NAME
read -sp "LINEAR_API_KEY: " LINEAR_API_KEY && heroku config:set LINEAR_API_KEY=$LINEAR_API_KEY --app $APP_NAME
read -sp "NOTION_API_KEY: " NOTION_API_KEY && heroku config:set NOTION_API_KEY=$NOTION_API_KEY --app $APP_NAME
read -sp "STRIPE_SECRET_KEY: " STRIPE_SECRET_KEY && heroku config:set STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY --app $APP_NAME

heroku config:set NODE_ENV=production --app $APP_NAME

echo "Deploying..."
heroku container:login
heroku container:push web --app $APP_NAME
heroku container:release web --app $APP_NAME

echo "✅ TITAN deployed to Heroku!"
echo "URL: https://$APP_NAME.herokuapp.com"
