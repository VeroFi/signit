/**
 * Parse Cloud Function: verifyIdLogin
 * Authenticates user with VerifyID JWT token and returns SignIt session
 */

import {
  validateVerifyIdToken,
  checkVerifyIdSubscription
} from '../services/verifyIdAuthService.js';
import {
  findOrCreateSignItUser,
  findOrCreateSignItOrganization,
  createSignItSession
} from '../middleware/verifyIdAuth.js';

export default async function verifyIdLogin(request) {
  try {
    const { token } = request.params;

    if (!token) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'VerifyID token is required');
    }

    console.log('[VerifyID Login] Validating token...');

    // Step 1: Validate VerifyID token
    const validation = await validateVerifyIdToken(token);

    if (!validation.valid) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        validation.error || 'Invalid VerifyID token'
      );
    }

    console.log(`[VerifyID Login] Token valid for user ${validation.userId} (${validation.email})`);

    const verifyIdUser = {
      userId: validation.userId,
      email: validation.email,
      name: validation.name,
      subscriptionTier: validation.subscriptionTier,
      subscriptionStatus: validation.subscriptionStatus,
      organizationId: validation.organizationId,
      role: validation.role,
      expiresAt: validation.expiresAt
    };

    // Step 2: Find or create SignIt user
    const signItUser = await findOrCreateSignItUser(verifyIdUser);

    if (!signItUser) {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Failed to create or find user');
    }

    console.log(`[VerifyID Login] SignIt user: ${signItUser.id}`);

    // Step 3: Find or create organization (if applicable)
    let organization = null;
    if (verifyIdUser.organizationId) {
      organization = await findOrCreateSignItOrganization(
        verifyIdUser.organizationId,
        signItUser
      );

      if (organization) {
        console.log(`[VerifyID Login] Organization: ${organization.id}`);
      }
    }

    // Step 4: Check subscription status (optional, for info only)
    let subscriptionInfo = null;
    try {
      const subscription = await checkVerifyIdSubscription(verifyIdUser.userId);
      subscriptionInfo = {
        hasActiveSubscription: subscription.hasActiveSubscription,
        tier: subscription.tier,
        status: subscription.status,
        features: subscription.features || []
      };
    } catch (error) {
      console.warn('[VerifyID Login] Could not fetch subscription info:', error.message);
    }

    // Step 5: Create session token
    const sessionToken = await createSignItSession(signItUser);

    console.log(`[VerifyID Login] Successfully authenticated user ${signItUser.id}`);

    // Return user data and session token
    return {
      sessionToken,
      user: {
        objectId: signItUser.id,
        username: signItUser.get('username'),
        email: signItUser.get('email'),
        name: signItUser.get('name'),
        verifyIdUserId: signItUser.get('verifyIdUserId'),
        authProvider: 'verifyid'
      },
      organization: organization ? {
        objectId: organization.id,
        name: organization.get('TenantName'),
        verifyIdOrgId: organization.get('verifyIdOrgId')
      } : null,
      subscription: subscriptionInfo,
      verifyId: {
        userId: verifyIdUser.userId,
        organizationId: verifyIdUser.organizationId,
        role: verifyIdUser.role
      }
    };
  } catch (error) {
    console.error('[VerifyID Login] Error:', error);

    // Re-throw Parse errors
    if (error instanceof Parse.Error) {
      throw error;
    }

    // Wrap other errors
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `VerifyID login failed: ${error.message}`
    );
  }
}
