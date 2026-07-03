import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineDistance, recencyWeight, selectDiverse, type Candidate } from "./vector.ts";

test("cosineDistance is 0 for identical unit vectors and 2 for opposites", () => {
  assert.equal(cosineDistance([1, 0], [1, 0]), 0);
  assert.equal(cosineDistance([1, 0], [-1, 0]), 2);
  assert.equal(cosineDistance([1, 0], [0, 1]), 1);
});

test("recencyWeight halves at the half-life", () => {
  assert.equal(recencyWeight(0, 48), 1);
  assert.ok(Math.abs(recencyWeight(48, 48) - 0.5) < 1e-9);
  assert.ok(recencyWeight(96, 48) < recencyWeight(48, 48));
});

test("selectDiverse seeds with the highest-weight candidate", () => {
  const cands: Candidate[] = [
    { embedding: [1, 0], weight: 0.2 },
    { embedding: [0, 1], weight: 0.9 },
  ];
  const picked = selectDiverse(cands, { limit: 1 });
  assert.deepEqual(picked, [1]);
});

test("selectDiverse spreads picks across vector space", () => {
  // Two tight clusters. A diverse pick should take one from each cluster
  // before doubling up within a cluster.
  const cands: Candidate[] = [
    { embedding: [1, 0], weight: 1 },
    { embedding: [0.99, 0.01], weight: 0.95 },
    { embedding: [0, 1], weight: 0.5 },
  ];
  const picked = selectDiverse(cands, { limit: 2 });
  assert.deepEqual(picked, [0, 2]);
});

test("selectDiverse honors offset and limit for pagination", () => {
  const cands: Candidate[] = [
    { embedding: [1, 0], weight: 1 },
    { embedding: [0, 1], weight: 0.5 },
    { embedding: [-1, 0], weight: 0.4 },
  ];
  const all = selectDiverse(cands, { limit: 3 });
  const page2 = selectDiverse(cands, { limit: 1, offset: 1 });
  assert.equal(all.length, 3);
  assert.deepEqual(page2, [all[1]]);
});

test("selectDiverse returns empty for no candidates", () => {
  assert.deepEqual(selectDiverse([], { limit: 5 }), []);
});
