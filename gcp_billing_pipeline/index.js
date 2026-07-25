const { GoogleAuth } = require('google-auth-library');
const { cloudbilling_v1 } = require('googleapis');

const PROJECT_ID = process.env.GCP_PROJECT || 'tourny-planner';
const PROJECT_NAME = `projects/${PROJECT_ID}`;

/**
 * Real-Time GCP Billing Disconnect Cloud Function
 * Triggered automatically by Cloud Billing Pub/Sub alerts.
 */
exports.stopBillingOnOverBudget = async (pubSubEvent, context) => {
  try {
    const pubsubData = JSON.parse(
      Buffer.from(pubSubEvent.data, 'base64').toString()
    );

    console.log(`Billing notification received for project ${PROJECT_ID}:`, pubsubData);

    const costAmount = pubsubData.costAmount || 0;
    const budgetAmount = pubsubData.budgetAmount || 20.0;

    // Trigger billing disconnect if cost exceeds $20.00 or 100% of budget
    if (costAmount >= 20.0 || costAmount >= budgetAmount) {
      console.warn(`CRITICAL: Monthly cost ($${costAmount}) exceeded limit ($20.00). Disconnecting billing account from ${PROJECT_ID} immediately!`);

      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });

      const billing = new cloudbilling_v1.Cloudbilling({ auth });

      // Unbind billing account by setting billingAccountName to an empty string
      const res = await billing.projects.updateBillingInfo({
        name: PROJECT_NAME,
        resource: { billingAccountName: '' }
      });

      console.log(`Successfully disconnected billing account from ${PROJECT_ID}. Response:`, res.data);
    } else {
      console.log(`Current monthly cost ($${costAmount}) is within $20.00 budget. No action taken.`);
    }
  } catch (err) {
    console.error(`Failed to evaluate billing status or disconnect billing:`, err);
    throw err;
  }
};
