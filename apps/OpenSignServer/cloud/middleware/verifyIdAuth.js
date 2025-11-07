/**
 * VerifyID Authentication Middleware for SignIt
 * Handles JWT validation and user account linking
 */

import {
  validateVerifyIdToken,
  checkVerifyIdSubscription,
  lookupVerifyIdUser
} from '../services/verifyIdAuthService.js';

/**
 * Middleware to validate VerifyID JWT token
 * Extracts and validates JWT, attaches decoded data to request
 */
export async function requireVerifyIdAuth(req, res, next) {
  try {
    // Extract token from Authorization header or query param
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.query.token;

    if (!token) {
      return res.status(401).json({
        error: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }

    // Validate token
    const validation = await validateVerifyIdToken(token);

    if (!validation.valid) {
      return res.status(401).json({
        error: validation.error || 'Invalid authentication token',
        code: 'INVALID_TOKEN'
      });
    }

    // Attach VerifyID user data to request
    req.verifyIdUser = {
      userId: validation.userId,
      email: validation.email,
      name: validation.name,
      subscriptionTier: validation.subscriptionTier,
      subscriptionStatus: validation.subscriptionStatus,
      organizationId: validation.organizationId,
      role: validation.role,
      expiresAt: validation.expiresAt
    };

    next();
  } catch (error) {
    console.error('[VerifyID Middleware] Authentication error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Middleware to check active VerifyID subscription
 * Requires requireVerifyIdAuth to run first
 */
export async function requireVerifyIdSubscription(req, res, next) {
  try {
    if (!req.verifyIdUser) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    // Check subscription status from token first (fast path)
    const tokenSub = req.verifyIdUser.subscriptionStatus;
    const tokenTier = req.verifyIdUser.subscriptionTier;

    if (tokenSub === 'active' && tokenTier !== 'none') {
      // Token indicates active subscription
      req.verifyIdSubscription = {
        hasActiveSubscription: true,
        tier: tokenTier,
        status: tokenSub,
        source: 'token'
      };
      return next();
    }

    // Token indicates no subscription or inactive - verify with API
    console.log(`[VerifyID Middleware] Checking subscription for user ${req.verifyIdUser.userId}`);

    const subscription = await checkVerifyIdSubscription(req.verifyIdUser.userId);

    if (subscription.error) {
      console.error('[VerifyID Middleware] Subscription check failed:', subscription.error);
      // Allow through on API error, but flag it
      req.verifyIdSubscription = {
        hasActiveSubscription: false,
        error: subscription.error,
        source: 'api_error'
      };
    } else {
      req.verifyIdSubscription = subscription;
      req.verifyIdSubscription.source = 'api';
    }

    if (!req.verifyIdSubscription.hasActiveSubscription) {
      return res.status(403).json({
        error: 'Active subscription required',
        code: 'NO_SUBSCRIPTION',
        subscription: {
          tier: req.verifyIdSubscription.tier || 'none',
          status: req.verifyIdSubscription.status || 'inactive'
        }
      });
    }

    next();
  } catch (error) {
    console.error('[VerifyID Middleware] Subscription check error:', error);
    return res.status(500).json({
      error: 'Subscription verification failed',
      code: 'SUBSCRIPTION_ERROR'
    });
  }
}

/**
 * Find or create SignIt user linked to VerifyID account
 * @param {Object} verifyIdUser - VerifyID user data from token
 * @returns {Promise<Object>} Parse User object
 */
export async function findOrCreateSignItUser(verifyIdUser) {
  try {
    // Parse is globally available in cloud code
    if (typeof Parse === 'undefined') {
      throw new Error('Parse not available');
    }

    // Try to find existing user by email
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo('email', verifyIdUser.email);
    let user = await userQuery.first({ useMasterKey: true });

    if (user) {
      // User exists - update VerifyID linking if needed
      const currentVerifyIdUserId = user.get('verifyIdUserId');

      if (currentVerifyIdUserId !== verifyIdUser.userId) {
        user.set('verifyIdUserId', verifyIdUser.userId);
        user.set('verifyIdLinkedAt', new Date());
        await user.save(null, { useMasterKey: true });
        console.log(`[VerifyID Auth] Linked existing user ${user.id} to VerifyID user ${verifyIdUser.userId}`);
      }

      // Check if extended user record exists, create if missing
      const extUserQuery = new Parse.Query('contracts_Users');
      extUserQuery.equalTo('UserId', user);
      const extUser = await extUserQuery.first({ useMasterKey: true });

      if (!extUser) {
        console.log(`[VerifyID Auth] Creating missing extended user record for existing user ${user.id}`);
        const newExtUser = new Parse.Object('contracts_Users');
        newExtUser.set('Name', user.get('name') || verifyIdUser.name || verifyIdUser.email);
        newExtUser.set('Email', user.get('email'));
        newExtUser.set('UserRole', 'contracts_User');
        newExtUser.set('UserId', user);
        newExtUser.set('CreatedBy', user);

        const acl = new Parse.ACL();
        acl.setPublicReadAccess(false);
        acl.setPublicWriteAccess(false);
        acl.setReadAccess(user.id, true);
        acl.setWriteAccess(user.id, true);
        newExtUser.setACL(acl);

        await newExtUser.save(null, { useMasterKey: true });
        console.log(`[VerifyID Auth] Created extended user record for existing user`);
      }

      return user;
    }

    // User doesn't exist - create new SignIt user
    console.log(`[VerifyID Auth] Creating new SignIt user for VerifyID user ${verifyIdUser.userId}`);

    const User = Parse.Object.extend(Parse.User);
    user = new User();

    // Generate random password (user won't use it - authenticates via VerifyID)
    // Use Parse's built-in crypto or generate a random string
    const randomPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);

    user.set('username', verifyIdUser.email);
    user.set('email', verifyIdUser.email);
    user.set('password', randomPassword);
    user.set('name', verifyIdUser.name);
    user.set('verifyIdUserId', verifyIdUser.userId);
    user.set('verifyIdLinkedAt', new Date());
    user.set('authProvider', 'verifyid');

    await user.signUp(null, { useMasterKey: true });

    console.log(`[VerifyID Auth] Created SignIt user ${user.id} linked to VerifyID user ${verifyIdUser.userId}`);

    // Create extended user record (contracts_Users)
    console.log(`[VerifyID Auth] Creating extended user record for ${user.id}`);
    const extUser = new Parse.Object('contracts_Users');
    extUser.set('Name', verifyIdUser.name || verifyIdUser.email);
    extUser.set('Email', verifyIdUser.email);
    extUser.set('UserRole', 'contracts_User'); // Default role for VerifyID users
    extUser.set('UserId', user);
    extUser.set('CreatedBy', user); // Self-created

    // Set ACL
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setPublicWriteAccess(false);
    acl.setReadAccess(user.id, true);
    acl.setWriteAccess(user.id, true);
    extUser.setACL(acl);

    await extUser.save(null, { useMasterKey: true });
    console.log(`[VerifyID Auth] Created extended user record`);

    return user;
  } catch (error) {
    console.error('[VerifyID Auth] Error finding/creating user:', error);
    throw error;
  }
}

/**
 * Find or create SignIt organization linked to VerifyID organization
 * @param {string} verifyIdOrgId - VerifyID organization ID
 * @param {Object} user - Parse User object
 * @returns {Promise<Object>} Parse Tenant object
 */
export async function findOrCreateSignItOrganization(verifyIdOrgId, user) {
  try {
    // Parse is globally available in cloud code
    if (typeof Parse === 'undefined') {
      throw new Error('Parse not available');
    }

    if (!verifyIdOrgId) {
      console.log('[VerifyID Auth] No organization ID provided');
      return null;
    }

    // Look for existing organization linked to this VerifyID org
    const tenantQuery = new Parse.Query('partners_Tenant');
    tenantQuery.equalTo('verifyIdOrgId', verifyIdOrgId);
    let tenant = await tenantQuery.first({ useMasterKey: true });

    let isNewTenant = false;

    if (tenant) {
      console.log(`[VerifyID Auth] Found existing organization ${tenant.id} for VerifyID org ${verifyIdOrgId}`);
    } else {
      // Organization doesn't exist - fetch details from VerifyID and create
      console.log(`[VerifyID Auth] Creating new organization for VerifyID org ${verifyIdOrgId}`);

      // TODO: Fetch organization details from VerifyID API
      // For now, create with minimal info
      const Tenant = Parse.Object.extend('partners_Tenant');
      tenant = new Tenant();

      tenant.set('TenantName', `VerifyID Organization ${verifyIdOrgId.substring(0, 8)}`);
      tenant.set('verifyIdOrgId', verifyIdOrgId);
      tenant.set('verifyIdLinkedAt', new Date());
      tenant.set('UserId', user); // Pass Parse.User object, not string ID

      const acl = new Parse.ACL();
      acl.setPublicReadAccess(false);
      acl.setPublicWriteAccess(false);
      acl.setReadAccess(user.id, true);
      acl.setWriteAccess(user.id, true);
      tenant.setACL(acl);

      await tenant.save(null, { useMasterKey: true });

      console.log(`[VerifyID Auth] Created organization ${tenant.id} for VerifyID org ${verifyIdOrgId}`);
      isNewTenant = true;
    }

    // ALWAYS update user's extended record with TenantId (whether org is new or existing)
    console.log(`[VerifyID Auth] Linking extended user to organization ${tenant.id}`);
    try {
      const extUserQuery = new Parse.Query('contracts_Users');
      extUserQuery.equalTo('UserId', user);
      const extUser = await extUserQuery.first({ useMasterKey: true });

      if (extUser) {
        const currentTenantId = extUser.get('TenantId')?.id;
        if (currentTenantId !== tenant.id) {
          extUser.set('TenantId', tenant);
          await extUser.save(null, { useMasterKey: true });
          console.log(`[VerifyID Auth] Updated extended user with TenantId ${tenant.id}`);
        } else {
          console.log(`[VerifyID Auth] Extended user already linked to TenantId ${tenant.id}`);
        }
      } else {
        console.error(`[VerifyID Auth] Extended user not found for user ${user.id}!`);
      }
    } catch (err) {
      console.error(`[VerifyID Auth] Failed to update extended user with TenantId:`, err);
      // Don't throw - organization was created successfully
    }

    return tenant;
  } catch (error) {
    console.error('[VerifyID Auth] Error finding/creating organization:', error);
    throw error;
  }
}

/**
 * Get or create session token for SignIt user
 * @param {Object} user - Parse User object
 * @returns {Promise<string>} Session token
 */
export async function createSignItSession(user) {
  try {
    console.log('[VerifyID Auth] createSignItSession called for user:', user.id);

    // Parse is globally available in cloud code
    if (typeof Parse === 'undefined') {
      throw new Error('Parse not available');
    }

    // After signUp(), the user object has a sessionToken property
    console.log('[VerifyID Auth] Checking user.sessionToken:', !!user.sessionToken);
    if (user.sessionToken) {
      console.log('[VerifyID Auth] Using existing sessionToken from user object');
      return user.sessionToken;
    }

    // For existing users, get the session token from the method
    // This only works if the user was fetched with session context
    console.log('[VerifyID Auth] Trying user.getSessionToken()');
    try {
      const sessionToken = user.getSessionToken();
      if (sessionToken) {
        console.log('[VerifyID Auth] Got sessionToken from getSessionToken()');
        return sessionToken;
      }
    } catch (e) {
      // getSessionToken() might not be available in all contexts
      console.log('[VerifyID Auth] getSessionToken not available:', e.message);
    }

    // Check for existing active sessions
    console.log('[VerifyID Auth] Querying for existing sessions');
    const sessionQuery = new Parse.Query(Parse.Session);
    sessionQuery.equalTo('user', user);
    sessionQuery.descending('createdAt');
    const existingSession = await sessionQuery.first({ useMasterKey: true });

    if (existingSession) {
      // Session token is accessed directly as a property, not via .get()
      const existingToken = existingSession.sessionToken || existingSession.get('sessionToken');
      console.log('[VerifyID Auth] Found existing session ID:', existingSession.id);
      console.log('[VerifyID Auth] Session token exists:', !!existingToken);

      if (existingToken) {
        console.log('[VerifyID Auth] Returning existing session token');
        return existingToken;
      }

      // Old session without token - delete it
      console.log('[VerifyID Auth] Existing session has no token, deleting old session');
      try {
        await existingSession.destroy({ useMasterKey: true });
        console.log('[VerifyID Auth] Deleted old session');
      } catch (err) {
        console.error('[VerifyID Auth] Failed to delete old session:', err);
      }
    }

    console.log('[VerifyID Auth] No existing session found, will create new one');

    // Call Parse Cloud Function to create session
    // Cloud functions have access to Parse internals and can create sessions properly
    console.log('[VerifyID Auth] Creating session via cloud function for user:', user.id);

    const result = await Parse.Cloud.run('createusersession', {
      userId: user.id
    });

    if (!result || !result.sessionToken) {
      console.error('[VerifyID Auth] Cloud function did not return session token:', result);
      throw new Error('Failed to create session token');
    }

    console.log('[VerifyID Auth] Successfully created session token via cloud function');

    return result.sessionToken;
  } catch (error) {
    console.error('[VerifyID Auth] Error creating session:', error);
    throw error;
  }
}

export default {
  requireVerifyIdAuth,
  requireVerifyIdSubscription,
  findOrCreateSignItUser,
  findOrCreateSignItOrganization,
  createSignItSession
};
