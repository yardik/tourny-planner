# Real-Time $20 GCP Billing Disconnect Pipeline

This pipeline automatically **disconnects your Google Cloud Billing Account** from your project `tourny-planner` as soon as monthly cost reaches or exceeds **$20.00**, immediately shutting down billable services and halting runaway charges in real time.

---

## How It Works

```
Google Cloud Billing Budget ($20.00 Limit)
           │ (Pub/Sub Alert)
           ▼
 Pub/Sub Topic: billing-auto-stop-topic
           │
           ▼
 Cloud Function: stopBillingOnOverBudget
           │
           ▼ (Calls Cloud Billing API)
 Unlinks Billing Account from project "tourny-planner" (Halts paid services)
```

---

## 🚀 Deployment Instructions

### Method A: Automated Deployment via `gcloud` CLI

Run the following commands in your Google Cloud SDK shell:

```bash
# 1. Set project ID
export PROJECT_ID="tourny-planner"
gcloud config set project $PROJECT_ID

# 2. Enable required Google Cloud APIs
gcloud services enable cloudbilling.googleapis.com cloudfunctions.googleapis.com pubsub.googleapis.com cloudbuild.googleapis.com

# 3. Create Pub/Sub Topic
gcloud pubsub topics create billing-auto-stop-topic

# 4. Deploy the Cloud Function
cd gcp_billing_pipeline
gcloud functions deploy stopBillingOnOverBudget \
  --runtime nodejs22 \
  --trigger-topic billing-auto-stop-topic \
  --region us-central1

# 5. Grant Project Billing Administrator role to the Cloud Function's Service Account
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
export SERVICE_ACCOUNT="$PROJECT_ID@appspot.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/billing.projectManager"
```

---

### Method B: GCP Console Setup (Manual UI Step-by-Step)

If you prefer using the Google Cloud Web Console:

1. **Create Pub/Sub Topic**:
   - Go to [GCP Pub/Sub Topics](https://console.cloud.google.com/cloudpubsub/topic/list?project=tourny-planner).
   - Click **Create Topic** &rarr; Name: `billing-auto-stop-topic` &rarr; Click **Create**.

2. **Create $20.00 Budget & Connect Pub/Sub**:
   - Go to [GCP Billing Budgets](https://console.cloud.google.com/billing/budgets?project=tourny-planner).
   - Click **Create Budget**:
     - **Name**: `Realtime $20 Hard Limit`
     - **Target Amount**: Specified amount &rarr; `$20.00`
     - **Actions & Notifications**: Check **Connect a Pub/Sub topic to this budget** &rarr; Select `projects/tourny-planner/topics/billing-auto-stop-topic`.
   - Click **Finish**.

3. **Deploy Cloud Function**:
   - Go to [GCP Cloud Functions](https://console.cloud.google.com/functions/list?project=tourny-planner).
   - Click **Create Function**:
     - **Function Name**: `stopBillingOnOverBudget`
     - **Trigger**: Cloud Pub/Sub &rarr; Topic: `billing-auto-stop-topic`.
     - **Runtime**: Node.js 18.
     - Paste `index.js` and `package.json` from this directory.
   - Click **Deploy**.

4. **Grant Billing Admin IAM Role**:
   - Go to [GCP IAM & Admin](https://console.cloud.google.com/iam-admin/iam?project=tourny-planner).
   - Find your App Engine / Cloud Function default service account (`tourny-planner@appspot.gserviceaccount.com`).
   - Click **Edit Principal** &rarr; Add Role: **Project Billing Manager** &rarr; Click **Save**.

---

## Verification & Testing

When monthly costs reach $20.00:
1. GCP Billing publishes an alert payload to `billing-auto-stop-topic`.
2. The Cloud Function executes in ~500ms.
3. The Billing Account is removed from `tourny-planner`, preventing any further charges!
