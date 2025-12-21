#!/bin/bash
# Verify health of all autonomous business systems

echo "🏥 Autonomous Business Health Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

AUTONOMOUS_SYSTEMS=(
    "tree-of-life-system"
    "APEX-Universal-AI-Operating-System"
    "TITAN-Autonomous-Business-Empire"
    "revenue-agent-system"
    "customer-intelligence-branch"
    "intelligent-customer-data-platform"
    "product-development-branch"
    "intelligent-ci-cd-orchestrator"
    "enterprise-feature-flag-system"
    "marketing-automation-branch"
    "conversational-ai-engine"
    "distributed-job-orchestration-engine"
    "real-time-streaming-analytics"
    "enterprise-mlops-platform"
    "security-sentinel-framework"
    "NEXUS-Quantum-Intelligence-Framework"
    "SINGULARITY-AGI-Research-Platform"
)

BASE_URL="railway.app"  # Change to your deployment URL

HEALTHY=0
UNHEALTHY=0

for system in "${AUTONOMOUS_SYSTEMS[@]}"; do
    URL="https://${system}.up.${BASE_URL}/health"
    
    echo -n "Checking $system... "
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
    
    if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "204" ]; then
        echo "✅ HEALTHY"
        HEALTHY=$((HEALTHY + 1))
    else
        echo "❌ UNHEALTHY (HTTP $RESPONSE)"
        UNHEALTHY=$((UNHEALTHY + 1))
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Health Summary:"
echo "  Healthy: $HEALTHY"
echo "  Unhealthy: $UNHEALTHY"
echo "  Total: ${#AUTONOMOUS_SYSTEMS[@]}"
echo "═══════════════════════════════════════════════════════════"

if [ $UNHEALTHY -eq 0 ]; then
    echo "✅ All autonomous systems operational!"
    exit 0
else
    echo "⚠️  Some systems need attention"
    exit 1
fi
