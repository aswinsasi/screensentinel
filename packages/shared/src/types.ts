// ─── Core Types ───

export interface ScreenSentinelConfig {
  apiKey: string;
  userId: string;
  sessionId?: string;
  tenantId: string;
  tokenEndpoint?: string;
  layers?: LayerSettings;
  debug?: boolean;
  onError?: (error: ScreenSentinelError) => void;
  onReady?: () => void;
}

export interface LayerSettings {
  subpixel?: LayerConfig;
  luminance?: LayerConfig;
  svgOverlay?: LayerConfig;
  temporal?: TemporalConfig;
}

export interface LayerConfig {
  enabled: boolean;
  intensity: number; // 0.0 - 1.0
}

export interface TemporalConfig extends LayerConfig {
  interval: number; // mutation interval in ms
}

export interface Viewport {
  width: number;
  height: number;
}

// ─── Token Types ───

export interface TokenRequest {
  userId: string;
  sessionId: string;
  tenantId: string;
  clientNonce: string;
  viewport: Viewport;
  pageContext: string;
}

export interface TokenResponse {
  token: string;
  expiresAt: string;
  watermarkId: string;
}

export interface WatermarkTokenPayload {
  sub: string;       // userId
  sid: string;       // sessionId
  tid: string;       // tenantId
  seed: number;      // pattern seed
  layers: LayerSettings;
  viewport: Viewport;
  iat: number;
  exp: number;
}

// ─── Extraction Types ───

export interface ExtractionResult {
  extractionId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attribution?: Attribution;
  perLayerConfidence?: PerLayerConfidence;
  degradationAnalysis?: DegradationAnalysis;
  forensicReportUrl?: string;
}

export interface Attribution {
  userId: string;
  sessionId: string;
  tenantId: string;
  confidence: number;
  captureTimeEstimate?: string;
  pageContext?: string;
}

export interface PerLayerConfidence {
  subpixel: number;
  luminance: number;
  svgMesh: number;
  temporal: number;
}

export interface DegradationAnalysis {
  compressionLevel: 'none' | 'light' | 'moderate' | 'heavy';
  perspectiveDistortion: boolean;
  cropDetected: boolean;
  estimatedSource: 'screenshot_tool' | 'phone_camera' | 'screen_recording' | 'unknown';
  moireDetected: boolean;
  estimatedJpegQuality: number;
}

// ─── Error Types ───

export class ScreenSentinelError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ScreenSentinelError';
  }
}

export enum ErrorCode {
  TOKEN_FETCH_FAILED = 'TOKEN_FETCH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  RENDER_FAILED = 'RENDER_FAILED',
  API_KEY_INVALID = 'API_KEY_INVALID',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INIT_FAILED = 'INIT_FAILED',
}

// ─── Constants ───

export const DEFAULTS = {
  TOKEN_ENDPOINT: 'https://api.screensentinel.io/v1/token',
  LAYERS: {
    subpixel: { enabled: true, intensity: 0.7 },
    luminance: { enabled: true, intensity: 0.5 },
    svgOverlay: { enabled: true, intensity: 0.6 },
    temporal: { enabled: true, intensity: 1.0, interval: 30_000 },
  } satisfies Required<LayerSettings>,
  IDENTITY_BITS: 64,
  CODEWORD_BITS: 128,
  TOKEN_REFRESH_BUFFER_MS: 60_000, // Refresh 1 min before expiry
  MAX_TOKEN_RETRIES: 3,
  RETRY_BACKOFF_MS: 1000,
} as const;
