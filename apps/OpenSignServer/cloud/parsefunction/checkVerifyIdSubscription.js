/**
 * Parse Cloud Function: checkVerifyIdSubscription
 * Checks if the current user has an active VerifyID subscription
 */

import { checkVerifyIdSubscription as checkSubscription } from '../services/verifyIdAuthService.js';

export default async function checkVerifyIdSubscription(request) {
  try {
    const user = request.user;

    if (!user) {
      throw new Parse.Error(Parse.Error.SESSION_MISSING, 'User must be authenticated');
    }

    // Get VerifyID user ID from the user object
    const verifyIdUserId = user.get('verifyIdUserId');

    if (!verifyIdUserId) {
      // User is not linked to VerifyID
      return {
        linked: false,
        hasActiveSubscription: false,
        message: 'User is not linked to a VerifyID account'
      };
    }

    console.log(`[Check Subscription] Checking subscription for VerifyID user ${verifyIdUserId}`);

    // Check subscription via VerifyID API
    const subscription = await checkSubscription(verifyIdUserId);

    if (subscription.error) {
      console.error('[Check Subscription] Error:', subscription.error);
      throw new Parse.Error(
        Parse.Error.INTERNAL_SERVER_ERROR,
        `Failed to check subscription: ${subscription.error}`
      );
    }

    return {
      linked: true,
      verifyIdUserId,
      hasActiveSubscription: subscription.hasActiveSubscription,
      tier: subscription.tier,
      status: subscription.status,
      expiresAt: subscription.expiresAt,
      features: subscription.features || []
    };
  } catch (error) {
    console.error('[Check Subscription] Error:', error);

    // Re-throw Parse errors
    if (error instanceof Parse.Error) {
      throw error;
    }

    // Wrap other errors
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `Subscription check failed: ${error.message}`
    );
  }
}
