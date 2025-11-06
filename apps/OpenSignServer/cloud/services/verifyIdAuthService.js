/**
 * VerifyID Authentication Service
 * Validates JWT tokens from VerifyID and checks subscription status
 */

import jwt from 'jsonwebtoken';
import axios from 'axios';

const VERIFYID_PUBLIC_KEY_URL = process.env.VERIFYID_PUBLIC_KEY_URL ||
  'https://verifyid.verofi.co/api/auth/public-key';
const VERIFYID_API_URL = process.env.VERIFYID_API_URL ||
  'https://verifyid.verofi.co/api';
const VERIFYID_API_KEY = process.env.VERIFYID_API_KEY;

// Cache for public key (refresh every 24 hours)
let cachedPublicKey = null;
let keyFetchedAt = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch VerifyID's public key for JWT validation
 */
async function getVerifyIdPublicKey() {
  if (cachedPublicKey && keyFetchedAt && (Date.now() - keyFetchedAt < CACHE_DURATION)) {
    return cachedPublicKey;
  }

  try {
    console.log('[VerifyID Auth] Fetching public key from:', VERIFYID_PUBLIC_KEY_URL);
    const response = await axios.get(VERIFYID_PUBLIC_KEY_URL, { timeout: 10000 });

    cachedPublicKey = response.data.publicKey;
    keyFetchedAt = Date.now();

    console.log('[VerifyID Auth] Successfully fetched and cached public key');
    return cachedPublicKey;
  } catch (error) {
    console.error('[VerifyID Auth] Failed to fetch public key:', error.message);
    throw new Error('Unable to validate VerifyID token - public key unavailable');
  }
}

/**
 * Validate JWT token from VerifyID
 * @param {string} token - JWT token from VerifyID
 * @returns {Promise<{valid: boolean, userId?: string, email?: string, subscriptionTier?: string, subscriptionStatus?: string, error?: string}>}
 */
export async function validateVerifyIdToken(token) {
  try {
    const publicKey = await getVerifyIdPublicKey();

    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'verifyid.verofi.co',
      audience: 'signit.verofi.co'
    });

    console.log(`[VerifyID Auth] Token validated for user: ${decoded.sub}`);

    return {
      valid: true,
      userId: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      subscriptionTier: decoded.subscriptionTier,
      subscriptionStatus: decoded.subscriptionStatus,
      organizationId: decoded.organizationId,
      role: decoded.role,
      expiresAt: decoded.exp
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn('[VerifyID Auth] Token expired:', error.message);
      return { valid: false, error: 'Token expired' };
    }

    if (error.name === 'JsonWebTokenError') {
      console.warn('[VerifyID Auth] Invalid token:', error.message);
      return { valid: false, error: 'Invalid token' };
    }

    console.error('[VerifyID Auth] Token validation error:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Check subscription status via VerifyID API
 * @param {string} userId - VerifyID user ID
 * @returns {Promise<{hasActiveSubscription: boolean, tier?: string, expiresAt?: Date, features?: string[], error?: string}>}
 */
export async function checkVerifyIdSubscription(userId) {
  if (!VERIFYID_API_KEY) {
    console.error('[VerifyID Auth] VERIFYID_API_KEY not configured');
    return { hasActiveSubscription: false, error: 'Service not configured' };
  }

  try {
    console.log(`[VerifyID Auth] Checking subscription for user: ${userId}`);

    const response = await axios.get(
      `${VERIFYID_API_URL}/subscription/check/${userId}`,
      {
        headers: {
          'X-API-Key': VERIFYID_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    console.log(`[VerifyID Auth] Subscription check result:`, response.data);

    return {
      hasActiveSubscription: response.data.active,
      tier: response.data.tier,
      status: response.data.status,
      expiresAt: response.data.expiresAt ? new Date(response.data.expiresAt) : null,
      features: response.data.features || []
    };
  } catch (error) {
    if (error.response) {
      console.error(`[VerifyID Auth] API error ${error.response.status}:`, error.response.data);
      return {
        hasActiveSubscription: false,
        error: error.response.data?.error || 'Subscription check failed'
      };
    }

    console.error('[VerifyID Auth] Network error checking subscription:', error.message);
    return { hasActiveSubscription: false, error: error.message };
  }
}

/**
 * Look up VerifyID user by email
 * @param {string} email - User's email address
 * @returns {Promise<{found: boolean, user?: any, error?: string}>}
 */
export async function lookupVerifyIdUser(email) {
  if (!VERIFYID_API_KEY) {
    console.error('[VerifyID Auth] VERIFYID_API_KEY not configured');
    return { found: false, error: 'Service not configured' };
  }

  try {
    const response = await axios.post(
      `${VERIFYID_API_URL}/user/lookup`,
      { email },
      {
        headers: {
          'X-API-Key': VERIFYID_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    return {
      found: true,
      user: response.data
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return { found: false };
    }

    console.error('[VerifyID Auth] User lookup error:', error.message);
    return { found: false, error: error.message };
  }
}

export default {
  validateVerifyIdToken,
  checkVerifyIdSubscription,
  lookupVerifyIdUser,
  getVerifyIdPublicKey
};
