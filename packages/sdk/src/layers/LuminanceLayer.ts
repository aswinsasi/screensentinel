import { BaseLayer } from './BaseLayer';
import { SeededPRNG } from '../encoding/SeededPRNG';
import type { Viewport } from './types';

/**
 * LuminanceLayer - Layer 2: CSS Brightness Modulation
 *
 * Applies imperceptible brightness changes (±0.5-1.5%) to existing
 * DOM elements. Bit 1 = slightly brighter, Bit 0 = slightly dimmer.
 *
 * This layer is the most robust because it modifies existing content
 * rather than adding new elements — resistant to DOM inspection attacks.
 */
export class LuminanceLayer extends BaseLayer {
  private modifiedElements: Map<HTMLElement, string> = new Map();
  private currentRotation = 0;

  /** CSS selectors targeting content-bearing elements */
  private static readonly SELECTORS = [
    'main > div', 'main > section',
    'section', 'article',
    '[class*="card"]', '[class*="Card"]',
    '[class*="panel"]', '[class*="Panel"]',
    '[class*="widget"]', '[class*="Widget"]',
    '[class*="tile"]', '[class*="Tile"]',
    'table', 'thead', 'tbody',
    'img', 'figure', 'picture',
    '[class*="chart"]', '[class*="Chart"]',
    '[class*="graph"]', '[class*="Graph"]',
    '[role="region"]', '[role="article"]',
    '.container > div',
  ];

  render(_viewport: Viewport): void {
    this.destroy();

    const candidates = this.queryContentElements();
    const prng = new SeededPRNG(this.seed ^ 0x4c554d49); // "LUMI"

    candidates.forEach((el, i) => {
      const bitIdx = (i + this.currentRotation) % this.bits.length;
      const direction = this.bits[bitIdx] === 1 ? 1 : -1;
      const magnitude = 0.005 + prng.nextFloat() * 0.01; // 0.5% - 1.5%
      const brightness = 1 + direction * magnitude * this.config.intensity;

      // Save original filter for cleanup
      this.modifiedElements.set(el, el.style.filter || '');

      // Apply brightness modulation
      const existing = el.style.filter || '';
      el.style.filter = `${existing} brightness(${brightness.toFixed(6)})`.trim();
    });

    this.isRendered = true;
  }

  mutate(epoch: number): void {
    // Rotate bit assignment on each mutation
    this.currentRotation = epoch % this.bits.length;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    this.destroy();
    this.render(viewport);
  }

  destroy(): void {
    this.modifiedElements.forEach((originalFilter, el) => {
      try {
        el.style.filter = originalFilter;
      } catch {
        // Element may have been removed from DOM
      }
    });
    this.modifiedElements.clear();
    this.isRendered = false;
  }

  renderDebug(): void {
    this.modifiedElements.forEach((_, el) => {
      el.style.outline = '2px solid rgba(0, 255, 100, 0.6)';
      el.style.outlineOffset = '-1px';
    });
  }

  /**
   * Query the page for content elements suitable for luminance modulation.
   * Filters to visible elements larger than 50x50px.
   */
  private queryContentElements(): HTMLElement[] {
    const selectorStr = LuminanceLayer.SELECTORS.join(', ');

    let elements: HTMLElement[];
    try {
      elements = Array.from(
        document.querySelectorAll<HTMLElement>(selectorStr)
      );
    } catch {
      // Fallback if selectors fail
      elements = Array.from(
        document.querySelectorAll<HTMLElement>('div, section, article, img')
      );
    }

    return elements
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 50 &&
          rect.height > 50 &&
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        );
      })
      .slice(0, 256); // Cap to avoid performance issues
  }
}
