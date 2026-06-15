import type { LayerConfig, Viewport } from './types';

/**
 * BaseLayer - Abstract base for all watermark encoding layers.
 *
 * Each layer encodes user identity bits using a different visual technique.
 * Layers are independently recoverable — the extraction pipeline can
 * identify the user even if only one layer survives degradation.
 */
export abstract class BaseLayer {
  protected config: LayerConfig;
  protected bits: Uint8Array;
  protected seed: number;
  protected isRendered = false;

  constructor(config: LayerConfig, bits: Uint8Array, seed: number) {
    this.config = config;
    this.bits = bits;
    this.seed = seed;
  }

  /** Render watermark into the DOM */
  abstract render(viewport: Viewport): void;

  /** Apply temporal mutation for the given epoch */
  abstract mutate(epoch: number): void;

  /** Remove all watermark elements from the DOM */
  abstract destroy(): void;

  /** Visualize watermark for debugging/testing */
  abstract renderDebug(): void;

  /** Whether this layer is currently active */
  get isActive(): boolean {
    return this.config.enabled && this.isRendered;
  }

  /** Generate a randomized DOM attribute name to resist inspection */
  protected randomAttrName(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let name = '';
    for (let i = 0; i < 8; i++) {
      name += chars[Math.floor(Math.random() * chars.length)];
    }
    return name;
  }

  /** Create an isolated container for watermark elements */
  protected createContainer(zIndex: number): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100vw',
      'height:100vh',
      'pointer-events:none',
      `z-index:${zIndex}`,
      'overflow:hidden',
      'opacity:1',
    ].join(';');
    container.setAttribute(`data-${this.randomAttrName()}`, '1');
    return container;
  }
}

export interface LayerConfig {
  enabled: boolean;
  intensity: number;
}
