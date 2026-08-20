import { GraphQLError } from 'graphql';
import type { AuthContext } from './context';

export function requireAuth(ctx: { auth?: AuthContext }): NonNullable<AuthContext['user']> {
  const user = ctx.auth?.user;
  if (!user) {
    throw new GraphQLError('Authentication required. Please provide a valid JWT token.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return user;
}
