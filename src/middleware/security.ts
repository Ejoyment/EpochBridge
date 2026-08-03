import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import { logger } from '../utils/logger';

/**
 * Rate limiter — protects the legacy mainframe from traffic spikes.
 * Growth Tier: 10M calls/month ~= ~3.8 req/s sustained
 * We allow bursts up to 100 req per 15s window per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 1000,        // 15-second window
  max: 100,                   // max 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    errors: [{ message: 'EpochBridge: Rate limit exceeded. Slow down to protect the legacy mainframe.' }],
  },
  handler: (req: Request, res: Response) => {
    logger.warn('[Security] Rate limit exceeded from IP: ' + req.ip);
    res.status(429).json({
      errors: [{ message: 'Rate limit exceeded. Upgrade to Enterprise Tier for higher throughput.' }],
    });
  },
});

/**
 * GraphQL query depth limiter — prevents deeply nested queries from
 * generating catastrophic SQL JOINs against the fragile legacy database.
 * Limit of 7 allows: query > type > relation > type > relation > field
 */
export const depthLimiter = depthLimit(7, { ignore: ['__schema', '__type'] });

/**
 * GraphQL query complexity guard — rejects queries that would generate
 * too many database round-trips. Each field costs 1, list fields cost 10.
 */
export function complexityGuard(
  documentAST: import('graphql').DocumentNode,
  _schema: import('graphql').GraphQLSchema
): GraphQLError | null {
  // Simple field count heuristic (replace with graphql-query-complexity in production)
  const queryStr = JSON.stringify(documentAST);
  const fieldCount = (queryStr.match(/"name":/g) || []).length;
  if (fieldCount > 200) {
    logger.warn('[Security] Query complexity too high: ' + fieldCount + ' fields');
    return new GraphQLError(
      'Query too complex (' + fieldCount + ' fields). Maximum is 200. Use pagination and fragments.',
      { extensions: { code: 'QUERY_TOO_COMPLEX' } }
    );
  }
  return null;
}

/**
 * Security headers middleware — adds standard hardening headers.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Powered-By', 'EpochBridge');
  next();
}

/**
 * Request logger middleware.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.debug('[Gateway] ' + req.method + ' ' + req.path + ' — ' + req.ip);
  next();
}
