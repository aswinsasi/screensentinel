import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { SessionRecorder } from './SessionRecorder';
import { TokenEncryption } from './TokenEncryption';

interface GenerateParams {
  userId: string;
  sessionId: string;
  tenantId: string;
  viewport: { width: number; height: number };
  pageContext: string;
  ipAddress: string;
  userAgent: string;
}

export class TokenGenerator {
  private privateKey: string;
  private sessionRecorder: SessionRecorder;
  private encryption: TokenEncryption;

  constructor() {
    this.sessionRecorder = new SessionRecorder();
    this.encryption = new TokenEncryption();
    try {
      this.privateKey = fs.readFileSync(path.resolve(config.jwtPrivateKeyPath), 'utf-8');
    } catch {
      this.privateKey = config.serverSecret;
    }
  }

  async generate(params: GenerateParams) {
    const seed = this.deriveSeed(params.userId, params.sessionId);
    const watermarkId = 'wm_' + crypto.randomBytes(8).toString('hex');
    const now = Math.floor(Date.now() / 1000);

    const layers = {
      subpixel: { enabled: true, intensity: 0.7 },
      luminance: { enabled: true, intensity: 0.5 },
      svgOverlay: { enabled: true, intensity: 0.6 },
      macroLuminance: { enabled: true, intensity: 0.8 },
      structuralLayout: { enabled: true, intensity: 0.6 },
      colorChannel: { enabled: true, intensity: 0.7 },
      temporal: { enabled: true, intensity: 1.0, interval: 30000 },
    };

    // Encrypt sensitive watermark parameters
    const encrypted = this.encryption.encrypt(
      { seed: seed, layers: layers },
      config.serverSecret
    );

    const payload = {
      sub: params.userId,
      sid: params.sessionId,
      tid: params.tenantId,
      seed: seed,
      layers: layers,
      enc: encrypted,
      viewport: params.viewport,
      wid: watermarkId,
      iat: now,
      exp: now + config.tokenTtlSeconds,
    };

    const alg = this.privateKey.includes('BEGIN') ? 'RS256' : 'HS256';
    const token = jwt.sign(payload, this.privateKey, { algorithm: alg });
    const expiresAt = new Date((now + config.tokenTtlSeconds) * 1000).toISOString();

    // Record session in database
    try {
      await this.sessionRecorder.record({
        userId: params.userId,
        sessionId: params.sessionId,
        tenantId: params.tenantId,
        watermarkId: watermarkId,
        patternSeed: seed,
        layerConfig: layers,
        pageContext: params.pageContext,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        viewport: params.viewport,
      });
    } catch (err) {
      console.error('Session recording failed:', err);
    }

    return { token: token, expiresAt: expiresAt, watermarkId: watermarkId };
  }

  private deriveSeed(userId: string, sessionId: string): number {
    const hmac = crypto.createHmac('sha256', config.serverSecret);
    hmac.update(userId + ':' + sessionId);
    return hmac.digest().readUInt32BE(0);
  }
}
