import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TokenPayload {
  sub: string;
  username: string;
  role: string;
}

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

export function signToken(user: { id: string; username: string; role: string }): string {
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
  };
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as TokenPayload;
    return {
      id: decoded.sub,
      username: decoded.username,
      role: decoded.role,
    };
  } catch (err) {
    logger.debug('[Auth] Token verification failed');
    return null;
  }
}
