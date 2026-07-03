// Pure-JavaScript diversity sampler for the recent-news feed.
//
// This is the v1 reference implementation. It is intentionally dependency-free
// so a future C++ Node native module can drop in behind the same `selectDiverse`
// signature without touching the feed route or the front end.

export interface Candidate {
  // L2-normalized embedding (unit length). Cosine distance reduces to 1 - dot.
  embedding: number[];
  // Recency weight in (0, 1]; higher means fresher / more preferred.
  weight: number;
}

export interface SelectOptions {
  limit: number;
  offset?: number;
}

// Exponential recency decay. `ageHours` and `halfLifeHours` are in hours.
export function recencyWeight(ageHours: number, halfLifeHours: number): number {
  return Math.exp((-Math.LN2 * ageHours) / halfLifeHours);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

// Cosine distance for unit vectors: 1 - cosine similarity, clamped to [0, 2].
export function cosineDistance(a: number[], b: number[]): number {
  return 1 - dot(a, b);
}

// Weighted farthest-point sampling. Seeds with the highest-weight candidate,
// then greedily picks the item maximizing `weight * distanceToNearestSelected`.
// Returns the chosen indices, sliced by offset/limit for pagination.
export function selectDiverse(candidates: Candidate[], opts: SelectOptions): number[] {
  const n = candidates.length;
  const offset = Math.max(opts.offset ?? 0, 0);
  const take = Math.min(opts.limit + offset, n);
  if (n === 0 || take === 0) return [];

  const chosen: number[] = [];
  const picked = new Array<boolean>(n).fill(false);
  // Distance from each candidate to the nearest already-chosen candidate.
  const minDist = new Array<number>(n).fill(Infinity);

  let seed = 0;
  for (let i = 1; i < n; i++) {
    if (candidates[i]!.weight > candidates[seed]!.weight) seed = i;
  }
  chosen.push(seed);
  picked[seed] = true;

  while (chosen.length < take) {
    const last = candidates[chosen[chosen.length - 1]!]!.embedding;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      if (picked[i]) continue;
      const cand = candidates[i]!;
      const d = cosineDistance(cand.embedding, last);
      if (d < minDist[i]!) minDist[i] = d;
      const score = cand.weight * minDist[i]!;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1) break;
    chosen.push(best);
    picked[best] = true;
  }

  return chosen.slice(offset, offset + opts.limit);
}
