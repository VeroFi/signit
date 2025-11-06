/**
 * VerifyID Webhook Routes for SignIt
 * Handles real-time subscription updates from VerifyID
 */

import express from 'express';
import crypto from 'crypto';

const router = express.Router();

/**
 * Verify webhook signature using HMAC-SHA256
 * @param {string} payload - Raw request body as string
 * @param {string} signature - Signature from x-verifyid-signature header
 * @param {string} secret - Webhook secret from environment
 * @returns {boolean} True if signature is valid
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  // VerifyID sends signature as: sha256=<hex_signature>
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const expectedHeader = `sha256=${expectedSignature}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedHeader)
    );
  } catch (e) {
    // Lengths don't match
    return false;
  }
}

/**
 * Process subscription event and update SignIt user data
 * @param {Object} event - Webhook event data
 */
async function processSubscriptionEvent(event) {
  if (typeof Parse === 'undefined') {
    throw new Error('Parse not available');
  }

  const { type, data } = event;
  const { userId, organizationId, subscription } = data;

  console.log(`[VerifyID Webhook] Processing ${type} for user ${userId}`);

  // Find the linked SignIt user
  const userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo('verifyIdUserId', userId);
  const signItUser = await userQuery.first({ useMasterKey: true });

  if (!signItUser) {
    console.warn(`[VerifyID Webhook] No SignIt user found linked to VerifyID user ${userId}`);
    return { status: 'skipped', reason: 'user_not_found' };
  }

  // Update subscription data on the user object
  signItUser.set('verifyIdSubscriptionTier', subscription.plan || 'none');
  signItUser.set('verifyIdSubscriptionStatus', subscription.status || 'inactive');
  signItUser.set('verifyIdSubscriptionUpdatedAt', new Date());

  if (subscription.currentPeriodEnd) {
    signItUser.set('verifyIdSubscriptionExpiresAt', new Date(subscription.currentPeriodEnd));
  }

  await signItUser.save(null, { useMasterKey: true });

  console.log(`[VerifyID Webhook] Updated subscription for SignIt user ${signItUser.id}: ${subscription.status} (${subscription.plan})`);

  // If organization exists, update it too
  if (organizationId) {
    const tenantQuery = new Parse.Query('partners_Tenant');
    tenantQuery.equalTo('verifyIdOrgId', organizationId);
    const tenant = await tenantQuery.first({ useMasterKey: true });

    if (tenant) {
      tenant.set('verifyIdSubscriptionTier', subscription.plan || 'none');
      tenant.set('verifyIdSubscriptionStatus', subscription.status || 'inactive');
      tenant.set('verifyIdSubscriptionUpdatedAt', new Date());
      await tenant.save(null, { useMasterKey: true });

      console.log(`[VerifyID Webhook] Updated organization ${tenant.id} subscription`);
    }
  }

  return { status: 'processed', userId: signItUser.id };
}

/**
 * VerifyID Webhook Endpoint
 * Receives subscription change events from VerifyID
 *
 * Expected event types:
 * - subscription.created
 * - subscription.updated
 * - subscription.canceled
 * - subscription.expired
 */
router.post('/verifyid', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-verifyid-signature'];
    const webhookSecret = process.env.VERIFYID_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[VerifyID Webhook] VERIFYID_WEBHOOK_SECRET not configured');
      return res.status(500).json({
        error: 'Webhook not configured',
        code: 'NO_WEBHOOK_SECRET'
      });
    }

    // Get raw body as string for signature verification
    const rawBody = req.body.toString('utf8');

    // Verify webhook signature
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      console.error('[VerifyID Webhook] Invalid signature');
      return res.status(401).json({
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Parse the JSON body
    const event = JSON.parse(rawBody);

    console.log(`[VerifyID Webhook] Received event: ${event.type}`);

    // Validate event structure
    if (!event.type || !event.data) {
      return res.status(400).json({
        error: 'Invalid event structure',
        code: 'INVALID_EVENT'
      });
    }

    // Process subscription events
    if (event.type.startsWith('subscription.')) {
      const result = await processSubscriptionEvent(event);

      return res.json({
        received: true,
        eventType: event.type,
        result
      });
    }

    // Unknown event type
    console.log(`[VerifyID Webhook] Unknown event type: ${event.type}`);
    return res.json({
      received: true,
      eventType: event.type,
      status: 'ignored'
    });

  } catch (error) {
    console.error('[VerifyID Webhook] Error processing webhook:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      code: 'PROCESSING_ERROR',
      message: error.message
    });
  }
});

/**
 * Health check endpoint for webhook
 */
router.get('/verifyid/health', (req, res) => {
  res.json({
    status: 'ok',
    webhook: 'verifyid',
    timestamp: new Date().toISOString()
  });
});

export default router;
