// Deterministic randomness. Everything the generator does is seeded from
// (profile, dateRange, purpose) so the same inputs produce byte-identical output
// -- including UUIDs, arrival-lag jitter, and which samples get retracted. That
// makes a wrong-looking dashboard reproducible and debuggable, and lets anchored
// query replays be consistent (see the generator spec).
//
// No Math.random anywhere. Seed via a stable string; derive independent streams
// by namespacing the seed string (e.g. `${userSeed}:hrv:2026-07-26`).

/** FNV-1a 32-bit string hash -> uint32 seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, well-distributed PRNG. Returns uniforms in [0, 1). */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
  }

  /** Fork an independent stream namespaced by `label` (reproducible). */
  fork(label: string): Rng {
    return new Rng((this.state ^ hashSeed(label)) >>> 0);
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }

  /** Bernoulli: true with probability p. */
  bool(p: number): boolean {
    return this.next() < p;
  }

  /** Standard normal via Box-Muller. */
  normalStd(): number {
    // u1 in (0,1] to avoid log(0).
    const u1 = 1 - this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Normal with given mean and sd. */
  normal(mean: number, sd: number): number {
    return mean + sd * this.normalStd();
  }

  /**
   * Log-normal parameterised by MEDIAN and coefficient of variation (CV), the
   * form the calibration file uses (see #11/#15). For a log-normal, median =
   * exp(mu), and CV = sqrt(exp(sigma^2) - 1), so sigma = sqrt(ln(1 + CV^2)).
   */
  lognormalMedianCv(median: number, cv: number): number {
    const sigma = Math.sqrt(Math.log(1 + cv * cv));
    const mu = Math.log(median);
    return Math.exp(mu + sigma * this.normalStd());
  }
}

/**
 * Deterministic RFC-4122-shaped v4 UUID (uppercase, as Apple Health exports use)
 * derived from an Rng stream. Not cryptographically random -- reproducibility is
 * the point. Version nibble = 4, variant = 8..b.
 */
export function deterministicUuid(rng: Rng): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(rng.int(0, 255).toString(16).padStart(2, "0"));
  hex[6] = ((parseInt(hex[6], 16) & 0x0f) | 0x40).toString(16).padStart(2, "0");
  hex[8] = ((parseInt(hex[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
}
