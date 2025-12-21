#!/bin/bash
# Deploy TITAN to Azure Container Instances
echo "🚀 Azure Container Instances Deployment"

RG_NAME="titan-rg"
ACR_NAME="titanacr"
LOCATION="eastus"

echo "Creating resource group..."
az group create --name $RG_NAME --location $LOCATION

echo "Creating container registry..."
az acr create --resource-group $RG_NAME --name $ACR_NAME --sku Basic

echo "Building image..."
az acr build --registry $ACR_NAME --image titan:latest .

echo "Deploying container..."
az container create \
  --resource-group $RG_NAME \
  --name titan-orchestrator \
  --image $ACR_NAME.azurecr.io/titan:latest \
  --cpu 1 \
  --memory 2 \
  --ports 3000

echo "✅ TITAN deployed to Azure!"
