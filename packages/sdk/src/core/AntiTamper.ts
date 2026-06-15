import { SeededPRNG } from '../encoding/SeededPRNG';

export class AntiTamper {
  private observer: MutationObserver | null = null;
  private integrityTimer: ReturnType<typeof setInterval> | null = null;
  private trackedElements: Set<Element> = new Set();
  private onTamperDetected: (() => void) | null = null;
  private tamperCount = 0;
  private isRerendering = false;

  start(elements: Element[], onTamper: () => void): void {
    this.onTamperDetected = onTamper;
    this.trackedElements = new Set(elements);
    this.startMutationGuard();
    this.injectDecoys();
    this.startIntegrityCheck();
  }

  stop(): void {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (this.integrityTimer) { clearInterval(this.integrityTimer); this.integrityTimer = null; }
    this.trackedElements.clear();
    document.querySelectorAll('._ss_decoy').forEach((el) => el.remove());
  }

  updateElements(elements: Element[]): void {
    this.trackedElements = new Set(elements);
  }

  getStats() {
    return { tamperCount: this.tamperCount, elementsTracked: this.trackedElements.size };
  }

  private startMutationGuard(): void {
    this.observer = new MutationObserver((mutations) => {
      if (this.isRerendering) return;
      for (const mutation of mutations) {
        for (const removed of mutation.removedNodes) {
          if (removed instanceof Element && this.trackedElements.has(removed)) {
            this.handleTamper('element_removed');
            return;
          }
          if (removed instanceof Element) {
            for (const tracked of this.trackedElements) {
              if (removed.contains(tracked)) { this.handleTamper('parent_removed'); return; }
            }
          }
        }
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          if (this.trackedElements.has(mutation.target)) {
            if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
              this.handleTamper('attribute_modified');
              return;
            }
          }
        }
      }
    });
    this.observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
  }

  private startIntegrityCheck(): void {
    this.integrityTimer = setInterval(() => {
      for (const el of this.trackedElements) {
        if (!document.body.contains(el)) { this.handleTamper('integrity_failed'); return; }
        if (el instanceof HTMLElement) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') {
            this.handleTamper('element_hidden'); return;
          }
        }
      }
    }, 5000);
  }

  private injectDecoys(): void {
    const prng = new SeededPRNG(Date.now());
    for (let i = 0; i < 7; i++) {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:${prng.nextFloat(0, window.innerWidth)}px;top:${prng.nextFloat(0, window.innerHeight)}px;width:2px;height:2px;opacity:0;pointer-events:none;z-index:${2147483600 + i};`;
      d.classList.add('_ss_decoy');
      document.body.appendChild(d);
    }
  }

  private handleTamper(reason: string): void {
    this.tamperCount++;
    if (this.isRerendering) return;
    this.isRerendering = true;
    setTimeout(() => { this.onTamperDetected?.(); this.isRerendering = false; }, 100);
  }
}
