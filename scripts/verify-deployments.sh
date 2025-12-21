#!/bin/bash
# Verify all cloud deployments are healthy

echo "🔍 Verifying TITAN deployments across all clouds..."
echo ""

URLs=()

# Collect URLs
read -p "Google Cloud Run URL (or Enter to skip): " GCP_URL
[ ! -z "$GCP_URL" ] && URLs+=("GCP|$GCP_URL")

read -p "AWS URL (or Enter to skip): " AWS_URL
[ ! -z "$AWS_URL" ] && URLs+=("AWS|$AWS_URL")

read -p "Azure URL (or Enter to skip): " AZURE_URL
[ ! -z "$AZURE_URL" ] && URLs+=("Azure|$AZURE_URL")

read -p "Heroku URL (or Enter to skip): " HEROKU_URL
[ ! -z "$HEROKU_URL" ] && URLs+=("Heroku|$HEROKU_URL")

read -p "Railway URL (or Enter to skip): " RAILWAY_URL
[ ! -z "$RAILWAY_URL" ] && URLs+=("Railway|$RAILWAY_URL")

echo ""
echo "Testing deployments..."
echo ""

for url_info in "${URLs[@]}"; do
    IFS='|' read -r platform url <<< "$url_info"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Testing $platform: $url"
    echo ""
    
    # Health check
    if response=$(curl -s -w "\n%{http_code}" "$url/health" 2>/dev/null); then
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n-1)
        
        if [ "$http_code" = "200" ]; then
            echo "✅ $platform: HEALTHY (HTTP $http_code)"
            echo "Response: $body" | jq . 2>/dev/null || echo "$body"
        else
            echo "⚠️  $platform: Response but unhealthy (HTTP $http_code)"
        fi
    else
        echo "❌ $platform: UNREACHABLE"
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Verification complete!"
