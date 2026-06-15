import { BaseLayer } from './BaseLayer';
import { SeededPRNG } from '../encoding/SeededPRNG';
import type { Viewport } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVGOverlayLayer - Layer 3: Invisible SVG Path Mesh
 *
 * Renders a full-viewport SVG overlay with a 16x8 grid of path elements.
 * Each path encodes one bit through its curvature direction:
 *   Bit 1 = convex curve (bows downward)
 *   Bit 0 = concave curve (bows upward)
 *
 * Overlay is near-zero opacity (~0.8%) with pointer-events disabled.
 */
export class SVGOverlayLayer extends BaseLayer {
  private svgElement: SVGSVGElement | null = null;
  private paths: SVGPathElement[] = [];

  static readonly GRID_COLS = 16;
  static readonly GRID_ROWS = 8;

  render(viewport: Viewport): void {
    this.destroy();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(viewport.width));
    svg.setAttribute('height', String(viewport.height));
    svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    svg.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'pointer-events:none',
      'z-index:2147483646',
      `opacity:${(0.008 * this.config.intensity).toFixed(4)}`,
      'mix-blend-mode:overlay',
    ].join(';');
    svg.setAttribute(`data-${this.randomAttrName()}`, '1');

    const prng = new SeededPRNG(this.seed ^ 0x53564731); // "SVG1"
    const cellW = viewport.width / SVGOverlayLayer.GRID_COLS;
    const cellH = viewport.height / SVGOverlayLayer.GRID_ROWS;

    for (let row = 0; row < SVGOverlayLayer.GRID_ROWS; row++) {
      for (let col = 0; col < SVGOverlayLayer.GRID_COLS; col++) {
        const bitIdx =
          (row * SVGOverlayLayer.GRID_COLS + col) % this.bits.length;
        const bit = this.bits[bitIdx];

        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;

        // Curvature direction encodes the bit
        const curveAmount = cellH * 0.3;
        const curve = bit === 1 ? curveAmount : -curveAmount;

        // Add PRNG jitter to resist pattern detection
        const jx = prng.nextFloat(-5, 5);
        const jy = prng.nextFloat(-3, 3);

        const x1 = cx - cellW * 0.35 + jx;
        const x2 = cx + cellW * 0.35 + jx;
        const qx = cx + prng.nextFloat(-2, 2);
        const qy = cy + curve + jy;

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M ${x1} ${cy} Q ${qx} ${qy} ${x2} ${cy}`);
        path.setAttribute('fill', 'none');
        path.setAttribute(
          'stroke',
          prng.nextBool(0.5) ? '#000000' : '#ffffff'
        );
        path.setAttribute(
          'stroke-width',
          (0.3 + prng.nextFloat() * 0.4).toFixed(2)
        );
        path.setAttribute('stroke-linecap', 'round');

        svg.appendChild(path);
        this.paths.push(path);
      }
    }

    document.body.appendChild(svg);
    this.svgElement = svg;
    this.isRendered = true;
  }

  mutate(epoch: number): void {
    if (!this.svgElement || !this.isRendered) return;

    const prng = new SeededPRNG(this.seed ^ epoch ^ 0x4d555456);

    this.paths.forEach((path) => {
      const d = path.getAttribute('d') || '';
      // Apply micro-perturbation to control point
      const delta = prng.nextFloat(-1.5, 1.5);
      // Simple perturbation: shift Q control point slightly
      const modified = d.replace(
        /Q ([\d.]+) ([\d.]+)/,
        (_, qx, qy) => `Q ${(parseFloat(qx) + delta).toFixed(1)} ${qy}`
      );
      path.setAttribute('d', modified);
    });
  }

  destroy(): void {
    if (this.svgElement) {
      this.svgElement.remove();
      this.svgElement = null;
    }
    this.paths = [];
    this.isRendered = false;
  }

  renderDebug(): void {
    if (!this.svgElement) return;

    this.svgElement.style.opacity = '0.6';
    this.paths.forEach((path, i) => {
      const bitIdx =
        i % this.bits.length;
      path.setAttribute(
        'stroke',
        this.bits[bitIdx] === 1 ? '#ff0000' : '#0066ff'
      );
      path.setAttribute('stroke-width', '2');
    });
  }
}
