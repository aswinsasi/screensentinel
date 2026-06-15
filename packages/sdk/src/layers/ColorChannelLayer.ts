import { BaseLayer } from './BaseLayer';
import { SeededPRNG } from '../encoding/SeededPRNG';
import type { Viewport } from './types';

/**
 * ColorChannelLayer - Layer 7: Independent RGB Channel Encoding
 *
 * PURPOSE: Redundancy through color channel independence.
 * Even if one color channel is destroyed (grayscale conversion kills
 * chrominance, bad white balance shifts hue), the other channels
 * carry the same identity information independently.
 *
 * How it works:
 *   - Divides the 128-bit codeword into 3 sub-sequences:
 *     R-channel: bits 0-42  (43 bits)
 *     G-channel: bits 43-85 (43 bits)
 *     B-channel: bits 86-127 (42 bits)
 *
 *   - For each channel, creates a full-viewport SVG overlay with
 *     ONLY that color channel active, encoding bits via opacity patterns.
 *
 *   - R overlay: rgba(255,0,0, ±0.008) patterns
 *   - G overlay: rgba(0,255,0, ±0.006) patterns (lower because eye is most sensitive to green)
 *   - B overlay: rgba(0,0,255, ±0.010) patterns (higher because eye is least sensitive to blue)
 *
 * Extraction:
 *   - Split leaked image into R, G, B channels
 *   - Run extraction on each channel independently
 *   - Each channel recovers its 43-bit sub-sequence
 *   - Concatenate and feed to BitEncoder.decode()
 *   - Even if one channel is destroyed, the other two provide 86 bits
 *     which is enough for identity recovery with ECC
 *
 * Print resilience:
 *   - Color printers reproduce RGB values (mapped to CMYK)
 *   - The per-channel differences survive the conversion
 *   - Especially effective with laser printers
 */

interface ChannelConfig {
  color: string;         // CSS color
  bitStart: number;      // Start index in codeword
  bitCount: number;      // Number of bits for this channel
  baseOpacity: number;   // Base overlay opacity
  gridCols: number;
  gridRows: number;
}

const CHANNELS: ChannelConfig[] = [
  { color: '255,0,0',   bitStart: 0,  bitCount: 43, baseOpacity: 0.008, gridCols: 7, gridRows: 7 },
  { color: '0,255,0',   bitStart: 43, bitCount: 43, baseOpacity: 0.006, gridCols: 7, gridRows: 7 },
  { color: '0,0,255',   bitStart: 86, bitCount: 42, baseOpacity: 0.010, gridCols: 7, gridRows: 6 },
];

export class ColorChannelLayer extends BaseLayer {
  private container: HTMLDivElement | null = null;
  private cellElements: HTMLDivElement[] = [];

  render(viewport: Viewport): void {
    this.destroy();

    this.container = this.createContainer(2147483638);
    const prng = new SeededPRNG(this.seed ^ 0x52474221); // "RGB!"

    for (const channel of CHANNELS) {
      this.renderChannel(channel, viewport, prng);
    }

    document.body.appendChild(this.container);
    this.isRendered = true;
  }

  private renderChannel(
    channel: ChannelConfig,
    viewport: Viewport,
    prng: SeededPRNG
  ): void {
    if (!this.container) return;

    const cellW = viewport.width / channel.gridCols;
    const cellH = viewport.height / channel.gridRows;

    for (let row = 0; row < channel.gridRows; row++) {
      for (let col = 0; col < channel.gridCols; col++) {
        const cellIdx = row * channel.gridCols + col;
        if (cellIdx >= channel.bitCount) break;

        const bitIdx = (channel.bitStart + cellIdx) % this.bits.length;
        const bit = this.bits[bitIdx];

        // Bit determines if we add a tinted overlay or not
        const opacity = bit === 1
          ? channel.baseOpacity * this.config.intensity
          : 0;

        // Add jitter to prevent uniform grid detection
        const jx = prng.nextFloat(-3, 3);
        const jy = prng.nextFloat(-3, 3);

        const cell = document.createElement('div');
        cell.style.cssText = [
          'position:absolute',
          `left:${col * cellW + jx}px`,
          `top:${row * cellH + jy}px`,
          `width:${cellW}px`,
          `height:${cellH}px`,
          `background:rgba(${channel.color},${opacity.toFixed(5)})`,
          'pointer-events:none',
        ].join(';');

        this.container.appendChild(cell);
        this.cellElements.push(cell);
      }
    }
  }

  mutate(epoch: number): void {
    if (!this.isRendered) return;

    const prng = new SeededPRNG(this.seed ^ epoch ^ 0x434d5554);

    // Micro-adjust opacity of each cell
    this.cellElements.forEach((cell) => {
      const bg = cell.style.background;
      const match = bg.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map((s) => parseFloat(s.trim()));
        if (parts.length >= 4 && parts[3] > 0) {
          const delta = prng.nextFloat(-0.002, 0.002);
          const newOpacity = Math.max(0.001, Math.min(0.02, parts[3] + delta));
          cell.style.background = `rgba(${parts[0]},${parts[1]},${parts[2]},${newOpacity.toFixed(5)})`;
        }
      }
    });
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.cellElements = [];
    this.isRendered = false;
  }

  renderDebug(): void {
    if (!this.container) return;

    this.cellElements.forEach((cell) => {
      const bg = cell.style.background;
      const match = bg.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map((s) => parseFloat(s.trim()));
        const hasSignal = parts.length >= 4 && parts[3] > 0.001;

        if (parts[0] > 200) {
          // Red channel
          cell.style.background = hasSignal ? 'rgba(255,0,0,0.3)' : 'rgba(255,0,0,0.05)';
          cell.style.border = '1px solid rgba(255,0,0,0.5)';
        } else if (parts[1] > 200) {
          // Green channel
          cell.style.background = hasSignal ? 'rgba(0,255,0,0.3)' : 'rgba(0,255,0,0.05)';
          cell.style.border = '1px solid rgba(0,255,0,0.5)';
        } else {
          // Blue channel
          cell.style.background = hasSignal ? 'rgba(0,100,255,0.3)' : 'rgba(0,100,255,0.05)';
          cell.style.border = '1px solid rgba(0,100,255,0.5)';
        }
      }
    });
  }
}
