/**
 * Parse Cloud Function: createUserSession
 * Creates a Parse session for a user using internal Parse methods
 * This works because cloud functions have access to Parse internals
 */

export default async function createUserSession(request) {
  const { userId } = request.params;

  if (!userId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'userId is required');
  }

  try {
    console.log(`[createUserSession] Creating session for user: ${userId}`);

    // Fetch the user
    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(userId, { useMasterKey: true });

    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'User not found');
    }

    // Use Parse.User.become() to create a session
    // This is a hack: we'll use the user's objectId to create a temporary session token
    // then query for the actual session

    // Actually, the proper way: Use Parse.Session._create (internal method)
    // But since that's not exposed, we'll use a different approach

    // Create installation ID for this session
    const installationId = `verifyid-${userId}-${Date.now()}`;

    // Use Parse's internal session creation by becoming the user
    // First, we need to generate a session token
    const crypto = await import('crypto');
    const sessionToken = 'r:' + crypto.randomBytes(24).toString('base64');

    // Create the session object with proper structure
    const sessionObject = new Parse.Object('_Session');
    sessionObject.set('restricted', false);
    sessionObject.set('user', user);
    sessionObject.set('createdWith', {
      action: 'login',
      authProvider: 'verifyid'
    });
    sessionObject.set('installationId', installationId);
    sessionObject.set('sessionToken', sessionToken);
    sessionObject.set('expiresAt', new Date(Date.now() + (365 * 24 * 60 * 60 * 1000))); // 1 year

    await sessionObject.save(null, { useMasterKey: true });

    console.log(`[createUserSession] Session created: ${sessionObject.id}`);

    return {
      sessionToken: sessionToken,
      sessionId: sessionObject.id,
      userId: user.id
    };
  } catch (error) {
    console.error('[createUserSession] Error:', error);

    if (error instanceof Parse.Error) {
      throw error;
    }

    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `Session creation failed: ${error.message}`
    );
  }
}
