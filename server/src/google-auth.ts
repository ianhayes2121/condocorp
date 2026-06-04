import { OAuth2Client } from 'google-auth-library';

function getGoogleClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
  return id;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const client = new OAuth2Client(getGoogleClientId());
  const ticket = await client.verifyIdToken({
    idToken,
    audience: getGoogleClientId(),
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Invalid Google sign-in');
  }

  return {
    googleId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    firstName: (payload.given_name ?? '').trim(),
    lastName: (payload.family_name ?? '').trim(),
  };
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}
