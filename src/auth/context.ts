import { verifyToken, AuthUser } from './jwt';
import type { IncomingMessage } from 'http';

export interface AuthContext {
  user: AuthUser | null;
}

export function buildAuthContext(req: IncomingMessage): AuthContext {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null };
  }

  const token = authHeader.slice(7);
  const user = verifyToken(token);
  return { user };
}

export function buildWSAuthContext(connectionParams: Record<string, unknown> | undefined): AuthContext {
  if (!connectionParams?.token || typeof connectionParams.token !== 'string') {
    return { user: null };
  }

  const user = verifyToken(connectionParams.token);
  return { user };
}
