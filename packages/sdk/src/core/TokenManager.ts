/**
 * TokenManager - Fetches and caches watermark tokens from the server.
 *
 * Handles:
 *  - Initial token fetch
 *  - Token caching until near expiry
 *  - Auto-refresh before expiration
 *  - Retry with exponential backoff
 *  - Fallback to last valid token on network failure
 */

interface TokenPayload {
  sub: string;
  sid: string;
  tid: string;
  seed: number;
  layers: Record<string, unknown>;
  viewport: { width: number; height: number };
  iat: number;
  exp: number;
}

interface TokenResponse {
  token: string;
  expiresAt: string;
  watermarkId: string;
}

interface TokenManagerConfig {
  apiKey: string;
  userId: string;
  sessionId: string;
  tenantId: string;
  endpoint: string;
  refreshBufferMs: number;
  maxRetries: number;
  retryBackoffMs: number;
}

export class TokenManager {
  private config: TokenManagerConfig;
  private currentToken: TokenResponse | null = null;
  private currentPayload: TokenPayload | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private onRefresh: ((payload: TokenPayload) => void) | null = null;

  constructor(config: TokenManagerConfig) {
    this.config = config;
  }

  /**
   * Fetch initial token and start auto-refresh cycle.
   */
  async initialize(): Promise<TokenPayload> {
    const payload = await this.fetchToken();
    this.scheduleRefresh();
    return payload;
  }

  /**
   * Register callback for token refreshes.
   */
  onTokenRefresh(callback: (payload: TokenPayload) => void): void {
    this.onRefresh = callback;
  }

  /**
   * Get current token payload (cached).
   */
  getPayload(): TokenPayload | null {
    return this.currentPayload;
  }

  /**
   * Stop auto-refresh cycle.
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ─── Private Methods ───

  private async fetchToken(): Promise<TokenPayload> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const nonce = this.generateNonce();
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            user_id: this.config.userId,
            session_id: this.config.sessionId,
            tenant_id: this.config.tenantId,
            client_nonce: nonce,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            page_context: window.location.pathname,
          }),
        });

        if (!response.ok) {
          throw new Error(`Token request failed: ${response.status}`);
        }

        const data: TokenResponse = await response.json();
        this.currentToken = data;
        this.currentPayload = this.decodeToken(data.token);
        return this.currentPayload;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.maxRetries - 1) {
          const delay =
            this.config.retryBackoffMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    // If we have a cached token, use it as fallback
    if (this.currentPayload) {
      console.warn(
        '[ScreenSentinel] Token refresh failed, using cached token'
      );
      return this.currentPayload;
    }

    throw lastError || new Error('Token fetch failed');
  }

  private scheduleRefresh(): void {
    if (!this.currentPayload) return;

    const expiresMs = this.currentPayload.exp * 1000;
    const refreshAt = expiresMs - this.config.refreshBufferMs;
    const delay = Math.max(refreshAt - Date.now(), 5000);

    this.refreshTimer = setTimeout(async () => {
      try {
        const payload = await this.fetchToken();
        this.onRefresh?.(payload);
      } catch (error) {
        console.warn('[ScreenSentinel] Token refresh error:', error);
      }
      this.scheduleRefresh(); // Schedule next refresh
    }, delay);
  }

  /**
   * Decode JWT payload (without verification — server already signed it).
   * Verification happens server-side; client only needs the parameters.
   */
  private decodeToken(token: string): TokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    const payload = JSON.parse(atob(parts[1]));
    return payload as TokenPayload;
  }

  private generateNonce(): string {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
