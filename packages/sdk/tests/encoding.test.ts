import { describe, it, expect } from 'vitest';
import { SeededPRNG } from '../src/encoding/SeededPRNG';
import { BitEncoder } from '../src/encoding/BitEncoder';

describe('SeededPRNG', () => {
  it('produces deterministic sequences for the same seed', () => {
    const prng1 = new SeededPRNG(42);
    const prng2 = new SeededPRNG(42);

    const seq1 = Array.from({ length: 100 }, () => prng1.next());
    const seq2 = Array.from({ length: 100 }, () => prng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const prng1 = new SeededPRNG(42);
    const prng2 = new SeededPRNG(43);

    const val1 = prng1.next();
    const val2 = prng2.next();

    expect(val1).not.toEqual(val2);
  });

  it('generates values in [0, 1) range', () => {
    const prng = new SeededPRNG(12345);
    for (let i = 0; i < 10000; i++) {
      const val = prng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextFloat respects min/max bounds', () => {
    const prng = new SeededPRNG(99);
    for (let i = 0; i < 1000; i++) {
      const val = prng.nextFloat(10, 20);
      expect(val).toBeGreaterThanOrEqual(10);
      expect(val).toBeLessThan(20);
    }
  });

  it('nextInt produces integers in [min, max] inclusive', () => {
    const prng = new SeededPRNG(77);
    const results = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const val = prng.nextInt(1, 6);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
      results.add(val);
    }
    // Should hit all values 1-6
    expect(results.size).toBe(6);
  });

  it('has reasonable distribution uniformity', () => {
    const prng = new SeededPRNG(555);
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const N = 100000;

    for (let i = 0; i < N; i++) {
      const bucket = Math.floor(prng.next() * 10);
      buckets[bucket]++;
    }

    const expected = N / 10;
    for (const count of buckets) {
      // Each bucket should be within 5% of expected
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.05);
    }
  });

  it('handles edge case seeds', () => {
    expect(() => new SeededPRNG(0).next()).not.toThrow();
    expect(() => new SeededPRNG(-1).next()).not.toThrow();
    expect(() => new SeededPRNG(2147483647).next()).not.toThrow();
    expect(() => new SeededPRNG(-2147483648).next()).not.toThrow();
  });

  it('fork creates independent child PRNG', () => {
    const parent = new SeededPRNG(100);
    const child = parent.fork(200);

    const parentVal = parent.next();
    const childVal = child.next();
    expect(parentVal).not.toEqual(childVal);
  });
});

describe('BitEncoder', () => {
  it('encodes to 128-bit codeword', () => {
    const bits = BitEncoder.encode('user_123', 'sess_abc');
    expect(bits.length).toBe(128);
  });

  it('produces consistent output for same input', () => {
    const bits1 = BitEncoder.encode('user_123', 'sess_abc');
    const bits2 = BitEncoder.encode('user_123', 'sess_abc');
    expect(bits1).toEqual(bits2);
  });

  it('produces different output for different users', () => {
    const bits1 = BitEncoder.encode('user_123', 'sess_abc');
    const bits2 = BitEncoder.encode('user_456', 'sess_abc');
    expect(bits1).not.toEqual(bits2);
  });

  it('produces different output for different sessions', () => {
    const bits1 = BitEncoder.encode('user_123', 'sess_abc');
    const bits2 = BitEncoder.encode('user_123', 'sess_def');
    expect(bits1).not.toEqual(bits2);
  });

  it('round-trip: encode then decode recovers identity', () => {
    const original = BitEncoder.encode('user_test', 'sess_test');
    const decoded = BitEncoder.decode(original);

    expect(decoded.isValid).toBe(true);
    expect(decoded.correctedErrors).toBe(0);
  });

  it('corrects small number of bit errors', () => {
    const original = BitEncoder.encode('user_ecc', 'sess_ecc');
    const corrupted = new Uint8Array(original);

    // Flip 5 random bits
    const flipped = [3, 17, 42, 88, 110];
    for (const idx of flipped) {
      corrupted[idx] = corrupted[idx] === 1 ? 0 : 1;
    }

    const decoded = BitEncoder.decode(corrupted);
    expect(decoded.isValid).toBe(true);
  });

  it('detects excessive bit errors', () => {
    const original = BitEncoder.encode('user_bad', 'sess_bad');
    const corrupted = new Uint8Array(original);

    // Flip 50% of bits
    for (let i = 0; i < 64; i++) {
      corrupted[i] = corrupted[i] === 1 ? 0 : 1;
    }

    const decoded = BitEncoder.decode(corrupted);
    expect(decoded.isValid).toBe(false);
  });

  it('hammingDistance computes correctly', () => {
    const a = new Uint8Array([1, 0, 1, 0, 1, 0, 1, 0]);
    const b = new Uint8Array([1, 1, 1, 0, 0, 0, 1, 1]);

    expect(BitEncoder.hammingDistance(a, b)).toBe(3);
  });

  it('hammingDistance of identical sequences is 0', () => {
    const bits = BitEncoder.encode('user_same', 'sess_same');
    expect(BitEncoder.hammingDistance(bits, bits)).toBe(0);
  });

  it('works with various user ID formats', () => {
    const testCases = [
      ['simple', 'session'],
      ['user@email.com', 'sess_123'],
      ['usr_a1b2c3d4-e5f6', 'sess_x9y8z7'],
      ['12345', '67890'],
      ['unicode_\u0D05\u0D38\u0D4D\u0D35\u0D3F\u0D28\u0D4D', 'sess'],
    ];

    for (const [userId, sessionId] of testCases) {
      const bits = BitEncoder.encode(userId, sessionId);
      expect(bits.length).toBe(128);

      const decoded = BitEncoder.decode(bits);
      expect(decoded.isValid).toBe(true);
    }
  });
});
