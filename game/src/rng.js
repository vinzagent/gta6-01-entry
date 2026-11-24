// A small seeded random number generator (mulberry32). The whole simulation draws from one of
// these streams, never from Math.random, so a screenshot scene built from a seed is the same
// frame every time it is captured, and the live game can be replayed seed for seed.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random helpers built on a mulberry32 stream: ranges, picks and shuffles that stay seeded. */
export class Rng {
  constructor(seed) {
    this.next = createRandom(seed);
  }
  float() {
    return this.next();
  }
  range(min, max) {
    return min + (max - min) * this.next();
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  chance(p) {
    return this.next() < p;
  }
  /** A shuffled copy of `list` (Fisher–Yates on this stream); the input is untouched. */
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  /** Weighted pick: entries are [value, weight] pairs; heavier entries win more often. */
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let roll = this.next() * total;
    for (const [value, w] of pairs) {
      roll -= w;
      if (roll <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }
}
