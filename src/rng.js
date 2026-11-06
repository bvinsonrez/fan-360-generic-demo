// Deterministic seeded PRNG helpers.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted pick. Falls back to the last positively weighted item on float drift.
function pick(rand, items, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let x = rand() * total;
  let last = items.length - 1;
  for (let i = 0; i < items.length; i++) {
    if (weights[i] > 0) last = i;
    x -= weights[i];
    if (x < 0 && weights[i] > 0) return items[i];
  }
  return items[last];
}

// Inclusive integer in [lo, hi].
function intBetween(rand, lo, hi) {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

module.exports = { mulberry32, pick, intBetween };
