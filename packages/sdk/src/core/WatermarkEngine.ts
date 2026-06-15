import { SubPixelLayer } from '../layers/SubPixelLayer';
import { LuminanceLayer } from '../layers/LuminanceLayer';
import { SVGOverlayLayer } from '../layers/SVGOverlayLayer';
import { MacroLuminanceLayer } from '../layers/MacroLuminanceLayer';
import { StructuralLayoutLayer } from '../layers/StructuralLayoutLayer';
import { ColorChannelLayer } from '../layers/ColorChannelLayer';
import { AntiTamper } from './AntiTamper';
import { SecurityHardening } from './SecurityHardening';
import type { BaseLayer } from '../layers/BaseLayer';
import type { Viewport } from '../layers/types';

interface EngineConfig {
  layers: {
    subpixel: { enabled: boolean; intensity: number };
    luminance: { enabled: boolean; intensity: number };
    svgOverlay: { enabled: boolean; intensity: number };
    macroLuminance: { enabled: boolean; intensity: number };
    structuralLayout: { enabled: boolean; intensity: number };
    colorChannel: { enabled: boolean; intensity: number };
    temporal: { enabled: boolean; intensity: number; interval: number };
  };
}

export class WatermarkEngine {
  private layers: BaseLayer[] = [];
  private config: EngineConfig;
  private bits: Uint8Array;
  private seed: number;
  private mutationTimer: ReturnType<typeof setInterval> | null = null;
  private epoch = 0;
  private resizeHandler: (() => void) | null = null;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private debugMode = false;
  private antiTamper: AntiTamper;
  private security: SecurityHardening;

  constructor(config: EngineConfig, bits: Uint8Array, seed: number) {
    this.config = config;
    this.bits = bits;
    this.seed = seed;
    this.antiTamper = new AntiTamper();
    this.security = new SecurityHardening();
  }

  start(): void {
    const viewport = this.getViewport();

    if (this.config.layers.subpixel.enabled) {
      const layer = new SubPixelLayer(
        this.config.layers.subpixel, this.bits, this.seed ^ 0x5350584c
      );
      layer.render(viewport);
      this.layers.push(layer);
    }

    if (this.config.layers.luminance.enabled) {
      const layer = new LuminanceLayer(
        this.config.layers.luminance, this.bits, this.seed ^ 0x4c554d4e
      );
      layer.render(viewport);
      this.layers.push(layer);
    }

    if (this.config.layers.svgOverlay.enabled) {
      const layer = new SVGOverlayLayer(
        this.config.layers.svgOverlay, this.bits, this.seed ^ 0x5356474d
      );
      layer.render(viewport);
      this.layers.push(layer);
    }

    if (this.config.layers.macroLuminance.enabled) {
      const layer = new MacroLuminanceLayer(
        this.config.layers.macroLuminance, this.bits, this.seed ^ 0x4d41434c
      );
      layer.render(viewport);
      this.layers.push(layer);
    }

    if (this.config.layers.structuralLayout.enabled) {
      const layer = new StructuralLayoutLayer(
        this.config.layers.structuralLayout, this.bits, this.seed ^ 0x53545243
      );
      layer.render(viewport);
      this.layers.push(layer);
    }

    if (this.config.layers.colorChannel.enabled) {
      const layer = new ColorChannelLayer(
        this.config.layers.colorChannel, this.bits, this.seed ^ 0x52474221
      );
      layer.render(viewport);
      this.layers.push(layer);
    }

    // Temporal mutation cycle
    if (this.config.layers.temporal.enabled) {
      const interval = this.config.layers.temporal.interval || 30000;
      this.mutationTimer = setInterval(() => {
        this.epoch++;
        this.layers.forEach((l) => l.mutate(this.epoch));
      }, interval);
    }

    // Viewport resize handler (debounced)
    this.resizeHandler = () => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.rerender(), 250);
    };
    window.addEventListener('resize', this.resizeHandler);

    // Activate anti-tampering protection
    const trackedElements: Element[] = [];
    this.layers.forEach((layer: any) => {
      if (layer.container) trackedElements.push(layer.container);
      if (layer.svgElement) trackedElements.push(layer.svgElement);
    });

    this.antiTamper.start(trackedElements, () => {
      console.warn('[ScreenSentinel] Tamper detected — re-rendering');
      this.rerender();
    });

    // Activate CSS security hardening
    this.security.activate();
  }

  stop(): void {
    if (this.mutationTimer) {
      clearInterval(this.mutationTimer);
      this.mutationTimer = null;
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    this.antiTamper.stop();
    this.security.deactivate();
    this.layers.forEach((l) => l.destroy());
    this.layers = [];
    this.epoch = 0;
  }

  setDebug(enabled: boolean): void {
    this.debugMode = enabled;
    if (enabled) {
      this.layers.forEach((l) => l.renderDebug());
    } else {
      this.rerender();
    }
  }

  getEpoch(): number {
    return this.epoch;
  }

  getActiveLayerCount(): number {
    return this.layers.filter((l) => l.isActive).length;
  }

  updateBits(bits: Uint8Array, seed: number): void {
    this.bits = bits;
    this.seed = seed;
    this.rerender();
  }

  private rerender(): void {
    const viewport = this.getViewport();
    this.layers.forEach((l) => {
      l.destroy();
      l.render(viewport);
    });

    // Update anti-tamper tracked elements
    const trackedElements: Element[] = [];
    this.layers.forEach((layer: any) => {
      if (layer.container) trackedElements.push(layer.container);
      if (layer.svgElement) trackedElements.push(layer.svgElement);
    });
    this.antiTamper.updateElements(trackedElements);

    if (this.debugMode) {
      this.layers.forEach((l) => l.renderDebug());
    }
  }

  private getViewport(): Viewport {
    return { width: window.innerWidth, height: window.innerHeight };
  }
}
