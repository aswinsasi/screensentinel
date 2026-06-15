/**
 * SeededPRNG - Deterministic pseudo-random number generator.
 *
 * Uses Mulberry32 algorithm for fast, deterministic sequences.
 * Given the same seed, produces identical output across all browsers.
 * This is critical: watermark positions must be reproducible during extraction.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0; // Force to 32-bit integer
  }

  /**
   * Generate next random number in [0, 1).
   * Mulberry32 - excellent distribution, fast, deterministic.
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max) */
  nextFloat(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat(min, max + 1));
  }

  /** Boolean with given probability of true */
  nextBool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }

  /** Shuffle array in-place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Create a child PRNG with derived seed */
  fork(salt: number): SeededPRNG {
    return new SeededPRNG(this.state ^ salt);
  }

  /** Get current state (for serialization) */
  getState(): number {
    return this.state;
  }

  /** Restore state */
  setState(state: number): void {
    this.state = state | 0;
  }
}
