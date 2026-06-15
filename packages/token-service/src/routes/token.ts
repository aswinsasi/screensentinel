import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TokenGenerator } from '../services/TokenGenerator';

export const tokenRouter = Router();
const generator = new TokenGenerator();

const TokenRequestSchema = z.object({
  user_id: z.string().min(1).max(255),
  session_id: z.string().min(1).max(255),
  tenant_id: z.string().min(1).max(100),
  client_nonce: z.string().min(16).max(64),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  page_context: z.string().max(500).optional(),
});

tokenRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = TokenRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
    const { data } = parsed;
    const result = await generator.generate({
      userId: data.user_id, sessionId: data.session_id, tenantId: data.tenant_id,
      viewport: data.viewport, pageContext: data.page_context || '/',
      ipAddress: req.ip || 'unknown', userAgent: req.headers['user-agent'] || 'unknown',
    });
    res.json({ token: result.token, expires_at: result.expiresAt, watermark_id: result.watermarkId });
  } catch (error) {
    res.status(500).json({ error: 'Token generation failed' });
  }
});
