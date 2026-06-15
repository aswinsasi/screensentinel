import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.headers.authorization || req.ip || 'unknown';
  const now = Date.now();
  let entry = requestCounts.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    requestCounts.set(key, entry);
  }
  entry.count++;
  if (entry.count > config.rateLimitPerMinute) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: retryAfter });
  }
  next();
}
