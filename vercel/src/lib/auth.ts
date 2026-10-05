import type { NextApiRequest } from 'next';
import { verifyFirebaseToken } from './firebase';

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
};

export async function getAuthenticatedUser(req: NextApiRequest): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return null;

  const decodedUser = await verifyFirebaseToken(token);
  if (!decodedUser) return null;

  return {
    uid: decodedUser.uid,
    email: decodedUser.email,
  };
}
