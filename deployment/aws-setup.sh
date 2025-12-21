#!/bin/bash
# Deploy TITAN to AWS ECS Fargate
echo "🚀 AWS ECS Fargate Deployment"

REGION="${1:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME="titan"

echo "Creating ECR repository..."
aws ecr create-repository --repository-name $REPO_NAME --region $REGION 2>/dev/null || true

echo "Building and pushing image..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

docker build -t $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest .
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest

echo "Creating ECS cluster..."
aws ecs create-cluster --cluster-name titan-cluster --region $REGION 2>/dev/null || true

echo "✅ TITAN ready for ECS deployment!"
echo "Next: Configure task definition and service"
