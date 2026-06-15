import { Pool } from 'pg';
import crypto from 'crypto';
import { config } from '../config';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Test connection on startup
pool.query('SELECT NOW()')
  .then(() => console.log('Database connected'))
  .catch((err: Error) => console.error('Database connection failed:', err.message));

export interface SessionRecord {
  userId: string;
  sessionId: string;
  tenantId: string;
  watermarkId: string;
  patternSeed: number;
  layerConfig: object;
  pageContext: string;
  ipAddress: string;
  userAgent: string;
  viewport: { width: number; height: number };
}

export class SessionRecorder {
  /**
   * Save a watermark session to the database.
   * Called every time a token is generated.
   */
  async record(session: SessionRecord): Promise<void> {
    // First, get the tenant UUID from the slug
    const tenantResult = await pool.query(
      'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
      [session.tenantId]
    );

    const tenantUuid = tenantResult.rows[0]?.id || null;

    const query = `
      INSERT INTO watermark_sessions 
        (tenant_id, user_id, session_id, watermark_id, pattern_seed, 
         layer_config, page_context, ip_address_hash, user_agent, viewport)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await pool.query(query, [
      tenantUuid,
      session.userId,
      session.sessionId,
      session.watermarkId,
      session.patternSeed,
      JSON.stringify(session.layerConfig),
      session.pageContext,
      this.hashIp(session.ipAddress),
      session.userAgent,
      JSON.stringify(session.viewport),
    ]);
  }

  /**
   * Find a session by user_id and session_id.
   */
  async findByIdentity(userId: string, sessionId: string): Promise<SessionRecord | null> {
    const result = await pool.query(
      `SELECT * FROM watermark_sessions 
       WHERE user_id = $1 AND session_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, sessionId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all sessions from the last N hours (for brute-force matching).
   */
  async getAllRecent(hours: number = 72): Promise<any[]> {
    const result = await pool.query(
      `SELECT user_id, session_id, watermark_id, pattern_seed, 
              page_context, viewport, created_at
       FROM watermark_sessions
       WHERE created_at > NOW() - INTERVAL '1 hour' * $1
       ORDER BY created_at DESC
       LIMIT 1000`,
      [hours]
    );
    return result.rows;
  }

  /**
   * Find session by watermark_id.
   */
  async findByWatermarkId(watermarkId: string): Promise<any | null> {
    const result = await pool.query(
      'SELECT * FROM watermark_sessions WHERE watermark_id = $1',
      [watermarkId]
    );
    return result.rows[0] || null;
  }

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 16);
  }
}
