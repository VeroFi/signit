/**
 * VerifyID Authentication Routes for SignIt
 * Handles SSO login from VerifyID platform
 */

import express from 'express';
import {
  requireVerifyIdAuth,
  requireVerifyIdSubscription,
  findOrCreateSignItUser,
  findOrCreateSignItOrganization,
  createSignItSession
} from '../middleware/verifyIdAuth.js';

const router = express.Router();

/**
 * VerifyID SSO Login Endpoint
 * User is redirected here from VerifyID with JWT token
 * Flow: Validate token → Find/create user → Find/create org → Create session → Redirect
 */
router.get('/verifyid', requireVerifyIdAuth, async (req, res) => {
  try {
    const verifyIdUser = req.verifyIdUser;

    console.log(`[VerifyID Auth] Processing login for VerifyID user ${verifyIdUser.userId} (${verifyIdUser.email})`);

    // Step 1: Find or create SignIt user linked to VerifyID account
    const signItUser = await findOrCreateSignItUser(verifyIdUser);

    if (!signItUser) {
      throw new Error('Failed to find or create SignIt user');
    }

    // Step 2: Find or create organization if VerifyID org exists
    let organization = null;
    if (verifyIdUser.organizationId) {
      organization = await findOrCreateSignItOrganization(
        verifyIdUser.organizationId,
        signItUser
      );
    }

    // Step 3: Create Parse session token
    const sessionToken = await createSignItSession(signItUser);

    if (!sessionToken) {
      throw new Error('Session token creation returned undefined');
    }

    console.log(`[VerifyID Auth] Successfully authenticated user ${signItUser.id} with session token`);

    // Step 4: Redirect to SignIt frontend with session token
    // Frontend will store the session token and use it for subsequent requests
    const frontendUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/verifyid-login?` +
      `token=${encodeURIComponent(sessionToken)}` +
      `&userId=${encodeURIComponent(signItUser.id)}` +
      (organization ? `&orgId=${encodeURIComponent(organization.id)}` : '');

    console.log(`[VerifyID Auth] Redirecting to: ${redirectUrl.substring(0, 100)}...`);

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('[VerifyID Auth] Authentication error:', error);

    const frontendUrl = process.env.PUBLIC_URL || 'https://signit.verofi.co';
    const errorUrl = `${frontendUrl}/login?error=verifyid_auth_failed&message=${encodeURIComponent(error.message)}`;

    res.redirect(errorUrl);
  }
});

/**
 * Validate VerifyID Token Endpoint
 * API endpoint to check if a VerifyID token is valid
 */
router.post('/verifyid/validate', requireVerifyIdAuth, (req, res) => {
  res.json({
    valid: true,
    user: req.verifyIdUser
  });
});

/**
 * Check Subscription Endpoint
 * Validates both token and active subscription
 */
router.get('/verifyid/subscription', requireVerifyIdAuth, requireVerifyIdSubscription, (req, res) => {
  res.json({
    hasActiveSubscription: req.verifyIdSubscription.hasActiveSubscription,
    tier: req.verifyIdSubscription.tier,
    status: req.verifyIdSubscription.status,
    features: req.verifyIdSubscription.features || [],
    source: req.verifyIdSubscription.source
  });
});

/**
 * Link Existing Account Endpoint
 * Allows existing SignIt users to link their account to VerifyID
 */
router.post('/verifyid/link', requireVerifyIdAuth, async (req, res) => {
  try {
    // Parse is globally available
    if (typeof Parse === 'undefined') {
      return res.status(500).json({
        error: 'Server configuration error',
        code: 'PARSE_NOT_AVAILABLE'
      });
    }

    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        error: 'Session token required',
        code: 'NO_SESSION_TOKEN'
      });
    }

    // Verify the user's existing SignIt session
    const session = await Parse.Session.getSessionToken(sessionToken, { useMasterKey: true });
    const signItUser = await session.get('user').fetch({ useMasterKey: true });

    const verifyIdUser = req.verifyIdUser;

    // Check if emails match
    if (signItUser.get('email') !== verifyIdUser.email) {
      return res.status(400).json({
        error: 'Email mismatch - cannot link accounts',
        code: 'EMAIL_MISMATCH',
        signItEmail: signItUser.get('email'),
        verifyIdEmail: verifyIdUser.email
      });
    }

    // Link the accounts
    signItUser.set('verifyIdUserId', verifyIdUser.userId);
    signItUser.set('verifyIdLinkedAt', new Date());
    await signItUser.save(null, { useMasterKey: true });

    console.log(`[VerifyID Auth] Linked existing SignIt user ${signItUser.id} to VerifyID user ${verifyIdUser.userId}`);

    res.json({
      success: true,
      message: 'Accounts linked successfully',
      userId: signItUser.id,
      verifyIdUserId: verifyIdUser.userId
    });
  } catch (error) {
    console.error('[VerifyID Auth] Account linking error:', error);
    res.status(500).json({
      error: 'Failed to link accounts',
      code: 'LINK_ERROR',
      message: error.message
    });
  }
});

/**
 * Get VerifyID User Info Endpoint
 * Returns info about the VerifyID user from their token
 */
router.get('/verifyid/me', requireVerifyIdAuth, (req, res) => {
  res.json({
    user: req.verifyIdUser
  });
});

export default router;
