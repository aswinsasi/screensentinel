import { BaseLayer } from './BaseLayer';
import { SeededPRNG } from '../encoding/SeededPRNG';
import type { Viewport } from './types';

/**
 * StructuralLayoutLayer - Layer 6: Spacing & Geometry Encoding
 *
 * PURPOSE: Survive ALL physical captures including printing, photography,
 * photocopying, and even hand-retyping (partial).
 *
 * This is the most resilient layer because it encodes information in the
 * STRUCTURAL GEOMETRY of the page — not in colors, brightness, or overlays
 * that can be stripped, but in the actual spacing relationships between
 * content elements.
 *
 * Encoding techniques:
 *
 *   1. MARGIN MODULATION: Adjusts margin/padding of content elements by
 *      ±1-2px. Bit 1 = slightly wider margin. Bit 0 = slightly narrower.
 *      The extraction model measures spacing ratios between detected
 *      content blocks.
 *
 *   2. LINE-HEIGHT MODULATION: Adjusts line-height of text blocks by
 *      ±0.5-1px. Imperceptible to humans but measurable by CV.
 *
 *   3. LETTER-SPACING MODULATION: Adjusts letter-spacing on text elements
 *      by ±0.02-0.05em. Changes the overall width of text blocks which
 *      is detectable through text-block bounding box analysis.
 *
 * Why this is the ultimate survivor:
 *   - Layout is THE LAST THING that degrades in any image capture chain
 *   - Even a blurry phone photo preserves "this box is wider than that box"
 *   - Printing preserves spatial relationships perfectly
 *   - You'd have to manually re-layout the entire page to strip this
 *   - Works on pages in ANY language because it modifies spacing, not text
 *
 * Extraction: Detect content blocks (using edge detection / segmentation),
 *   measure inter-block spacing ratios, compare to expected PRNG sequence.
 */

export class StructuralLayoutLayer extends BaseLayer {
  private modifications: Array<{
    element: HTMLElement;
    property: string;
    originalValue: string;
  }> = [];

  render(_viewport: Viewport): void {
    this.destroy();

    const prng = new SeededPRNG(this.seed ^ 0x53545243); // "STRC"

    // Find modifiable content elements
    const marginTargets = this.queryMarginTargets();
    const textTargets = this.queryTextTargets();

    let bitIndex = 0;

    // ─── Technique 1: Margin Modulation ───
    marginTargets.forEach((el) => {
      if (bitIndex >= this.bits.length) bitIndex = 0;
      const bit = this.bits[bitIndex++];

      // Choose which margin to modulate (seeded)
      const side = prng.pick(['marginLeft', 'marginRight', 'paddingLeft', 'paddingRight']);
      const originalValue = el.style.getPropertyValue(this.cssProperty(side)) || '';

      // ±1-2px based on bit value
      const baseShift = 1 + prng.nextFloat() * 1; // 1-2px
      const shift = bit === 1 ? baseShift : -baseShift;
      const adjustedShift = shift * this.config.intensity;

      // Read current computed value and adjust
      const computed = parseFloat(getComputedStyle(el).getPropertyValue(this.cssProperty(side))) || 0;
      const newValue = `${(computed + adjustedShift).toFixed(2)}px`;

      this.modifications.push({ element: el, property: side, originalValue });
      (el.style as any)[side] = newValue;
    });

    // ─── Technique 2: Line-Height Modulation ───
    textTargets.forEach((el) => {
      if (bitIndex >= this.bits.length) bitIndex = 0;
      const bit = this.bits[bitIndex++];

      const originalLineHeight = el.style.lineHeight || '';
      const computedLH = parseFloat(getComputedStyle(el).lineHeight) || 0;

      if (computedLH > 0) {
        // ±0.3-0.8px line-height shift
        const baseShift = 0.3 + prng.nextFloat() * 0.5;
        const shift = (bit === 1 ? baseShift : -baseShift) * this.config.intensity;
        const newLH = `${(computedLH + shift).toFixed(2)}px`;

        this.modifications.push({
          element: el,
          property: 'lineHeight',
          originalValue: originalLineHeight,
        });
        el.style.lineHeight = newLH;
      }
    });

    // ─── Technique 3: Letter-Spacing Modulation ───
    textTargets.slice(0, 64).forEach((el) => {
      if (bitIndex >= this.bits.length) bitIndex = 0;
      const bit = this.bits[bitIndex++];

      const originalLS = el.style.letterSpacing || '';

      // ±0.02-0.04em letter-spacing
      const baseShift = 0.02 + prng.nextFloat() * 0.02;
      const shift = (bit === 1 ? baseShift : -baseShift) * this.config.intensity;

      this.modifications.push({
        element: el,
        property: 'letterSpacing',
        originalValue: originalLS,
      });
      el.style.letterSpacing = `${shift.toFixed(4)}em`;
    });

    this.isRendered = true;
  }

  mutate(epoch: number): void {
    // Structural changes are expensive — only mutate every 3rd epoch
    if (epoch % 3 !== 0) return;

    // Shift bit assignments by epoch offset
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const shiftedBits = this.rotateBits(this.bits, epoch);
    const originalBits = this.bits;
    this.bits = shiftedBits;
    this.destroy();
    this.render(viewport);
    this.bits = originalBits; // Restore for next mutation
  }

  destroy(): void {
    this.modifications.forEach(({ element, property, originalValue }) => {
      try {
        (element.style as any)[property] = originalValue;
      } catch {
        // Element may have been removed from DOM
      }
    });
    this.modifications = [];
    this.isRendered = false;
  }

  renderDebug(): void {
    this.modifications.forEach(({ element, property }) => {
      const isMargin = property.includes('margin') || property.includes('padding');
      const isLineHeight = property === 'lineHeight';
      const isLetterSpacing = property === 'letterSpacing';

      if (isMargin) {
        element.style.outline = '2px solid rgba(255, 100, 0, 0.6)';
        element.style.outlineOffset = '-1px';
      } else if (isLineHeight) {
        element.style.outline = '2px solid rgba(200, 0, 200, 0.6)';
        element.style.outlineOffset = '-1px';
      } else if (isLetterSpacing) {
        element.style.textDecoration = 'underline';
        element.style.textDecorationColor = 'rgba(0, 200, 200, 0.6)';
        element.style.textDecorationStyle = 'wavy';
      }
    });
  }

  // ─── DOM Query Helpers ───

  /**
   * Find elements suitable for margin/padding modulation.
   * Targets container elements with natural spacing.
   */
  private queryMarginTargets(): HTMLElement[] {
    const selectors = [
      '[class*="card"]', '[class*="Card"]',
      '[class*="panel"]', '[class*="Panel"]',
      '[class*="item"]', '[class*="Item"]',
      '[class*="row"]', '[class*="Row"]',
      '[class*="col"]', '[class*="Col"]',
      'article', 'section > div',
      'li', 'tr',
      '[class*="block"]', '[class*="Block"]',
      '[class*="tile"]', '[class*="Tile"]',
      '[class*="cell"]', '[class*="Cell"]',
    ];

    try {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(selectors.join(', '))
      );
      return elements
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 30 &&
            rect.height > 20 &&
            rect.top < window.innerHeight * 1.5 &&
            rect.bottom > -window.innerHeight * 0.5
          );
        })
        .slice(0, 128);
    } catch {
      return [];
    }
  }

  /**
   * Find text-containing elements for line-height and letter-spacing modulation.
   */
  private queryTextTargets(): HTMLElement[] {
    const selectors = [
      'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'td', 'th', 'li', 'dt', 'dd',
      'label', 'a',
      '[class*="text"]', '[class*="Text"]',
      '[class*="title"]', '[class*="Title"]',
      '[class*="desc"]', '[class*="Desc"]',
      '[class*="label"]', '[class*="Label"]',
      '[class*="heading"]', '[class*="Heading"]',
    ];

    try {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(selectors.join(', '))
      );
      return elements
        .filter((el) => {
          const text = el.textContent || '';
          const rect = el.getBoundingClientRect();
          return (
            text.length > 3 && // Has actual text
            rect.width > 20 &&
            rect.height > 10 &&
            rect.top >= 0 &&
            rect.top < window.innerHeight
          );
        })
        .slice(0, 128);
    } catch {
      return [];
    }
  }

  // ─── Utility ───

  private cssProperty(camelCase: string): string {
    return camelCase.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  private rotateBits(bits: Uint8Array, offset: number): Uint8Array {
    const n = bits.length;
    const shift = offset % n;
    const rotated = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      rotated[i] = bits[(i + shift) % n];
    }
    return rotated;
  }
}
