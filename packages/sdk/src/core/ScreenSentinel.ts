import { TokenManager } from './TokenManager';
import { WatermarkEngine } from './WatermarkEngine';
import { BitEncoder } from '../encoding/BitEncoder';

/**
 * ScreenSentinel - Invisible Forensic Attribution SDK
 *
 * Usage:
 *   // Script tag:
 *   ScreenSentinel.init({ apiKey: 'ss_live_xxx', userId: 'usr_123', tenantId: 'acme' });
 *
 *   // ES module:
 *   import { ScreenSentinel } from '@screensentinel/sdk';
 *   const sentinel = ScreenSentinel.init({ ... });
 *   sentinel.destroy(); // cleanup
 */

export interface InitConfig {
  /** ScreenSentinel API key */
  apiKey: string;

  /** Authenticated user identifier */
  userId: string;

  /** Session identifier (auto-generated if omitted) */
  sessionId?: string;

  /** Organization/tenant identifier */
  tenantId: string;

  /** Token endpoint URL (default: https://api.screensentinel.io/v1/token) */
  tokenEndpoint?: string;

  /** Layer configuration overrides */
  layers?: Partial<{
    subpixel: { enabled?: boolean; intensity?: number };
    luminance: { enabled?: boolean; intensity?: number };
    svgOverlay: { enabled?: boolean; intensity?: number };
    macroLuminance: { enabled?: boolean; intensity?: number };
    structuralLayout: { enabled?: boolean; intensity?: number };
    colorChannel: { enabled?: boolean; intensity?: number };
    temporal: { enabled?: boolean; intensity?: number; interval?: number };
  }>;

  /** Enable debug visualization (dev only!) */
  debug?: boolean;

  /** Error callback */
  onError?: (error: Error) => void;

  /** Ready callback (watermark rendered) */
  onReady?: () => void;
}

export class ScreenSentinel {
  private static instance: ScreenSentinel | null = null;

  private tokenManager: TokenManager;
  private engine: WatermarkEngine | null = null;
  private config: Required<InitConfig>;
  private _isReady = false;

  private constructor(config: InitConfig) {
    this.config = {
      apiKey: config.apiKey,
      userId: config.userId,
      sessionId: config.sessionId || this.generateSessionId(),
      tenantId: config.tenantId,
      tokenEndpoint:
        config.tokenEndpoint || 'https://api.screensentinel.io/v1/token',
      layers: {
        subpixel: { enabled: true, intensity: 0.7, ...config.layers?.subpixel },
        luminance: { enabled: true, intensity: 0.5, ...config.layers?.luminance },
        svgOverlay: { enabled: true, intensity: 0.6, ...config.layers?.svgOverlay },
        macroLuminance: { enabled: true, intensity: 0.8, ...config.layers?.macroLuminance },
        structuralLayout: { enabled: true, intensity: 0.6, ...config.layers?.structuralLayout },
        colorChannel: { enabled: true, intensity: 0.7, ...config.layers?.colorChannel },
        temporal: {
          enabled: true,
          intensity: 1.0,
          interval: 30_000,
          ...config.layers?.temporal,
        },
      },
      debug: config.debug || false,
      onError: config.onError || console.error,
      onReady: config.onReady || (() => {}),
    };

    this.tokenManager = new TokenManager({
      apiKey: this.config.apiKey,
      userId: this.config.userId,
      sessionId: this.config.sessionId,
      tenantId: this.config.tenantId,
      endpoint: this.config.tokenEndpoint,
      refreshBufferMs: 60_000,
      maxRetries: 3,
      retryBackoffMs: 1000,
    });
  }

  // ─── Public Static API ───

  /**
   * Initialize ScreenSentinel and start watermark rendering.
   * Only one instance can be active at a time.
   */
  static init(config: InitConfig): ScreenSentinel {
    // Destroy existing instance if any
    if (ScreenSentinel.instance) {
      ScreenSentinel.instance.destroy();
    }

    const instance = new ScreenSentinel(config);
    ScreenSentinel.instance = instance;

    // Start async initialization
    instance.bootstrap().catch((error) => {
      instance.config.onError(error);
    });

    return instance;
  }

  /**
   * Get current instance (if initialized).
   */
  static getInstance(): ScreenSentinel | null {
    return ScreenSentinel.instance;
  }

  // ─── Public Instance API ───

  /** Whether the watermark is actively rendering */
  get isReady(): boolean {
    return this._isReady;
  }

  /** Current user ID */
  get userId(): string {
    return this.config.userId;
  }

  /** Current session ID */
  get sessionId(): string {
    return this.config.sessionId;
  }

  /**
   * Toggle debug mode (shows watermark overlay).
   * WARNING: Only use in development!
   */
  setDebug(enabled: boolean): void {
    this.config.debug = enabled;
    this.engine?.setDebug(enabled);
  }

  /**
   * Stop watermark rendering and cleanup all resources.
   */
  destroy(): void {
    this.engine?.stop();
    this.tokenManager.destroy();
    this.engine = null;
    this._isReady = false;

    if (ScreenSentinel.instance === this) {
      ScreenSentinel.instance = null;
    }
  }

  /**
   * Get diagnostic info (for support/debugging).
   */
  getDiagnostics(): Record<string, unknown> {
    return {
      isReady: this._isReady,
      userId: this.config.userId,
      sessionId: this.config.sessionId,
      tenantId: this.config.tenantId,
      activeLayers: this.engine?.getActiveLayerCount() ?? 0,
      mutationEpoch: this.engine?.getEpoch() ?? 0,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      userAgent: navigator.userAgent,
    };
  }

  // ─── Private Methods ───

  private async bootstrap(): Promise<void> {
    try {
      // Step 1: Fetch watermark token from server
      const payload = await this.tokenManager.initialize();

      // Step 2: Encode user identity to bits
      const bits = BitEncoder.encode(
        this.config.userId,
        this.config.sessionId
      );

      // Step 3: Build layer config
      const layerConfig = {
        subpixel: {
          enabled: this.config.layers.subpixel?.enabled ?? true,
          intensity: this.config.layers.subpixel?.intensity ?? 0.7,
        },
        luminance: {
          enabled: this.config.layers.luminance?.enabled ?? true,
          intensity: this.config.layers.luminance?.intensity ?? 0.5,
        },
        svgOverlay: {
          enabled: this.config.layers.svgOverlay?.enabled ?? true,
          intensity: this.config.layers.svgOverlay?.intensity ?? 0.6,
        },
        macroLuminance: {
          enabled: this.config.layers.macroLuminance?.enabled ?? true,
          intensity: this.config.layers.macroLuminance?.intensity ?? 0.8,
        },
        structuralLayout: {
          enabled: this.config.layers.structuralLayout?.enabled ?? true,
          intensity: this.config.layers.structuralLayout?.intensity ?? 0.6,
        },
        colorChannel: {
          enabled: this.config.layers.colorChannel?.enabled ?? true,
          intensity: this.config.layers.colorChannel?.intensity ?? 0.7,
        },
        temporal: {
          enabled: this.config.layers.temporal?.enabled ?? true,
          intensity: this.config.layers.temporal?.intensity ?? 1.0,
          interval: this.config.layers.temporal?.interval ?? 30_000,
        },
      };

      // Step 4: Create and start watermark engine
      this.engine = new WatermarkEngine(
        { layers: layerConfig },
        bits,
        payload.seed
      );
      this.engine.start();

      // Step 5: Enable debug if requested
      if (this.config.debug) {
        this.engine.setDebug(true);
      }

      // Step 6: Setup token refresh handler
      this.tokenManager.onTokenRefresh((newPayload) => {
        const newBits = BitEncoder.encode(
          this.config.userId,
          this.config.sessionId
        );
        this.engine?.updateBits(newBits, newPayload.seed);
      });

      this._isReady = true;
      this.config.onReady();
    } catch (error) {
      this.config.onError(error as Error);
      throw error;
    }
  }

  private generateSessionId(): string {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return (
      'sess_' +
      Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
    );
  }
}
