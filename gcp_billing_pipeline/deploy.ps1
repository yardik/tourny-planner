# Automated Deployment Script for GCP $20 Billing Pipeline
# Usage: Open PowerShell in this folder and run: .\deploy.ps1

$PROJECT_ID = "shoetracker"
$REGION = "us-central1"
$TOPIC_NAME = "billing-auto-stop-topic"
$FUNCTION_NAME = "stopBillingOnOverBudget"

Write-Host "1. Setting GCP Project to $PROJECT_ID..." -ForegroundColor Cyan
gcloud config set project $PROJECT_ID

Write-Host "2. Enabling required Google Cloud APIs..." -ForegroundColor Cyan
gcloud services enable cloudbilling.googleapis.com cloudfunctions.googleapis.com pubsub.googleapis.com cloudbuild.googleapis.com billingbudgets.googleapis.com

Write-Host "3. Creating Pub/Sub Topic '$TOPIC_NAME' and initializing Service Account..." -ForegroundColor Cyan
gcloud pubsub topics create $TOPIC_NAME
gcloud beta pubsub service-account create --project=$PROJECT_ID

Write-Host "4. Deploying Cloud Function '$FUNCTION_NAME'..." -ForegroundColor Cyan
gcloud functions deploy $FUNCTION_NAME `
  --no-gen2 `
  --runtime nodejs22 `
  --trigger-topic $TOPIC_NAME `
  --region $REGION `
  --entry-point stopBillingOnOverBudget

Write-Host "5. Granting Billing Manager IAM role to Cloud Function..." -ForegroundColor Cyan
$PROJECT_NUMBER = (gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
$SERVICE_ACCOUNT = "$PROJECT_ID@appspot.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$SERVICE_ACCOUNT" `
  --role="roles/billing.projectManager"

Write-Host "=== PIPELINE DEPLOYMENT COMPLETE ===" -ForegroundColor Green
Write-Host "Your $20.00 Real-Time Billing Disconnect Pipeline is active!" -ForegroundColor Green
