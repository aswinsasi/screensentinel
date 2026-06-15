import { BaseLayer } from './BaseLayer';
import { SeededPRNG } from '../encoding/SeededPRNG';
import type { Viewport } from './types';

/**
 * SubPixelLayer - Layer 1: Geometric Micro-Pattern Encoding
 *
 * Renders 128 tiny elements (1-3px) at PRNG-determined positions.
 * Bit value 1 = circle (border-radius: 50%), bit value 0 = square.
 * Elements are near-invisible (1-3% opacity) with mix-blend-mode overlay.
 *
 * Extraction recovers identity by detecting shapes at expected positions.
 */
export class SubPixelLayer extends BaseLayer {
  private container: HTMLDivElement | null = null;
  private elements: HTMLElement[] = [];
  private positions: Array<{ x: number; y: number }> = [];

  render(viewport: Viewport): void {
    this.destroy();

    this.container = this.createContainer(2147483647);
    const prng = new SeededPRNG(this.seed);

    for (let i = 0; i < this.bits.length; i++) {
      const x = prng.nextFloat(20, viewport.width - 20);
      const y = prng.nextFloat(20, viewport.height - 20);
      const size = 1 + prng.nextFloat() * 2;
      const baseOpacity = 0.01 + prng.nextFloat() * 0.02;
      const opacity = baseOpacity * this.config.intensity;
      const isCircle = this.bits[i] === 1;
      const useBlack = prng.nextBool(0.5);

      this.positions.push({ x, y });

      const el = document.createElement('div');
      el.style.cssText = [
        'position:absolute',
        `left:${x}px`,
        `top:${y}px`,
        `width:${size}px`,
        `height:${size}px`,
        `opacity:${opacity}`,
        `background:${useBlack ? '#000' : '#fff'}`,
        `border-radius:${isCircle ? '50%' : '0'}`,
        'mix-blend-mode:overlay',
        'will-change:transform',
      ].join(';');

      this.container.appendChild(el);
      this.elements.push(el);
    }

    document.body.appendChild(this.container);
    this.isRendered = true;
  }

  mutate(epoch: number): void {
    if (!this.isRendered) return;

    const prng = new SeededPRNG(this.seed ^ epoch ^ 0x4d555441);

    this.elements.forEach((el, i) => {
      const dx = prng.nextFloat(-0.5, 0.5);
      const dy = prng.nextFloat(-0.5, 0.5);
      const pos = this.positions[i];
      el.style.left = `${pos.x + dx}px`;
      el.style.top = `${pos.y + dy}px`;
    });
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.elements = [];
    this.positions = [];
    this.isRendered = false;
  }

  renderDebug(): void {
    if (!this.isRendered) return;

    this.elements.forEach((el, i) => {
      el.style.opacity = '0.8';
      el.style.width = '8px';
      el.style.height = '8px';
      el.style.border = `2px solid ${this.bits[i] === 1 ? '#ff0000' : '#0066ff'}`;
      el.style.background = this.bits[i] === 1 ? 'rgba(255,0,0,0.3)' : 'rgba(0,102,255,0.3)';
      el.style.mixBlendMode = 'normal';
    });
  }
}
