import { Request, Response, NextFunction } from 'express';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ss_')) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  // Dev mode: accept any ss_ key. Production: validate against DB.
  (req as any).tenant = { id: 'dev_tenant', name: 'Development' };
  next();
}
