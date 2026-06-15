import { BaseLayer } from './BaseLayer';
import { SeededPRNG } from '../encoding/SeededPRNG';
import type { Viewport } from './types';

/**
 * MacroLuminanceLayer - Layer 5: Large-Zone Brightness Encoding
 *
 * PURPOSE: Survive printing, photography, and photocopying.
 *
 * Unlike Layer 2 (per-element brightness at ±0.5-1.5%), this layer
 * operates on LARGE screen zones — dividing the viewport into a 4×4 grid
 * of 16 macro-zones and applying ±2-4% brightness shifts to each zone.
 *
 * Why this survives physical capture:
 *   - A phone camera easily resolves "this quadrant is brighter than that one"
 *   - Printers faithfully reproduce large-area tonal differences
 *   - Even photocopiers preserve zone-level brightness differences
 *   - The signal is in the macro-scale spatial distribution, not in tiny details
 *
 * Encoding: Each zone gets a semi-transparent overlay div.
 *   Bit 1 = slight white overlay (zone appears ~2-4% brighter)
 *   Bit 0 = slight black overlay (zone appears ~2-4% dimmer)
 *
 * Extraction: Divide the captured image into the same 4×4 grid.
 *   Compare each zone's mean luminance to the global mean.
 *   Brighter than mean = bit 1, dimmer = bit 0.
 *   Works even at very low image resolution (160×90 pixels is enough).
 */

export class MacroLuminanceLayer extends BaseLayer {
  private container: HTMLDivElement | null = null;
  private zoneElements: HTMLDivElement[] = [];

  static readonly GRID_COLS = 4;
  static readonly GRID_ROWS = 4;
  static readonly ZONE_COUNT = 16; // 4×4 = 16 bits per cycle

  render(viewport: Viewport): void {
    this.destroy();

    this.container = this.createContainer(2147483640);
    const prng = new SeededPRNG(this.seed ^ 0x4d41434c); // "MACL"

    const zoneW = viewport.width / MacroLuminanceLayer.GRID_COLS;
    const zoneH = viewport.height / MacroLuminanceLayer.GRID_ROWS;

    for (let row = 0; row < MacroLuminanceLayer.GRID_ROWS; row++) {
      for (let col = 0; col < MacroLuminanceLayer.GRID_COLS; col++) {
        const bitIdx = (row * MacroLuminanceLayer.GRID_COLS + col) % this.bits.length;
        const bit = this.bits[bitIdx];

        // Stronger intensity than Layer 2 (2-4% vs 0.5-1.5%)
        const baseOpacity = 0.02 + prng.nextFloat() * 0.02; // 2-4%
        const opacity = baseOpacity * this.config.intensity;

        // Bit 1 = white overlay (brighter), Bit 0 = black overlay (dimmer)
        const color = bit === 1 ? '255,255,255' : '0,0,0';

        const zone = document.createElement('div');
        zone.style.cssText = [
          'position:absolute',
          `left:${col * zoneW}px`,
          `top:${row * zoneH}px`,
          `width:${zoneW}px`,
          `height:${zoneH}px`,
          `background:rgba(${color},${opacity.toFixed(4)})`,
          'pointer-events:none',
          'mix-blend-mode:normal',
        ].join(';');

        this.container.appendChild(zone);
        this.zoneElements.push(zone);
      }
    }

    document.body.appendChild(this.container);
    this.isRendered = true;
  }

  mutate(epoch: number): void {
    if (!this.isRendered || !this.container) return;

    const prng = new SeededPRNG(this.seed ^ epoch ^ 0x4d4d5554);

    // Micro-adjust opacity per zone (±0.5% random walk)
    this.zoneElements.forEach((zone) => {
      const currentBg = zone.style.background;
      const match = currentBg.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map((s) => s.trim());
        if (parts.length >= 4) {
          const currentOpacity = parseFloat(parts[3]);
          const delta = prng.nextFloat(-0.005, 0.005);
          const newOpacity = Math.max(0.005, Math.min(0.06, currentOpacity + delta));
          zone.style.background = `rgba(${parts[0]},${parts[1]},${parts[2]},${newOpacity.toFixed(4)})`;
        }
      }
    });
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.zoneElements = [];
    this.isRendered = false;
  }

  renderDebug(): void {
    if (!this.container) return;

    this.zoneElements.forEach((zone, i) => {
      const bitIdx = i % this.bits.length;
      const isOne = this.bits[bitIdx] === 1;
      zone.style.background = isOne
        ? 'rgba(255, 200, 0, 0.25)'
        : 'rgba(0, 100, 255, 0.25)';
      zone.style.border = `2px dashed ${isOne ? '#ffcc00' : '#0066ff'}`;
      zone.style.display = 'flex';
      zone.style.alignItems = 'center';
      zone.style.justifyContent = 'center';
      zone.style.fontSize = '14px';
      zone.style.color = isOne ? '#ffcc00' : '#0066ff';
      zone.style.fontFamily = 'monospace';
      zone.style.fontWeight = 'bold';
      zone.textContent = `Z${i}: ${isOne ? '1 (bright)' : '0 (dim)'}`;
    });
  }
}
