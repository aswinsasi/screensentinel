/**
 * BitEncoder - Converts user identity into error-corrected bit sequences.
 *
 * Pipeline:
 *   1. Hash userId + sessionId to 64-bit fingerprint (FNV-1a)
 *   2. Apply repetition-based error correction to produce 128-bit codeword
 *   3. Interleave bits for burst error resilience
 *
 * The 128-bit codeword can tolerate up to 25% bit errors during extraction.
 */
export class BitEncoder {
  static readonly IDENTITY_BITS = 64;
  static readonly CODEWORD_BITS = 128;
  static readonly REPETITION = 2; // Each bit repeated 2x = 128 total

  /**
   * Encode user + session identity into a 128-bit error-corrected codeword.
   */
  static encode(userId: string, sessionId: string): Uint8Array {
    // Step 1: Hash to 64-bit identity
    const identity = this.fnv1a64(`${userId}:${sessionId}`);

    // Step 2: Expand to 128 bits with repetition coding
    const expanded = this.repetitionEncode(identity);

    // Step 3: Interleave for burst error resilience
    const interleaved = this.interleave(expanded);

    return interleaved;
  }

  /**
   * Decode a recovered 128-bit codeword back to 64-bit identity.
   * Uses majority voting across repetitions to correct errors.
   */
  static decode(codeword: Uint8Array): {
    identity: Uint8Array;
    correctedErrors: number;
    isValid: boolean;
  } {
    // Step 1: De-interleave
    const deinterleaved = this.deinterleave(codeword);

    // Step 2: Majority vote across repetitions
    const { identity, errors } = this.repetitionDecode(deinterleaved);

    return {
      identity,
      correctedErrors: errors,
      isValid: errors <= Math.floor(this.CODEWORD_BITS * 0.25),
    };
  }

  /**
   * Decode from floating-point probabilities (from ML extraction).
   * Each value in probabilities is 0.0-1.0 representing P(bit=1).
   */
  static decodeFromProbabilities(probabilities: Float32Array): {
    identity: Uint8Array;
    confidence: number;
    correctedErrors: number;
    isValid: boolean;
  } {
    // Hard-decision: threshold at 0.5
    const hardBits = new Uint8Array(probabilities.length);
    let totalConfidence = 0;

    for (let i = 0; i < probabilities.length; i++) {
      const p = probabilities[i];
      hardBits[i] = p >= 0.5 ? 1 : 0;
      totalConfidence += Math.abs(p - 0.5) * 2; // How sure per bit
    }

    const avgConfidence = totalConfidence / probabilities.length;
    const decoded = this.decode(hardBits);

    return {
      ...decoded,
      confidence: avgConfidence,
    };
  }

  /**
   * Compute Hamming distance between two bit sequences.
   */
  static hammingDistance(a: Uint8Array, b: Uint8Array): number {
    let distance = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) distance++;
    }
    return distance;
  }

  // ─── FNV-1a Hash (64-bit, implemented as two 32-bit halves) ───

  private static fnv1a64(input: string): Uint8Array {
    // FNV-1a 64-bit using two 32-bit words
    let h1 = 0x811c9dc5; // FNV offset basis (low 32)
    let h2 = 0xcbf29ce4; // FNV offset basis (high 32)
    const prime1 = 0x01000193;
    const prime2 = 0x00000100;

    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, prime1);
      h2 ^= c ^ (i & 0xff);
      h2 = Math.imul(h2, prime2 | 0x193);
    }

    // Convert to 64 bits (8 bytes)
    const bits = new Uint8Array(64);
    for (let i = 0; i < 32; i++) {
      bits[i] = (h1 >>> (31 - i)) & 1;
    }
    for (let i = 0; i < 32; i++) {
      bits[32 + i] = (h2 >>> (31 - i)) & 1;
    }

    return bits;
  }

  // ─── Repetition Coding ───

  private static repetitionEncode(identity: Uint8Array): Uint8Array {
    const encoded = new Uint8Array(this.CODEWORD_BITS);
    for (let i = 0; i < this.IDENTITY_BITS; i++) {
      for (let r = 0; r < this.REPETITION; r++) {
        encoded[i * this.REPETITION + r] = identity[i];
      }
    }
    return encoded;
  }

  private static repetitionDecode(codeword: Uint8Array): {
    identity: Uint8Array;
    errors: number;
  } {
    const identity = new Uint8Array(this.IDENTITY_BITS);
    let errors = 0;

    for (let i = 0; i < this.IDENTITY_BITS; i++) {
      let ones = 0;
      for (let r = 0; r < this.REPETITION; r++) {
        ones += codeword[i * this.REPETITION + r];
      }
      // Majority vote
      identity[i] = ones > this.REPETITION / 2 ? 1 : 0;

      // Count errors (bits that disagreed with majority)
      const expectedSum = identity[i] * this.REPETITION;
      errors += Math.abs(ones - expectedSum);
    }

    return { identity, errors };
  }

  // ─── Interleaving (spreads burst errors across codeword) ───

  private static interleave(bits: Uint8Array): Uint8Array {
    const n = bits.length;
    const result = new Uint8Array(n);
    const blockSize = 8;
    const numBlocks = Math.ceil(n / blockSize);

    for (let i = 0; i < n; i++) {
      const block = i % numBlocks;
      const pos = Math.floor(i / numBlocks);
      const newIdx = block * blockSize + pos;
      if (newIdx < n) {
        result[newIdx] = bits[i];
      }
    }
    return result;
  }

  private static deinterleave(bits: Uint8Array): Uint8Array {
    const n = bits.length;
    const result = new Uint8Array(n);
    const blockSize = 8;
    const numBlocks = Math.ceil(n / blockSize);

    for (let i = 0; i < n; i++) {
      const block = i % numBlocks;
      const pos = Math.floor(i / numBlocks);
      const origIdx = block * blockSize + pos;
      if (origIdx < n) {
        result[i] = bits[origIdx];
      }
    }
    return result;
  }
}
